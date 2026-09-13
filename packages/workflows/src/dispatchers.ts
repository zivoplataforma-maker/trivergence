import { createHash } from "node:crypto";

import {
  capabilityDescriptorSchema,
  executionDescriptorSchema,
  type CapabilityDescriptor,
  type ExecutionDescriptor,
  type PlannedStep,
} from "@trivergence/contracts";
import {
  agentTeamResultSchema,
  coordinationBudgetSchema,
  coordinationCapabilityIds,
  coordinationInputSchema,
  memoryCommitResultSchema,
  workflowCandidateSchema,
  workflowEvaluationResultSchema,
} from "@trivergence/coordination-contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type {
  DispatchContext,
  DispatchResult,
  StepDispatcher,
} from "@trivergence/runtime";

import type { WorkflowEngine } from "./workflow-engine.js";

const VERSION = "1.0.0";
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");
const emptyDigest = digest({});
const buildDigest = digest("@trivergence/workflows@1.0.0");

const budgetFrom = (context: DispatchContext) =>
  coordinationBudgetSchema.parse(
    coordinationInputSchema.parse(
      context.request.capabilityInputs?.[
        coordinationCapabilityIds.workflowEvaluation
      ] ?? {},
    ),
  );

const descriptor = (step: PlannedStep, target: string): ExecutionDescriptor =>
  executionDescriptorSchema.parse({
    version: "1",
    kind: "internal",
    capabilityId: step.capabilityId,
    capabilityVersion: VERSION,
    subsystem: "workflow",
    summary: step.action.summary,
    argv: [],
    environmentNames: [],
    environmentDigest: emptyDigest,
    networkDestinations: [],
    targets: [target],
  });

export class WorkflowSynthesisDispatcher implements StepDispatcher {
  readonly subsystem = "workflow" as const;
  readonly capabilityId = coordinationCapabilityIds.workflowSynthesis;

  constructor(private readonly workflow: WorkflowEngine) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return descriptor(step, "workflow.local.team-memory-evaluation@1.0.0");
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const dependencyId = context.step.dependsOn[0];
    const team = agentTeamResultSchema.parse(
      dependencyId ? context.outputs[dependencyId] : undefined,
    );
    const result = workflowCandidateSchema.parse(
      await this.workflow.synthesize({
        goal: context.request.goal,
        team,
        budget: budgetFrom(context),
        signal: context.signal,
      }),
    );
    return {
      outcome: result.initialEvaluation.passed ? "succeeded" : "failed",
      summary: result.initialEvaluation.passed
        ? "Workflow synthesis passed bounded evaluation"
        : "Workflow synthesis failed bounded evaluation",
      output: result,
      outputDigest: digest(result),
      treeTerminationConfirmed: true,
    };
  }
}

export class WorkflowEvaluationDispatcher implements StepDispatcher {
  readonly subsystem = "workflow" as const;
  readonly capabilityId = coordinationCapabilityIds.workflowEvaluation;

  constructor(private readonly workflow: WorkflowEngine) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return descriptor(step, "auditable-workflow-result");
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const dependencyId = context.step.dependsOn[0];
    const memory = memoryCommitResultSchema.parse(
      dependencyId ? context.outputs[dependencyId] : undefined,
    );
    const result = workflowEvaluationResultSchema.parse(
      this.workflow.evaluate(memory),
    );
    return {
      outcome: result.outcome === "accepted" ? "succeeded" : "failed",
      summary: `Workflow result ${result.outcome}`,
      output: result,
      outputDigest: digest(result),
      treeTerminationConfirmed: true,
    };
  }
}

const provenance = {
  publisher: "@trivergence/workflows",
  observedAt: "2026-09-10T00:00:00.000Z",
  observationDigest: buildDigest,
  attestationDigest: buildDigest,
  reason: "Workflow local declarativo, versionado y limitado por budgets.",
};

export function createWorkflowCapabilities(): CapabilityDescriptor[] {
  return [
    capabilityDescriptorSchema.parse({
      id: coordinationCapabilityIds.workflowSynthesis,
      version: VERSION,
      displayName: "Sintetizar workflow local",
      subsystem: "workflow",
      status: "available",
      mode: "structured",
      action: {
        tool: "workflow.synthesize",
        toolVersion: VERSION,
        kinds: ["execute"],
        risk: "guarded",
        summary: "Sintetizar y replanificar como máximo una vez",
      },
      dependencies: [coordinationCapabilityIds.agentTeam],
      provenance,
    }),
    capabilityDescriptorSchema.parse({
      id: coordinationCapabilityIds.workflowEvaluation,
      version: VERSION,
      displayName: "Evaluar resultado de workflow",
      subsystem: "workflow",
      status: "available",
      mode: "structured",
      action: {
        tool: "workflow.evaluate",
        toolVersion: VERSION,
        kinds: ["read"],
        risk: "safe",
        summary: "Evaluar integridad, provenance y resultado final",
      },
      dependencies: [coordinationCapabilityIds.memoryCommit],
      routing: {
        objectiveTerms: [
          "coordinar",
          "workflow",
          "equipo de agentes",
          "agentes",
          "memoria",
          "evaluar resultado",
          "sintetizar",
        ],
        priority: 80,
      },
      provenance,
    }),
  ];
}
