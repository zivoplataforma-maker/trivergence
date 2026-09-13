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
  memoryRecallResultSchema,
} from "@trivergence/coordination-contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type {
  DispatchContext,
  DispatchResult,
  StepDispatcher,
} from "@trivergence/runtime";

import type { AgentTeam } from "./agent-team.js";

const VERSION = "1.0.0";
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");
const buildDigest = digest("@trivergence/agents@1.0.0");
const emptyDigest = digest({});

export class AgentTeamDispatcher implements StepDispatcher {
  readonly subsystem = "agent" as const;
  readonly capabilityId = coordinationCapabilityIds.agentTeam;

  constructor(private readonly team: AgentTeam) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return executionDescriptorSchema.parse({
      version: "1",
      kind: "internal",
      capabilityId: this.capabilityId,
      capabilityVersion: VERSION,
      subsystem: this.subsystem,
      summary: step.action.summary,
      argv: [],
      environmentNames: [],
      environmentDigest: emptyDigest,
      networkDestinations: [],
      targets: ["local-reference-agent-team"],
    });
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const dependencyId = context.step.dependsOn[0];
    const memory = memoryRecallResultSchema.parse(
      dependencyId ? context.outputs[dependencyId] : undefined,
    );
    const budget = coordinationBudgetSchema.parse(
      coordinationInputSchema.parse(
        context.request.capabilityInputs?.[
          coordinationCapabilityIds.workflowEvaluation
        ] ?? {},
      ),
    );
    const result = agentTeamResultSchema.parse(
      await this.team.execute({
        goal: context.request.goal,
        memory,
        budget,
        signal: context.signal,
      }),
    );
    return {
      outcome: "succeeded",
      summary: `Agent team completed ${result.contributions.length} role(s)`,
      output: result,
      outputDigest: digest(result),
      treeTerminationConfirmed: true,
    };
  }
}

export function createAgentCapabilities(): CapabilityDescriptor[] {
  return [
    capabilityDescriptorSchema.parse({
      id: coordinationCapabilityIds.agentTeam,
      version: VERSION,
      displayName: "Equipo local de agentes",
      subsystem: "agent",
      status: "available",
      mode: "structured",
      action: {
        tool: "agents.executeTeam",
        toolVersion: VERSION,
        kinds: ["execute"],
        risk: "guarded",
        summary: "Ejecutar roles acotados con el Reference Provider local",
      },
      dependencies: [coordinationCapabilityIds.memoryRecall],
      provenance: {
        publisher: "@trivergence/agents",
        observedAt: "2026-09-10T00:00:00.000Z",
        observationDigest: buildDigest,
        attestationDigest: buildDigest,
        reason:
          "Equipo de roles sin autoridad de policy y limitado al proveedor local.",
      },
    }),
  ];
}
