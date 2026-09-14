import { createHash } from "node:crypto";

import {
  capabilityDescriptorSchema,
  executionDescriptorSchema,
  type CapabilityDescriptor,
  type ExecutionDescriptor,
  type PlannedStep,
} from "@trivergence/contracts";
import {
  coordinationBudgetSchema,
  coordinationCapabilityIds,
  coordinationInputSchema,
  memoryCommitResultSchema,
  workflowCandidateSchema,
} from "@trivergence/coordination-contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type {
  DispatchContext,
  DispatchResult,
  StepDispatcher,
} from "@trivergence/runtime";

import type { MemoryService } from "./memory-service.js";

const VERSION = "1.0.0";
const buildDigest = createHash("sha256")
  .update("@trivergence/memory@1.0.0", "utf8")
  .digest("hex");
const emptyDigest = createHash("sha256")
  .update(canonicalizeJson({}), "utf8")
  .digest("hex");
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");

const budgetFrom = (context: DispatchContext) =>
  coordinationBudgetSchema.parse(
    coordinationInputSchema.parse(
      context.request.capabilityInputs?.[
        coordinationCapabilityIds.workflowEvaluation
      ] ?? {},
    ),
  );

const descriptor = (step: PlannedStep, targets: readonly string[]) =>
  executionDescriptorSchema.parse({
    version: "1",
    kind: "internal",
    capabilityId: step.capabilityId,
    capabilityVersion: VERSION,
    subsystem: "memory",
    summary: step.action.summary,
    argv: [],
    environmentNames: [],
    environmentDigest: emptyDigest,
    networkDestinations: [],
    targets,
  });

export class MemoryRecallDispatcher implements StepDispatcher {
  readonly subsystem = "memory" as const;
  readonly capabilityId = coordinationCapabilityIds.memoryRecall;

  constructor(private readonly memory: MemoryService) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return descriptor(step, ["workspace-scoped-memory"]);
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const result = this.memory.recall(
      context.request.workspaceId ?? `request:${context.request.id}`,
      budgetFrom(context),
      context.request.privacyMode === "standard",
    );
    return {
      outcome: "succeeded",
      summary: `Recalled ${result.items.length} bounded memory item(s)`,
      output: result,
      outputDigest: digest(result),
      treeTerminationConfirmed: true,
    };
  }
}

export class MemoryCommitDispatcher implements StepDispatcher {
  readonly subsystem = "memory" as const;
  readonly capabilityId = coordinationCapabilityIds.memoryCommit;

  constructor(private readonly memory: MemoryService) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return descriptor(step, ["workspace-scoped-memory"]);
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const dependencyId = context.step.dependsOn[0];
    const candidate = workflowCandidateSchema.parse(
      dependencyId ? context.outputs[dependencyId] : undefined,
    );
    const result = this.memory.commit({
      namespace: context.request.workspaceId ?? `request:${context.request.id}`,
      runId: context.runId,
      planId: context.planId,
      stepId: context.step.id,
      candidate,
      budget: budgetFrom(context),
      persist: context.request.privacyMode === "standard",
    });
    const parsed = memoryCommitResultSchema.parse(result);
    return {
      outcome: "succeeded",
      summary: "Committed workflow result to bounded local memory",
      output: parsed,
      outputDigest: digest(parsed),
      treeTerminationConfirmed: true,
    };
  }
}

const provenance = {
  publisher: "@trivergence/memory",
  observedAt: "2026-09-10T00:00:00.000Z",
  observationDigest: buildDigest,
  attestationDigest: buildDigest,
  reason: "Subsistema local con retención, borrado y provenance explícitos.",
};

export function createMemoryCapabilities(): CapabilityDescriptor[] {
  return [
    capabilityDescriptorSchema.parse({
      id: coordinationCapabilityIds.memoryRecall,
      version: VERSION,
      displayName: "Recuperar memoria local acotada",
      subsystem: "memory",
      status: "available",
      mode: "structured",
      action: {
        tool: "memory.recall",
        toolVersion: VERSION,
        kinds: ["read"],
        risk: "safe",
        summary: "Recuperar contexto local vigente y acotado",
      },
      dependencies: [],
      provenance,
    }),
    capabilityDescriptorSchema.parse({
      id: coordinationCapabilityIds.memoryCommit,
      version: VERSION,
      displayName: "Persistir memoria de workflow",
      subsystem: "memory",
      status: "available",
      mode: "structured",
      action: {
        tool: "memory.commit",
        toolVersion: VERSION,
        kinds: ["write"],
        risk: "guarded",
        summary: "Persistir resultado con retención y provenance",
      },
      dependencies: [coordinationCapabilityIds.workflowSynthesis],
      provenance,
    }),
  ];
}
