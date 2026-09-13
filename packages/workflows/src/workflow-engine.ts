import { createHash, randomUUID } from "node:crypto";

import type { AgentTeam } from "@trivergence/agents";
import {
  workflowCandidateSchema,
  workflowEvaluationResultSchema,
  type AgentTeamResult,
  type CoordinationBudget,
  type MemoryCommitResult,
  type WorkflowCandidate,
  type WorkflowEvaluationResult,
} from "@trivergence/coordination-contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export interface WorkflowEngineOptions {
  readonly idFactory?: () => string;
}

export class WorkflowEngine {
  readonly #idFactory: () => string;

  constructor(
    private readonly team: AgentTeam,
    options: WorkflowEngineOptions = {},
  ) {
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  async synthesize(input: {
    readonly goal: string;
    readonly team: AgentTeamResult;
    readonly budget: CoordinationBudget;
    readonly signal: AbortSignal;
  }): Promise<WorkflowCandidate> {
    const { provenanceDigest: teamDigest, ...teamBase } = input.team;
    if (sha256(canonicalizeJson(teamBase)) !== teamDigest) {
      throw new Error("Agent team provenance digest mismatch");
    }
    if (input.team.goalDigest !== sha256(input.goal)) {
      throw new Error("Agent team goal digest mismatch");
    }
    if (
      input.team.contributions.some(
        (contribution) =>
          sha256(contribution.response) !== contribution.responseDigest,
      )
    ) {
      throw new Error("Agent contribution response digest mismatch");
    }
    const aggregate = input.team.contributions.reduce(
      (total, contribution) => ({
        inputBytes: total.inputBytes + contribution.inputBytes,
        outputBytes: total.outputBytes + contribution.outputBytes,
        costMicrounits: total.costMicrounits + contribution.costMicrounits,
      }),
      { inputBytes: 0, outputBytes: 0, costMicrounits: 0 },
    );
    if (
      input.team.providerCalls !== input.team.contributions.length ||
      input.team.inputBytes !== aggregate.inputBytes ||
      input.team.outputBytes !== aggregate.outputBytes ||
      input.team.costMicrounits !== aggregate.costMicrounits
    ) {
      throw new Error("Agent team usage aggregate mismatch");
    }
    let candidate = input.team.contributions.at(-1)?.response ?? "";
    let replansUsed = 0;
    let replanContribution:
      Awaited<ReturnType<AgentTeam["repair"]>> | undefined;
    let checks = this.#candidateChecks(candidate, input.team, input.budget);
    const remaining = {
      calls: input.budget.maxProviderCalls - input.team.providerCalls,
      inputBytes: input.budget.maxInputBytes - input.team.inputBytes,
      outputBytes: input.budget.maxOutputBytes - input.team.outputBytes,
      costMicrounits:
        input.budget.maxCostMicrounits - input.team.costMicrounits,
      timeoutMs: input.budget.timeoutMs - input.team.elapsedMs,
    };
    if (
      checks.some((check) => !check.passed) &&
      input.budget.maxReplans > 0 &&
      remaining.calls > 0 &&
      remaining.inputBytes > 0 &&
      remaining.outputBytes > 0 &&
      remaining.costMicrounits >= 0 &&
      remaining.timeoutMs >= 10
    ) {
      const repaired = await this.team.repair({
        goal: input.goal,
        candidate,
        budget: {
          ...input.budget,
          maxProviderCalls: remaining.calls,
          maxInputBytes: remaining.inputBytes,
          maxOutputBytes: remaining.outputBytes,
          maxCostMicrounits: remaining.costMicrounits,
          timeoutMs: remaining.timeoutMs,
        },
        signal: input.signal,
      });
      if (sha256(repaired.response) !== repaired.responseDigest) {
        throw new Error("Agent replan response digest mismatch");
      }
      candidate = repaired.response;
      replanContribution = repaired;
      replansUsed = 1;
      checks = this.#candidateChecks(candidate, input.team, input.budget);
    }
    const usage = {
      providerCalls: input.team.providerCalls + replansUsed,
      inputBytes: input.team.inputBytes + (replanContribution?.inputBytes ?? 0),
      outputBytes:
        input.team.outputBytes + (replanContribution?.outputBytes ?? 0),
      costMicrounits:
        input.team.costMicrounits + (replanContribution?.costMicrounits ?? 0),
      elapsedMs: input.team.elapsedMs + (replanContribution?.elapsedMs ?? 0),
      memoryItems: input.team.memoryItems,
      memoryBytes: input.team.memoryBytes,
    };
    if (
      usage.providerCalls > input.budget.maxProviderCalls ||
      usage.inputBytes > input.budget.maxInputBytes ||
      usage.outputBytes > input.budget.maxOutputBytes ||
      usage.costMicrounits > input.budget.maxCostMicrounits ||
      usage.elapsedMs > input.budget.timeoutMs ||
      usage.memoryItems > input.budget.maxMemoryItems ||
      usage.memoryBytes > input.budget.maxMemoryBytes
    ) {
      throw new Error("Workflow replan exceeded the shared budget");
    }
    const initialEvaluation = {
      passed: checks.every((check) => check.passed),
      checks: checks.map(
        (check) => `${check.id}:${check.passed ? "passed" : "failed"}`,
      ),
    };
    const base = {
      schemaVersion: "1" as const,
      workflowId: this.#idFactory(),
      definitionId: "workflow.local.team-memory-evaluation" as const,
      workflowVersion: "1.0.0" as const,
      stages: ["recall", "team", "synthesize", "commit", "evaluate"] as const,
      candidate,
      candidateDigest: sha256(candidate),
      agentTeamDigest: input.team.provenanceDigest,
      initialEvaluation,
      replansUsed,
      ...(replanContribution ? { replanContribution } : {}),
      budget: input.budget,
      usage,
    };
    return workflowCandidateSchema.parse({
      ...base,
      provenanceDigest: sha256(canonicalizeJson(base)),
    });
  }

  evaluate(memory: MemoryCommitResult): WorkflowEvaluationResult {
    const { provenanceDigest: candidateDigest, ...candidateBase } =
      memory.candidate;
    const expectedMemoryEnvelopeDigest = sha256(
      canonicalizeJson({
        entry: memory.entry,
        candidate: memory.candidate.provenanceDigest,
      }),
    );
    const checks = [
      {
        id: "workflow-evaluation",
        passed: memory.candidate.initialEvaluation.passed,
        evidence: memory.candidate.initialEvaluation.checks.join(", "),
      },
      {
        id: "memory-integrity",
        passed:
          memory.entry.contentDigest === memory.candidate.candidateDigest &&
          sha256(memory.entry.content) === memory.entry.contentDigest,
        evidence: `memory=${memory.entry.contentDigest}`,
      },
      {
        id: "provider-boundary",
        passed:
          memory.entry.provenance.providerId === "reference" &&
          memory.entry.provenance.providerLocalOnly,
        evidence: "provider=reference localOnly=true",
      },
      {
        id: "provenance-chain",
        passed:
          memory.entry.provenance.agentTeamDigest ===
            memory.candidate.agentTeamDigest &&
          memory.entry.provenance.workflowId === memory.candidate.workflowId &&
          memory.entry.provenance.workflowVersion ===
            memory.candidate.workflowVersion,
        evidence: `team=${memory.candidate.agentTeamDigest}`,
      },
      {
        id: "candidate-provenance",
        passed: sha256(canonicalizeJson(candidateBase)) === candidateDigest,
        evidence: `candidate=${candidateDigest}`,
      },
      {
        id: "memory-envelope",
        passed: memory.provenanceDigest === expectedMemoryEnvelopeDigest,
        evidence: `memory-envelope=${memory.provenanceDigest}`,
      },
    ];
    const outcome = checks.every((check) => check.passed)
      ? "accepted"
      : "rejected";
    const base = {
      schemaVersion: "1" as const,
      outcome,
      result: memory.entry.content,
      checks,
      workflowId: memory.candidate.workflowId,
      memoryEntryId: memory.entry.id,
      memoryContentDigest: memory.entry.contentDigest,
      agentTeamDigest: memory.candidate.agentTeamDigest,
      budget: memory.candidate.budget,
      usage: {
        ...memory.candidate.usage,
        replansUsed: memory.candidate.replansUsed,
      },
    };
    return workflowEvaluationResultSchema.parse({
      ...base,
      provenanceDigest: sha256(canonicalizeJson(base)),
    });
  }

  #candidateChecks(
    candidate: string,
    team: AgentTeamResult,
    budget: CoordinationBudget,
  ) {
    return [
      { id: "candidate-present", passed: candidate.trim().length >= 32 },
      {
        id: "team-contributed",
        passed: team.contributions.length >= 1,
      },
      {
        id: "output-budget",
        passed: Buffer.byteLength(candidate, "utf8") <= budget.maxOutputBytes,
      },
      {
        id: "cost-budget",
        passed: team.costMicrounits <= budget.maxCostMicrounits,
      },
    ];
  }
}
