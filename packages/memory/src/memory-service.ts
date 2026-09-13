import { createHash, randomUUID } from "node:crypto";

import {
  memoryCommitResultSchema,
  memoryItemSchema,
  memoryProvenanceSchema,
  memoryRecallResultSchema,
  type CoordinationBudget,
  type MemoryCommitResult,
  type MemoryRecallResult,
  type WorkflowCandidate,
} from "@trivergence/coordination-contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type { PersistenceStore } from "@trivergence/persistence";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const bytes = (value: string) => Buffer.byteLength(value, "utf8");

export interface MemoryServiceOptions {
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export class MemoryService {
  readonly #clock: () => Date;
  readonly #idFactory: () => string;

  constructor(
    private readonly persistence: PersistenceStore,
    options: MemoryServiceOptions = {},
  ) {
    this.#clock = options.clock ?? (() => new Date());
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  recall(namespace: string, budget: CoordinationBudget): MemoryRecallResult {
    const rows = this.persistence.listMemoryEntries(
      namespace,
      this.#clock().toISOString(),
      Math.max(1, budget.maxMemoryItems || 1),
    );
    const items = [];
    let totalBytes = 0;
    let truncated = rows.length > budget.maxMemoryItems;
    for (const row of rows) {
      if (items.length >= budget.maxMemoryItems) {
        truncated = true;
        break;
      }
      const nextBytes = bytes(row.content);
      if (totalBytes + nextBytes > budget.maxMemoryBytes) {
        truncated = true;
        break;
      }
      if (sha256(row.content) !== row.contentDigest) {
        throw new Error("Memory content digest mismatch");
      }
      items.push(
        memoryItemSchema.parse({
          id: row.id,
          content: row.content,
          contentDigest: row.contentDigest,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          provenance: memoryProvenanceSchema.parse(row.provenance),
        }),
      );
      totalBytes += nextBytes;
    }
    const provenanceDigest = sha256(
      canonicalizeJson(
        items.map((item) => ({
          id: item.id,
          contentDigest: item.contentDigest,
          expiresAt: item.expiresAt,
        })),
      ),
    );
    return memoryRecallResultSchema.parse({
      schemaVersion: "1",
      namespace,
      items,
      bytes: totalBytes,
      truncated,
      provenanceDigest,
    });
  }

  commit(input: {
    readonly namespace: string;
    readonly runId: string;
    readonly planId: string;
    readonly stepId: string;
    readonly candidate: WorkflowCandidate;
    readonly budget: CoordinationBudget;
  }): MemoryCommitResult {
    if (sha256(input.candidate.candidate) !== input.candidate.candidateDigest) {
      throw new Error("Workflow candidate content digest mismatch");
    }
    const { provenanceDigest, ...candidateBase } = input.candidate;
    if (sha256(canonicalizeJson(candidateBase)) !== provenanceDigest) {
      throw new Error("Workflow candidate provenance digest mismatch");
    }
    const createdAt = this.#clock();
    const expiresAt = new Date(
      createdAt.getTime() + input.budget.retentionDays * 86_400_000,
    );
    const provenance = memoryProvenanceSchema.parse({
      sourceRunId: input.runId,
      sourcePlanId: input.planId,
      sourceStepId: input.stepId,
      workflowId: input.candidate.workflowId,
      workflowVersion: input.candidate.workflowVersion,
      agentTeamDigest: input.candidate.agentTeamDigest,
      providerId: "reference",
      providerLocalOnly: true,
    });
    const entry = memoryItemSchema.parse({
      id: this.#idFactory(),
      content: input.candidate.candidate,
      contentDigest: input.candidate.candidateDigest,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      provenance,
    });
    this.persistence.saveMemoryEntry({
      id: entry.id,
      namespace: input.namespace,
      subjectDigest: sha256(input.candidate.workflowId),
      content: entry.content,
      contentDigest: entry.contentDigest,
      provenance,
      sourceRunId: input.runId,
      sourcePlanId: input.planId,
      sourceStepId: input.stepId,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    });
    return memoryCommitResultSchema.parse({
      schemaVersion: "1",
      entry,
      candidate: input.candidate,
      provenanceDigest: sha256(
        canonicalizeJson({
          entry,
          candidate: input.candidate.provenanceDigest,
        }),
      ),
    });
  }

  forget(entryId: string): void {
    this.persistence.deleteMemoryEntry(entryId, this.#clock().toISOString());
  }

  pruneExpired(): number {
    return this.persistence.pruneExpiredMemory(this.#clock().toISOString());
  }
}
