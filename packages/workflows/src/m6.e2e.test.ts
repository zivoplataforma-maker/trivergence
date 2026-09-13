import { createHash, randomUUID } from "node:crypto";

import {
  AgentTeam,
  AgentTeamDispatcher,
  createAgentCapabilities,
} from "@trivergence/agents";
import {
  coordinationBudgetSchema,
  coordinationCapabilityIds,
  workflowCandidateSchema,
  workflowEvaluationResultSchema,
} from "@trivergence/coordination-contracts";
import {
  createMemoryCapabilities,
  MemoryCommitDispatcher,
  MemoryRecallDispatcher,
  MemoryService,
} from "@trivergence/memory";
import {
  CapabilityRegistry,
  canonicalizeJson,
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import {
  AdapterHost,
  createReferenceProviderCapability,
  ReferenceProviderAdapter,
  referenceProviderCapabilityId,
  trustedProviderAttestationDigests,
} from "@trivergence/provider-adapters";
import { RuntimeEngine } from "@trivergence/runtime";
import { describe, expect, it } from "vitest";

import {
  createWorkflowCapabilities,
  WorkflowEvaluationDispatcher,
  WorkflowSynthesisDispatcher,
} from "./dispatchers.js";
import { WorkflowEngine } from "./workflow-engine.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

describe("M6 vertical flow", () => {
  it("orchestrates agents, workflow, memory and evaluation into auditable evidence", async () => {
    const store = PersistenceStore.open(":memory:");
    const workspaceId = randomUUID();
    const memory = new MemoryService(store);
    const provider = new ReferenceProviderAdapter();
    const host = new AdapterHost([
      {
        capabilityId: referenceProviderCapabilityId,
        capabilityVersion: createReferenceProviderCapability().version,
        adapter: provider,
      },
    ]);
    const team = new AgentTeam(host, referenceProviderCapabilityId);
    const workflow = new WorkflowEngine(team);
    const capabilities = [
      createReferenceProviderCapability(),
      ...createMemoryCapabilities(),
      ...createAgentCapabilities(),
      ...createWorkflowCapabilities(),
    ];
    const registry = new CapabilityRegistry("m6-e2e-1", capabilities);
    const engine = new OrchestrationEngine(registry, randomUUID, sha256);
    const goal = "Diseñar un plan local de verificación para el flujo M6";
    const budget = coordinationBudgetSchema.parse({});
    const preview = engine.preview({
      id: randomUUID(),
      goal,
      profile: "assistant",
      workspaceId,
      requestedCapabilities: [coordinationCapabilityIds.workflowEvaluation],
      capabilityInputs: {
        [coordinationCapabilityIds.workflowEvaluation]: budget,
      },
    });
    expect(preview.strategy.kind).toBe("sequential");
    expect(preview.plan.steps.map((step) => step.capabilityId)).toEqual([
      coordinationCapabilityIds.memoryRecall,
      coordinationCapabilityIds.agentTeam,
      coordinationCapabilityIds.workflowSynthesis,
      coordinationCapabilityIds.memoryCommit,
      coordinationCapabilityIds.workflowEvaluation,
    ]);
    expect(preview.evaluation.status).toBe("approval_required");
    store.persistPreview(preview);
    const runtime = new RuntimeEngine({
      persistence: store,
      dispatchers: [
        new MemoryRecallDispatcher(memory),
        new AgentTeamDispatcher(team),
        new WorkflowSynthesisDispatcher(workflow),
        new MemoryCommitDispatcher(memory),
        new WorkflowEvaluationDispatcher(workflow),
      ],
      revalidate: (candidate) => engine.revalidate(candidate),
      evaluatePolicy,
      sha256,
    });
    const approvalIds: Record<string, string> = {};
    for (const step of preview.plan.steps.filter(
      (candidate) => candidate.policy.decision === "require_approval",
    )) {
      const approval = runtime.requestApproval(preview, step.id);
      runtime.decideApproval(approval.id, "grant", "m6-e2e-user");
      approvalIds[step.id] = approval.id;
    }

    const execution = await runtime.execute(preview, { approvalIds });
    const finalStep = preview.plan.steps.at(-1)!;
    const output = workflowEvaluationResultSchema.parse(
      execution.outputs?.[finalStep.id],
    );

    expect(execution).toMatchObject({ status: "completed", evidenceCount: 5 });
    expect(output.outcome).toBe("accepted");
    expect(output.checks.every((check) => check.passed)).toBe(true);
    expect(store.listEvidence(execution.runId!)).toHaveLength(5);
    expect(memory.recall(workspaceId, budget).items).toHaveLength(1);
    expect(trustedProviderAttestationDigests).toEqual([]);
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(goal);
    expect(store.verifyAuditChain().valid).toBe(true);

    memory.forget(output.memoryEntryId);
    expect(memory.recall(workspaceId, budget).items).toHaveLength(0);
    expect(
      store
        .listAuditEvents()
        .some((event) => event.eventType === "memory.entry_deleted"),
    ).toBe(true);
    const synthesisStep = preview.plan.steps.find(
      (step) =>
        step.capabilityId === coordinationCapabilityIds.workflowSynthesis,
    )!;
    const commitStep = preview.plan.steps.find(
      (step) => step.capabilityId === coordinationCapabilityIds.memoryCommit,
    )!;
    memory.commit({
      namespace: workspaceId,
      runId: execution.runId!,
      planId: preview.plan.id,
      stepId: commitStep.id,
      candidate: workflowCandidateSchema.parse(
        execution.outputs?.[synthesisStep.id],
      ),
      budget,
    });
    expect(
      store.pruneExpiredMemory(
        new Date(Date.now() + 31 * 86_400_000).toISOString(),
      ),
    ).toBe(1);
    expect(
      store
        .listAuditEvents()
        .some((event) => event.eventType === "memory.expired_pruned"),
    ).toBe(true);
    expect(sha256(canonicalizeJson(output))).toHaveLength(64);
    store.close();
  });
});
