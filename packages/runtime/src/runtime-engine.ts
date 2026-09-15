import { randomUUID } from "node:crypto";

import {
  approvalRecordSchema,
  executionRunSchema,
  orchestrationPreviewSchema,
  policyDecisionSchema,
  revalidationResultSchema,
  runtimeStreamEventSchema,
  stepEvidenceSchema,
  type ApprovalRecord,
  type AuditEventType,
  type AuditPayload,
  type ExecutionRun,
  type OrchestrationPreview,
  type PlanExecutionBinding,
  type PlannedStep,
  type PolicyDecision,
  type ProviderCheckpointRecord,
  type RevalidationResult,
  type RuntimeStreamEvent,
  type StepEvidence,
} from "@trivergence/contracts";
import {
  canonicalizeJson,
  type DigestFunction,
} from "@trivergence/orchestration-engine";

import { createApprovalDigest } from "./approval-digest.js";
import {
  DispatcherRegistry,
  type DispatchContext,
  type DispatchResult,
  type StepDispatcher,
} from "./dispatcher-registry.js";

export interface RuntimePersistence {
  assertPrivilegedActionsAvailable(): void;
  findPlanBinding(planId: string): PlanExecutionBinding | undefined;
  createRun(run: ExecutionRun): void;
  findRun(runId: string): ExecutionRun | undefined;
  updateRunStatus(
    runId: string,
    nextStatus: ExecutionRun["status"],
    updatedAt: string,
  ): ExecutionRun;
  recoverRunningRuns(updatedAt: string): string[];
  appendEvidence(evidence: StepEvidence): void;
  saveProviderCheckpoint(
    checkpoint: ProviderCheckpointRecord,
  ): ProviderCheckpointRecord;
  findProviderCheckpoint(
    checkpointId: string,
  ): ProviderCheckpointRecord | undefined;
  consumeProviderCheckpoint(
    checkpointId: string,
    consumedAt: string,
  ): ProviderCheckpointRecord;
  createApproval(approval: ApprovalRecord): ApprovalRecord;
  findApproval(approvalId: string): ApprovalRecord | undefined;
  decideApproval(
    approvalId: string,
    decision: "grant" | "deny",
    actor: string,
    decidedAt: string,
  ): ApprovalRecord;
  consumeApproval(
    approvalId: string,
    expectedActionDigest: string,
    consumedAt: string,
  ): ApprovalRecord;
  appendAuditEvent(
    eventType: AuditEventType,
    subjectId: string,
    payload: AuditPayload,
  ): unknown;
}

export interface RuntimeDependencies {
  readonly persistence: RuntimePersistence;
  readonly dispatchers: readonly StepDispatcher[];
  readonly revalidate: (preview: OrchestrationPreview) => RevalidationResult;
  readonly evaluatePolicy: (
    profile: OrchestrationPreview["request"]["profile"],
    action: PlannedStep["action"],
  ) => PolicyDecision;
  readonly sha256: DigestFunction;
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export interface RuntimeExecutionOptions {
  readonly approvalIds?: Readonly<Record<string, string>>;
  /** UUID generado por el host para poder cancelar antes de completar el invoke. */
  readonly runId?: string;
  /** Stream efímero y validado; los observers no pueden alterar la ejecución. */
  readonly onEvent?: (event: RuntimeStreamEvent) => void;
  /** IDs opacos de checkpoints persistidos; se consumen una sola vez. */
  readonly recoveryCheckpointIds?: Readonly<Record<string, string>>;
}

export interface RuntimeExecutionResult {
  readonly status:
    | "completed"
    | "blocked"
    | "approval_required"
    | "failed"
    | "cancelled"
    | "timed_out"
    | "orphaned";
  readonly reason: string;
  readonly runId?: string;
  readonly evidenceCount: number;
  /** Resultados efímeros por step. La persistencia solo recibe su digest. */
  readonly outputs?: Readonly<Record<string, unknown>>;
}

interface ResolvedStep {
  readonly step: PlannedStep;
  readonly dispatcher: StepDispatcher;
  readonly descriptor: ReturnType<DispatcherRegistry["describe"]>;
  readonly policy: PolicyDecision;
  readonly approvalDigest?: string;
}

const sameCanonicalValue = (left: unknown, right: unknown) =>
  canonicalizeJson(left) === canonicalizeJson(right);

const deepFreeze = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
};

/** Creates a detached snapshot so a dispatcher cannot mutate runtime state. */
const immutableSnapshot = <T>(value: T): T =>
  deepFreeze(structuredClone(value)) as T;

export class RuntimeEngine {
  readonly #persistence: RuntimePersistence;
  readonly #dispatchers: DispatcherRegistry;
  readonly #revalidate: RuntimeDependencies["revalidate"];
  readonly #evaluatePolicy: RuntimeDependencies["evaluatePolicy"];
  readonly #sha256: DigestFunction;
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  readonly #activeRuns = new Map<
    string,
    { readonly controller: AbortController; readonly planId: string }
  >();

  constructor(dependencies: RuntimeDependencies) {
    this.#persistence = dependencies.persistence;
    this.#dispatchers = new DispatcherRegistry(dependencies.dispatchers);
    this.#revalidate = dependencies.revalidate;
    this.#evaluatePolicy = dependencies.evaluatePolicy;
    this.#sha256 = dependencies.sha256;
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#idFactory = dependencies.idFactory ?? randomUUID;
  }

  requestApproval(
    input: OrchestrationPreview,
    stepId: string,
    ttlMs = 5 * 60_000,
  ): ApprovalRecord {
    if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 15 * 60_000) {
      throw new Error("Approval TTL must be between 1 second and 15 minutes");
    }
    const preview = this.#validatePreview(input);
    if (preview.evaluation.status === "blocked") {
      throw new Error("A blocked plan cannot request approval");
    }
    const resolved = this.#resolveSteps(preview).find(
      (candidate) => candidate.step.id === stepId,
    );
    if (!resolved) throw new Error(`Planned step not found: ${stepId}`);
    if (resolved.policy.decision !== "require_approval") {
      throw new Error("Only approval-required steps can request approval");
    }
    const requestedAt = this.#clock();
    return this.#persistence.createApproval(
      approvalRecordSchema.parse({
        id: this.#idFactory(),
        planId: preview.plan.id,
        stepId,
        actionDigest: resolved.approvalDigest,
        planDigest: preview.planIntegrity.digest,
        rulesetVersion: resolved.policy.rulesetVersion,
        descriptor: resolved.descriptor,
        status: "pending",
        requestedAt: requestedAt.toISOString(),
        expiresAt: new Date(requestedAt.getTime() + ttlMs).toISOString(),
      }),
    );
  }

  decideApproval(
    approvalId: string,
    decision: "grant" | "deny",
    actor: string,
  ): ApprovalRecord {
    const normalizedActor = actor.trim();
    if (!normalizedActor || normalizedActor.length > 120) {
      throw new Error("Approval actor must contain 1 to 120 characters");
    }
    return this.#persistence.decideApproval(
      approvalId,
      decision,
      normalizedActor,
      this.#clock().toISOString(),
    );
  }

  async execute(
    input: OrchestrationPreview,
    options: RuntimeExecutionOptions = {},
  ): Promise<RuntimeExecutionResult> {
    let preview: OrchestrationPreview;
    let resolvedSteps: ResolvedStep[];
    try {
      preview = this.#validatePreview(input);
      resolvedSteps = this.#resolveSteps(preview);
    } catch (error) {
      return this.#blocked(
        input.plan?.id ?? input.request?.id ?? "unknown",
        error,
        input.request?.privacyMode !== "standard",
      );
    }

    const denied = resolvedSteps.find(
      (resolved) => resolved.policy.decision === "deny",
    );
    if (preview.evaluation.status === "blocked" || denied) {
      return this.#blocked(
        preview.plan.id,
        new Error(denied?.policy.reason ?? preview.evaluation.reason),
        preview.request.privacyMode !== "standard",
      );
    }

    for (const resolved of resolvedSteps) {
      if (resolved.policy.decision !== "require_approval") continue;
      const approvalId = options.approvalIds?.[resolved.step.id];
      const approval = approvalId
        ? this.#persistence.findApproval(approvalId)
        : undefined;
      const approvalExpired =
        approval?.status === "granted" &&
        Date.parse(approval.expiresAt) <= this.#clock().getTime();
      const currentApproval =
        approvalExpired && approvalId && resolved.approvalDigest
          ? this.#persistence.consumeApproval(
              approvalId,
              resolved.approvalDigest,
              this.#clock().toISOString(),
            )
          : approval;
      if (
        !currentApproval ||
        currentApproval.status !== "granted" ||
        currentApproval.planId !== preview.plan.id ||
        currentApproval.stepId !== resolved.step.id ||
        currentApproval.planDigest !== preview.planIntegrity.digest ||
        currentApproval.actionDigest !== resolved.approvalDigest ||
        currentApproval.rulesetVersion !== resolved.policy.rulesetVersion ||
        !sameCanonicalValue(currentApproval.descriptor, resolved.descriptor)
      ) {
        if (currentApproval?.status === "denied") {
          return this.#blocked(
            preview.plan.id,
            new Error(`Approval denied for ${resolved.step.id}`),
            preview.request.privacyMode !== "standard",
          );
        }
        return {
          status: "approval_required",
          reason: currentApproval
            ? `Approval is not usable: ${currentApproval.status}`
            : `Approval required for ${resolved.step.id}`,
          evidenceCount: 0,
        };
      }
    }

    if (
      [...this.#activeRuns.values()].some(
        (active) => active.planId === preview.plan.id,
      )
    ) {
      return this.#blocked(
        preview.plan.id,
        new Error("This plan already has an active execution"),
        preview.request.privacyMode !== "standard",
      );
    }

    const now = this.#clock().toISOString();
    const run = executionRunSchema.parse({
      id: options.runId ?? this.#idFactory(),
      requestId: preview.request.id,
      planId: preview.plan.id,
      registrySnapshotId: preview.registrySnapshot.id,
      planDigest: preview.planIntegrity.digest,
      status: "planned",
      createdAt: now,
      updatedAt: now,
    });
    this.#persistence.createRun(run);
    if (
      resolvedSteps.some((step) => step.policy.decision === "require_approval")
    ) {
      this.#persistence.updateRunStatus(
        run.id,
        "approved",
        this.#clock().toISOString(),
      );
    }
    this.#persistence.updateRunStatus(
      run.id,
      "running",
      this.#clock().toISOString(),
    );

    const controller = new AbortController();
    this.#activeRuns.set(run.id, { controller, planId: preview.plan.id });
    const completedSteps = new Set<string>();
    let evidenceCount = 0;
    const outputs: Record<string, unknown> = {};
    try {
      for (const initial of resolvedSteps) {
        if (!initial.step.dependsOn.every((id) => completedSteps.has(id))) {
          throw new Error(`Dependencies are incomplete for ${initial.step.id}`);
        }
        this.#persistence.assertPrivilegedActionsAvailable();
        const currentPreview = this.#validatePreview(preview);
        const current = this.#resolveStep(currentPreview, initial.step);
        if (!sameCanonicalValue(current.descriptor, initial.descriptor)) {
          throw new Error(
            `Execution descriptor changed for ${initial.step.id}`,
          );
        }
        if (current.policy.decision === "require_approval") {
          const approvalId = options.approvalIds?.[initial.step.id];
          if (!approvalId || !current.approvalDigest) {
            throw new Error(`Approval missing for ${initial.step.id}`);
          }
          const consumed = this.#persistence.consumeApproval(
            approvalId,
            current.approvalDigest,
            this.#clock().toISOString(),
          );
          if (consumed.status !== "consumed") {
            throw new Error(`Approval cannot be consumed: ${consumed.status}`);
          }
        }

        const recoveryId = options.recoveryCheckpointIds?.[initial.step.id];
        const recovery = recoveryId
          ? this.#resolveRecovery(current, preview.plan.id, recoveryId)
          : undefined;
        if (recoveryId) {
          this.#persistence.consumeProviderCheckpoint(
            recoveryId,
            this.#clock().toISOString(),
          );
        }
        let latestCheckpointRecordId: string | undefined;
        const dependencyOutputs = Object.fromEntries(
          current.step.dependsOn.flatMap((stepId) =>
            Object.hasOwn(outputs, stepId) ? [[stepId, outputs[stepId]]] : [],
          ),
        );
        const dispatchContext: DispatchContext = {
          runId: run.id,
          planId: run.planId,
          request: immutableSnapshot(currentPreview.request),
          step: immutableSnapshot(current.step),
          descriptor: immutableSnapshot(current.descriptor),
          outputs: immutableSnapshot(dependencyOutputs),
          signal: controller.signal,
          emit: (event) => {
            if (event.type === "checkpoint") {
              const providerRequest = current.descriptor.providerRequest;
              if (!providerRequest) {
                throw new Error(
                  "Only provider descriptors can persist checkpoints",
                );
              }
              const saved = this.#persistence.saveProviderCheckpoint({
                id: this.#idFactory(),
                runId: run.id,
                planId: run.planId,
                stepId: current.step.id,
                capabilityId: current.step.capabilityId,
                adapterId: providerRequest.adapterId,
                providerId: providerRequest.providerId,
                requestDigest: providerRequest.requestDigest,
                checkpoint: event.checkpoint,
                status: "active",
                observedAt: event.observedAt,
              });
              latestCheckpointRecordId = saved.id;
            }
            const parsed = runtimeStreamEventSchema.parse({
              runId: run.id,
              planId: run.planId,
              stepId: current.step.id,
              capabilityId: current.step.capabilityId,
              event,
              ...(latestCheckpointRecordId && event.type === "checkpoint"
                ? { checkpointRecordId: latestCheckpointRecordId }
                : {}),
            });
            try {
              options.onEvent?.(parsed);
            } catch {
              // Un observer de progreso nunca controla el resultado del run.
            }
          },
        };
        const result = recovery
          ? await current.dispatcher.recover!(
              dispatchContext,
              recovery.checkpoint,
            )
          : await current.dispatcher.dispatch(dispatchContext);
        this.#validateDispatchResult(result);
        this.#appendEvidence(
          run,
          current,
          result,
          preview.request.privacyMode !== "standard",
        );
        if (result.outcome === "succeeded" && latestCheckpointRecordId) {
          this.#persistence.consumeProviderCheckpoint(
            latestCheckpointRecordId,
            this.#clock().toISOString(),
          );
        }
        evidenceCount += 1;
        if (result.output !== undefined) {
          outputs[initial.step.id] = immutableSnapshot(result.output);
        }
        if (result.treeTerminationConfirmed === false) {
          return this.#finishRun(
            run.id,
            "orphaned",
            "Process tree termination could not be confirmed",
            evidenceCount,
            outputs,
          );
        }
        if (result.outcome !== "succeeded") {
          const status =
            result.outcome === "timed_out"
              ? "timed_out"
              : result.outcome === "cancelled"
                ? "cancelled"
                : "failed";
          return this.#finishRun(
            run.id,
            status,
            preview.request.privacyMode !== "standard"
              ? `Private ${current.step.subsystem} step ${result.outcome}`
              : result.summary,
            evidenceCount,
            outputs,
          );
        }
        completedSteps.add(initial.step.id);
      }
      return this.#finishRun(
        run.id,
        "completed",
        "Execution completed",
        evidenceCount,
        outputs,
      );
    } catch (error) {
      const status = controller.signal.aborted ? "cancelled" : "failed";
      return this.#finishRun(
        run.id,
        status,
        preview.request.privacyMode !== "standard"
          ? "Private execution failed safely"
          : error instanceof Error
            ? error.message
            : "Runtime execution failed",
        evidenceCount,
        outputs,
      );
    } finally {
      this.#activeRuns.delete(run.id);
    }
  }

  cancel(runId: string): boolean {
    const active = this.#activeRuns.get(runId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  recoverOrphans(): string[] {
    return this.#persistence.recoverRunningRuns(this.#clock().toISOString());
  }

  #validatePreview(input: OrchestrationPreview): OrchestrationPreview {
    this.#persistence.assertPrivilegedActionsAvailable();
    const preview = orchestrationPreviewSchema.parse(input);
    const revalidation = revalidationResultSchema.parse(
      this.#revalidate(preview),
    );
    if (!revalidation.valid) {
      throw new Error("Orchestration preview revalidation failed");
    }
    const binding = this.#persistence.findPlanBinding(preview.plan.id);
    if (
      !binding ||
      binding.requestId !== preview.request.id ||
      binding.registrySnapshotId !== preview.registrySnapshot.id ||
      binding.planDigest !== preview.planIntegrity.digest ||
      binding.evaluationStatus !== preview.evaluation.status
    ) {
      throw new Error("Persisted plan binding does not match the preview");
    }
    return preview;
  }

  #resolveSteps(preview: OrchestrationPreview): ResolvedStep[] {
    return preview.plan.steps.map((step) => this.#resolveStep(preview, step));
  }

  #resolveStep(preview: OrchestrationPreview, step: PlannedStep): ResolvedStep {
    const policy = policyDecisionSchema.parse(
      this.#evaluatePolicy(preview.request.profile, step.action),
    );
    if (!sameCanonicalValue(policy, step.policy)) {
      throw new Error(`Policy changed for ${step.id}`);
    }
    const dispatcher = this.#dispatchers.resolve(step);
    const descriptor = this.#dispatchers.describe(step);
    if (
      preview.request.privacyMode !== "standard" &&
      (step.action.kinds.includes("network") ||
        descriptor.networkDestinations.length > 0 ||
        descriptor.providerRequest?.context.networkRequired)
    ) {
      throw new Error(`Private mode blocks network execution for ${step.id}`);
    }
    return {
      step,
      dispatcher,
      descriptor,
      policy,
      ...(policy.decision === "require_approval"
        ? {
            approvalDigest: createApprovalDigest(
              preview,
              step,
              descriptor,
              this.#sha256,
            ),
          }
        : {}),
    };
  }

  #resolveRecovery(
    resolved: ResolvedStep,
    planId: string,
    checkpointId: string,
  ): ProviderCheckpointRecord {
    const checkpoint = this.#persistence.findProviderCheckpoint(checkpointId);
    const providerRequest = resolved.descriptor.providerRequest;
    if (!checkpoint || checkpoint.status !== "active") {
      throw new Error("Provider recovery checkpoint is not active");
    }
    if (
      !providerRequest ||
      checkpoint.planId !== planId ||
      checkpoint.stepId !== resolved.step.id ||
      checkpoint.capabilityId !== resolved.step.capabilityId ||
      checkpoint.adapterId !== providerRequest.adapterId ||
      checkpoint.providerId !== providerRequest.providerId ||
      checkpoint.requestDigest !== providerRequest.requestDigest ||
      !resolved.dispatcher.recover
    ) {
      throw new Error("Provider recovery checkpoint does not match the plan");
    }
    return checkpoint;
  }

  #appendEvidence(
    run: ExecutionRun,
    resolved: ResolvedStep,
    result: DispatchResult,
    privateMode: boolean,
  ): void {
    this.#persistence.appendEvidence(
      stepEvidenceSchema.parse({
        id: this.#idFactory(),
        runId: run.id,
        planId: run.planId,
        stepId: resolved.step.id,
        capabilityId: resolved.step.capabilityId,
        subsystem: resolved.step.subsystem,
        capabilityVersion: resolved.descriptor.capabilityVersion,
        outcome: result.outcome,
        observedAt: this.#clock().toISOString(),
        summary: privateMode
          ? `Private ${resolved.step.subsystem} step ${result.outcome}`
          : result.summary,
        ...(result.outputDigest ? { outputDigest: result.outputDigest } : {}),
      }),
    );
  }

  #validateDispatchResult(result: DispatchResult): void {
    if (result.output === undefined) return;
    const serialized = canonicalizeJson(result.output);
    if (Buffer.byteLength(serialized, "utf8") > 8 * 1_048_576) {
      throw new Error("Dispatcher output exceeds the ephemeral result limit");
    }
    if (
      !result.outputDigest ||
      result.outputDigest !== this.#sha256(serialized)
    ) {
      throw new Error("Dispatcher output digest does not match its result");
    }
  }

  #finishRun(
    runId: string,
    status: Exclude<
      RuntimeExecutionResult["status"],
      "blocked" | "approval_required"
    >,
    reason: string,
    evidenceCount: number,
    outputs: Readonly<Record<string, unknown>>,
  ): RuntimeExecutionResult {
    this.#persistence.updateRunStatus(
      runId,
      status,
      this.#clock().toISOString(),
    );
    return { status, reason, runId, evidenceCount, outputs };
  }

  #blocked(
    subjectId: string,
    error: unknown,
    privateMode: boolean,
  ): RuntimeExecutionResult {
    const reason = privateMode
      ? "Private execution blocked safely"
      : error instanceof Error
        ? error.message
        : "Execution blocked";
    try {
      this.#persistence.appendAuditEvent("execution.blocked", subjectId, {
        reason,
      });
    } catch {
      // The original validation error remains the authoritative failure.
    }
    return { status: "blocked", reason, evidenceCount: 0 };
  }
}
