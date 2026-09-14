import { createHash, randomUUID } from "node:crypto";

import {
  capabilityDescriptorSchema,
  executionRunSchema,
} from "@trivergence/contracts";
import {
  coordinationBudgetSchema,
  workflowCandidateSchema,
} from "@trivergence/coordination-contracts";
import {
  CapabilityRegistry,
  canonicalizeJson,
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { describe, expect, it } from "vitest";

import { createMemoryCapabilities } from "./dispatchers.js";
import { MemoryService } from "./memory-service.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

describe("MemoryService", () => {
  it("enforces retention, explicit deletion and content-free audit events", () => {
    let now = new Date("2026-09-10T12:00:00.000Z");
    const store = PersistenceStore.open(":memory:", { clock: () => now });
    const commitCapability = capabilityDescriptorSchema.parse({
      ...createMemoryCapabilities()[1]!,
      dependencies: [],
    });
    const registry = new CapabilityRegistry("memory-test-1", [
      commitCapability,
    ]);
    const engine = new OrchestrationEngine(registry, randomUUID, sha256);
    const workspaceId = randomUUID();
    const preview = engine.preview({
      id: randomUUID(),
      goal: "Persistir memoria verificable",
      profile: "developer",
      workspaceId,
      requestedCapabilities: [commitCapability.id],
    });
    store.persistPreview(preview);
    const run = executionRunSchema.parse({
      id: randomUUID(),
      requestId: preview.request.id,
      planId: preview.plan.id,
      registrySnapshotId: preview.registrySnapshot.id,
      planDigest: preview.planIntegrity.digest,
      status: "planned",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    store.createRun(run);
    store.updateRunStatus(run.id, "running", now.toISOString());
    const budget = coordinationBudgetSchema.parse({ retentionDays: 2 });
    const candidateBase = {
      schemaVersion: "1",
      workflowId: randomUUID(),
      definitionId: "workflow.local.team-memory-evaluation",
      workflowVersion: "1.0.0",
      stages: ["recall", "team", "synthesize", "commit", "evaluate"],
      candidate: "Memoria explícita con contenido suficiente para la prueba.",
      candidateDigest: sha256(
        "Memoria explícita con contenido suficiente para la prueba.",
      ),
      agentTeamDigest: "1".repeat(64),
      initialEvaluation: { passed: true, checks: ["candidate-present:passed"] },
      replansUsed: 0,
      budget,
      usage: {
        providerCalls: 1,
        inputBytes: 10,
        outputBytes: 60,
        costMicrounits: 0,
        elapsedMs: 1,
        memoryItems: 0,
        memoryBytes: 0,
      },
    } as const;
    const candidate = workflowCandidateSchema.parse({
      ...candidateBase,
      provenanceDigest: sha256(canonicalizeJson(candidateBase)),
    });
    let sequence = 0;
    const memory = new MemoryService(store, {
      clock: () => now,
      idFactory: () =>
        `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    });
    const first = memory.commit({
      namespace: workspaceId,
      runId: run.id,
      planId: preview.plan.id,
      stepId: preview.plan.steps[0]!.id,
      candidate,
      budget,
    });
    expect(memory.recall(workspaceId, budget).items).toHaveLength(1);
    memory.forget(first.entry.id);
    expect(memory.recall(workspaceId, budget).items).toHaveLength(0);

    const privateResult = memory.commit({
      namespace: workspaceId,
      runId: run.id,
      planId: preview.plan.id,
      stepId: preview.plan.steps[0]!.id,
      candidate,
      budget,
      persist: false,
    });
    expect(privateResult.entry.content).toBe(candidate.candidate);
    expect(memory.recall(workspaceId, budget).items).toHaveLength(0);

    memory.commit({
      namespace: workspaceId,
      runId: run.id,
      planId: preview.plan.id,
      stepId: preview.plan.steps[0]!.id,
      candidate,
      budget,
    });
    expect(memory.recall(workspaceId, budget, false).items).toHaveLength(0);
    now = new Date("2026-09-13T12:00:00.000Z");
    expect(memory.pruneExpired()).toBe(1);
    expect(memory.recall(workspaceId, budget).items).toHaveLength(0);
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(
      candidate.candidate,
    );
    expect(store.verifyAuditChain().valid).toBe(true);
    expect(sha256(canonicalizeJson(first))).toHaveLength(64);

    expect(() =>
      memory.commit({
        namespace: workspaceId,
        runId: run.id,
        planId: preview.plan.id,
        stepId: preview.plan.steps[0]!.id,
        candidate: { ...candidate, candidateDigest: "f".repeat(64) },
        budget,
      }),
    ).toThrow(/content digest mismatch/u);
    store.close();
  });
});
