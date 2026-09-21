import {
  classifyOperationEffect,
  executionPlanSchema,
  type CapabilityDescriptor,
  type ExecutionPlan,
  type OrchestrationRequest,
  type PlanIssue,
  type PlannedStep,
  type StrategyDecision,
} from "@trivergence/contracts";
import { evaluatePolicy } from "@trivergence/policy-engine";

import type { CapabilityRegistry } from "./capability-registry.js";

const MAX_PLAN_STEPS = 256;

export type IdFactory = () => string;

export class ExecutionPlanner {
  constructor(private readonly createId: IdFactory) {}

  plan(
    request: OrchestrationRequest,
    strategy: StrategyDecision,
    registry: CapabilityRegistry,
  ): ExecutionPlan {
    const issues: PlanIssue[] = [];
    const ordered: CapabilityDescriptor[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    if (strategy.kind === "unavailable") {
      issues.push({
        code: "strategy_unavailable",
        message: strategy.reason,
      });
    } else {
      for (const capabilityId of strategy.capabilityIds) {
        this.visit(capabilityId, registry, visiting, visited, ordered, issues);
      }
    }

    const stepIdByCapability = new Map(
      ordered.map((capability, index) => [capability.id, `step-${index + 1}`]),
    );
    const steps: PlannedStep[] = ordered.map((capability) => {
      const input = request.capabilityInputs?.[capability.id];
      const action = {
        id: this.createId(),
        ...capability.action,
        effectClass: classifyOperationEffect(capability.action),
        ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
        ...(input ? { input } : {}),
      };
      return {
        id: stepIdByCapability.get(capability.id) ?? "step-invalid",
        capabilityId: capability.id,
        subsystem: capability.subsystem,
        dependsOn: capability.dependencies.flatMap((dependencyId) => {
          const stepId = stepIdByCapability.get(dependencyId);
          return stepId ? [stepId] : [];
        }),
        action,
        policy: evaluatePolicy(request.profile, action),
      };
    });

    return executionPlanSchema.parse({
      id: this.createId(),
      requestId: request.id,
      strategy,
      steps,
      issues,
      plannerVersion: "1",
    });
  }

  private visit(
    capabilityId: string,
    registry: CapabilityRegistry,
    visiting: Set<string>,
    visited: Set<string>,
    ordered: CapabilityDescriptor[],
    issues: PlanIssue[],
  ): void {
    if (visited.has(capabilityId)) return;
    if (visiting.has(capabilityId)) {
      issues.push({
        code: "dependency_cycle",
        capabilityId,
        message: `Se detectó un ciclo de dependencias en ${capabilityId}.`,
      });
      return;
    }
    const capability = registry.get(capabilityId);
    if (!capability) {
      issues.push({
        code: "capability_missing",
        capabilityId,
        message: `La capacidad ${capabilityId} no existe en el Registry.`,
      });
      return;
    }
    if (
      capability.status === "unavailable" ||
      capability.status === "disabled"
    ) {
      issues.push({
        code: "capability_unavailable",
        capabilityId,
        message: `La capacidad ${capabilityId} está ${capability.status}.`,
      });
      return;
    }

    visiting.add(capabilityId);
    for (const dependencyId of capability.dependencies) {
      this.visit(dependencyId, registry, visiting, visited, ordered, issues);
    }
    visiting.delete(capabilityId);

    if (!issues.some((issue) => issue.capabilityId === capabilityId)) {
      if (ordered.length >= MAX_PLAN_STEPS) {
        if (!issues.some((issue) => issue.code === "plan_limit_exceeded")) {
          issues.push({
            code: "plan_limit_exceeded",
            capabilityId,
            message: `El plan supera el límite de ${MAX_PLAN_STEPS} pasos.`,
          });
        }
        return;
      }
      visited.add(capabilityId);
      ordered.push(capability);
    }
  }
}
