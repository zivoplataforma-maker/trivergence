import {
  orchestrationPreviewSchema,
  orchestrationRequestSchema,
  type OrchestrationPreview,
  type OrchestrationRequest,
  type ProjectContextSnapshot,
  type ExecutionOutcomeEvaluation,
  type ExecutionRun,
  type RevalidationResult,
  type StepEvidence,
  type PlannedStep,
} from "@trivergence/contracts";

import type { CapabilityRegistry } from "./capability-registry.js";
import { EvaluationEngine } from "./evaluation-engine.js";
import { ExecutionPlanner, type IdFactory } from "./execution-planner.js";
import { IntegrityEngine, type DigestFunction } from "./integrity-engine.js";
import {
  ProjectContextBuilder,
  type ProjectContextBuildOptions,
} from "./project-context-builder.js";
import { StrategyEngine } from "./strategy-engine.js";
import type { AgentProfileCatalog } from "./agent-profile-catalog.js";

export class OrchestrationEngine {
  readonly #strategy: StrategyEngine;
  readonly #planner: ExecutionPlanner;
  readonly #evaluation = new EvaluationEngine();
  readonly #integrity: IntegrityEngine;
  readonly #projectContext: ProjectContextBuilder;

  constructor(
    private readonly registry: CapabilityRegistry,
    createId: IdFactory,
    digest: DigestFunction,
    readonly agentProfiles?: AgentProfileCatalog,
  ) {
    this.#strategy = new StrategyEngine(agentProfiles);
    this.#planner = new ExecutionPlanner(createId, agentProfiles);
    this.#integrity = new IntegrityEngine(digest);
    this.#projectContext = new ProjectContextBuilder(
      registry,
      () => this.#integrity.createRegistrySnapshot(registry),
      digest,
    );
  }

  buildProjectContext(
    input: OrchestrationRequest,
    options: ProjectContextBuildOptions = {},
  ): ProjectContextSnapshot {
    return this.#projectContext.build(input, {
      ...options,
      ...(this.agentProfiles
        ? {
            relevantCapabilityIds: [
              ...(options.relevantCapabilityIds ?? []),
              ...this.agentProfiles.relevantCapabilityIds(input, this.registry),
            ],
          }
        : {}),
    });
  }

  preview(
    input: OrchestrationRequest,
    contextOptions: ProjectContextBuildOptions = {},
  ): OrchestrationPreview {
    const request = orchestrationRequestSchema.parse(input);
    const projectContext = this.buildProjectContext(request, contextOptions);
    const strategy = this.#strategy.select(
      request,
      this.registry,
      projectContext,
    );
    const plan = this.#planner.plan(
      request,
      strategy,
      this.registry,
      projectContext,
    );
    const evaluation = this.#evaluation.evaluatePreflight(plan);
    const registrySnapshot = this.#integrity.createRegistrySnapshot(
      this.registry,
    );
    const planIntegrity = this.#integrity.createPlanIntegrity({
      request,
      projectContext,
      registrySnapshot,
      strategy,
      plan,
      evaluation,
    });

    return orchestrationPreviewSchema.parse({
      request,
      projectContext,
      registryVersion: this.registry.version,
      registrySnapshot,
      strategy,
      plan,
      evaluation,
      planIntegrity,
    });
  }

  revalidate(preview: OrchestrationPreview): RevalidationResult {
    return this.#integrity.revalidate(preview, this.registry);
  }

  assertAgentProfileBinding(
    step: PlannedStep,
    context: ProjectContextSnapshot,
  ): void {
    if (!this.agentProfiles) {
      if (step.agentProfiles?.length) {
        throw new Error("Agent profile catalog is unavailable");
      }
      return;
    }
    this.agentProfiles.assertStep(step, context, this.registry);
  }

  evaluateOutcome(
    preview: OrchestrationPreview,
    run: ExecutionRun,
    evidence: readonly StepEvidence[],
  ): ExecutionOutcomeEvaluation {
    return this.#evaluation.evaluateOutcome(preview, run, evidence);
  }
}
