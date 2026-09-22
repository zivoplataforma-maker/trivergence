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

export class OrchestrationEngine {
  readonly #strategy = new StrategyEngine();
  readonly #planner: ExecutionPlanner;
  readonly #evaluation = new EvaluationEngine();
  readonly #integrity: IntegrityEngine;
  readonly #projectContext: ProjectContextBuilder;

  constructor(
    private readonly registry: CapabilityRegistry,
    createId: IdFactory,
    digest: DigestFunction,
  ) {
    this.#planner = new ExecutionPlanner(createId);
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
    return this.#projectContext.build(input, options);
  }

  preview(
    input: OrchestrationRequest,
    contextOptions: ProjectContextBuildOptions = {},
  ): OrchestrationPreview {
    const request = orchestrationRequestSchema.parse(input);
    const projectContext = this.#projectContext.build(request, contextOptions);
    const strategy = this.#strategy.select(
      request,
      this.registry,
      projectContext,
    );
    const plan = this.#planner.plan(request, strategy, this.registry);
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

  evaluateOutcome(
    preview: OrchestrationPreview,
    run: ExecutionRun,
    evidence: readonly StepEvidence[],
  ): ExecutionOutcomeEvaluation {
    return this.#evaluation.evaluateOutcome(preview, run, evidence);
  }
}
