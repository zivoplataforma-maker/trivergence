import { randomUUID } from "node:crypto";

import {
  approvalRecordSchema,
  branchExecutionStateSchema,
  branchGroupSchema,
  classifyOperationEffect,
  fanInResultSchema,
  durableWorkflowExecutionSchema,
  durableWorkflowStepSchema,
  executionRunSchema,
  orchestrationPreviewSchema,
  policyDecisionSchema,
  revalidationResultSchema,
  runtimeStreamEventSchema,
  stepEvidenceSchema,
  type ApprovalRecord,
  type AuditEventType,
  type AuditPayload,
  type BranchExecutionState,
  type BranchGroup,
  type ContextSliceManifest,
  type DurableWorkflowExecution,
  type DurableWorkflowStep,
  type ExecutionRun,
  type FanInResult,
  type OrchestrationPreview,
  type PlanExecutionBinding,
  type PlannedStep,
  type PolicyDecision,
  type ProviderCheckpointRecord,
  type ProviderExecutionAttempt,
  type RevalidationResult,
  type RuntimeStreamEvent,
  type StepEvidence,
} from "@trivergence/contracts";
import {
  canonicalizeJson,
  ContextSliceBuilder,
  type DigestFunction,
} from "@trivergence/orchestration-engine";

import { createApprovalDigest } from "./approval-digest.js";
import {
  DispatcherRegistry,
  type DispatchContext,
  type DispatchResult,
  type StepDispatcher,
} from "./dispatcher-registry.js";

export interface RuntimeBranchGroupRecord {
  readonly runId: string;
  readonly groupId: string;
  readonly groupDigest: string;
  readonly lifecycle:
    | "pending"
    | "running"
    | "confirmed"
    | "degraded"
    | "blocked"
    | "failed"
    | "cancelled"
    | "budget_exhausted";
  readonly maxConcurrency: number;
  readonly maxProviderCalls: number;
  readonly maxOutputBytes: number;
  readonly providerCallsUsed: number;
  readonly outputBytesObserved: number;
  readonly cancelRequested: boolean;
  readonly fanIn?: FanInResult;
  readonly revision: number;
}

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
  createDurableWorkflow(
    workflow: DurableWorkflowExecution,
    steps: readonly DurableWorkflowStep[],
  ): void;
  findDurableWorkflow(runId: string): DurableWorkflowExecution | undefined;
  listDurableWorkflowSteps(runId: string): DurableWorkflowStep[];
  updateDurableWorkflowLifecycle(
    runId: string,
    next: DurableWorkflowExecution["lifecycle"],
    updatedAt: string,
    terminalReason?: string,
  ): DurableWorkflowExecution;
  finishDurableWorkflowRun(
    runId: string,
    runStatus: "completed" | "failed" | "cancelled" | "timed_out" | "orphaned",
    workflowStatus: "succeeded" | "failed" | "cancelled" | "blocked",
    updatedAt: string,
    reason: string,
  ): void;
  startDurableWorkflowStep(
    runId: string,
    stepId: string,
    updatedAt: string,
    providerCall: boolean,
    approvalId?: string,
    attemptId?: string,
  ): DurableWorkflowStep;
  recordDurableWorkflowStepTerminal(
    evidence: StepEvidence,
    next: "succeeded" | "failed" | "cancelled" | "timed_out",
    terminalReason: string,
    outputBytes: number,
  ): void;
  markDurableWorkflowStepUnknown(
    runId: string,
    stepId: string,
    updatedAt: string,
    reason: string,
  ): void;
  createBranchGroup(
    runId: string,
    group: BranchGroup,
    slices: readonly ContextSliceManifest[],
    createdAt: string,
    expiresAt: string,
  ): RuntimeBranchGroupRecord;
  findContextSlice(
    sliceId: string,
    revision: number,
  ): ContextSliceManifest | undefined;
  findBranchGroup(
    runId: string,
    groupId: string,
  ): RuntimeBranchGroupRecord | undefined;
  listBranchExecutions(runId: string, groupId: string): BranchExecutionState[];
  startBranchExecution(
    runId: string,
    groupId: string,
    branchId: string,
    dispatchId: string,
    providerCall: boolean,
    updatedAt: string,
    approvalId?: string,
  ): BranchExecutionState;
  finishBranchExecution(
    runId: string,
    groupId: string,
    branchId: string,
    evidence: StepEvidence,
    outputBytes: number,
  ): BranchExecutionState;
  markBranchUnknown(
    runId: string,
    groupId: string,
    branchId: string,
    updatedAt: string,
    reason: string,
  ): void;
  requestBranchGroupCancellation(
    runId: string,
    groupId: string,
    updatedAt: string,
  ): BranchExecutionState[];
  requestBranchCancellation(
    runId: string,
    groupId: string,
    branchId: string,
    updatedAt: string,
  ): BranchExecutionState;
  recordFanInResult(
    result: FanInResult,
    updatedAt: string,
  ): RuntimeBranchGroupRecord;
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
  saveProviderExecutionAttempt(
    attempt: ProviderExecutionAttempt,
  ): ProviderExecutionAttempt;
  findProviderExecutionAttempt(
    attemptId: string,
  ): ProviderExecutionAttempt | undefined;
  updateProviderExecutionState(
    attemptId: string,
    remoteState: ProviderExecutionAttempt["remoteState"],
    updatedAt: string,
    resolutionActor?: string,
  ): ProviderExecutionAttempt;
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
  readonly validateAgentProfiles?: (
    step: PlannedStep,
    context: OrchestrationPreview["projectContext"],
  ) => void;
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
  /** Reanuda solo un estado durable seguro; nunca repite steps inciertos. */
  readonly resumeRunId?: string;
}

export interface RuntimeExecutionResult {
  readonly status:
    | "completed"
    | "blocked"
    | "approval_required"
    | "failed"
    | "cancelled"
    | "timed_out"
    | "orphaned"
    | "remote_state_unknown";
  readonly reason: string;
  readonly runId?: string;
  readonly evidenceCount: number;
  /** Resultados efímeros por step. La persistencia solo recibe su digest. */
  readonly outputs?: Readonly<Record<string, unknown>>;
}

export interface RuntimeBranchExecutionOptions extends Omit<
  RuntimeExecutionOptions,
  "resumeRunId" | "recoveryCheckpointIds"
> {
  readonly contextSlices: readonly ContextSliceManifest[];
}

export interface RuntimeBranchExecutionResult extends RuntimeExecutionResult {
  readonly fanIn?: FanInResult;
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
  readonly #validateAgentProfiles?: RuntimeDependencies["validateAgentProfiles"];
  readonly #clock: () => Date;
  readonly #idFactory: () => string;
  readonly #contextSlices: ContextSliceBuilder;
  readonly #activeRuns = new Map<
    string,
    {
      readonly controller: AbortController;
      readonly planId: string;
      providerAttemptId?: string;
      readonly branches: Map<
        string,
        {
          readonly controller: AbortController;
          readonly groupId: string;
          readonly branchId: string;
          providerAttemptId?: string;
        }
      >;
    }
  >();

  constructor(dependencies: RuntimeDependencies) {
    this.#persistence = dependencies.persistence;
    this.#dispatchers = new DispatcherRegistry(dependencies.dispatchers);
    this.#revalidate = dependencies.revalidate;
    this.#evaluatePolicy = dependencies.evaluatePolicy;
    this.#sha256 = dependencies.sha256;
    this.#validateAgentProfiles = dependencies.validateAgentProfiles;
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#idFactory = dependencies.idFactory ?? randomUUID;
    this.#contextSlices = new ContextSliceBuilder(this.#sha256, this.#clock);
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

    const resumeSteps = options.resumeRunId
      ? this.#persistence.listDurableWorkflowSteps(options.resumeRunId)
      : [];
    if (
      options.resumeRunId &&
      (resumeSteps.length === 0 ||
        resumeSteps.some((step) =>
          [
            "running",
            "unknown",
            "blocked",
            "failed",
            "cancelled",
            "timed_out",
          ].includes(step.lifecycle),
        ))
    ) {
      return this.#blocked(
        options.resumeRunId,
        new Error("Durable workflow has an uncertain or terminal step"),
        preview.request.privacyMode !== "standard",
      );
    }

    for (const resolved of resolvedSteps) {
      if (
        resumeSteps.some(
          (step) =>
            step.stepId === resolved.step.id && step.lifecycle === "succeeded",
        )
      ) {
        continue;
      }
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

    const durable = preview.request.privacyMode === "standard";
    const now = this.#clock().toISOString();
    let run: ExecutionRun;
    if (options.resumeRunId) {
      if (!durable || options.runId) {
        return this.#blocked(
          preview.plan.id,
          new Error(
            "Durable resume requires standard mode and a single run identity",
          ),
          preview.request.privacyMode !== "standard",
        );
      }
      const existingRun = this.#persistence.findRun(options.resumeRunId);
      const existingWorkflow = this.#persistence.findDurableWorkflow(
        options.resumeRunId,
      );
      const unsafe = resumeSteps.some((step) =>
        [
          "running",
          "unknown",
          "blocked",
          "failed",
          "cancelled",
          "timed_out",
        ].includes(step.lifecycle),
      );
      const unavailableDependencyOutput = resumeSteps.some(
        (step) =>
          ["ready", "pending"].includes(step.lifecycle) &&
          step.dependencies.some((dependencyId) =>
            resumeSteps.some(
              (dependency) =>
                dependency.stepId === dependencyId &&
                dependency.lifecycle === "succeeded",
            ),
          ),
      );
      const profileBindingsChanged = resolvedSteps.some(({ step }) => {
        const durableStep = resumeSteps.find(
          (candidate) => candidate.stepId === step.id,
        );
        return (
          !durableStep ||
          !sameCanonicalValue(
            durableStep.agentProfiles,
            step.agentProfiles ?? [],
          )
        );
      });
      if (
        !existingRun ||
        !existingWorkflow ||
        existingRun.status !== "orphaned" ||
        existingWorkflow.lifecycle !== "blocked" ||
        existingRun.planId !== preview.plan.id ||
        existingRun.planDigest !== preview.planIntegrity.digest ||
        existingWorkflow.projectContextId !== preview.projectContext.id ||
        existingWorkflow.projectContextRevision !==
          preview.projectContext.revision ||
        existingWorkflow.projectContextDigest !==
          preview.projectContext.digest ||
        existingWorkflow.workspaceId !== preview.projectContext.workspace.id ||
        unsafe ||
        profileBindingsChanged ||
        unavailableDependencyOutput
      ) {
        return this.#blocked(
          options.resumeRunId,
          new Error(
            "Durable workflow cannot be resumed without verified state and outputs",
          ),
          false,
        );
      }
      run = existingRun;
      this.#persistence.updateRunStatus(run.id, "running", now);
      this.#persistence.updateDurableWorkflowLifecycle(run.id, "running", now);
    } else {
      run = executionRunSchema.parse({
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
    }
    if (durable && !options.resumeRunId) {
      const expiresAt = new Date(
        Date.parse(now) +
          preview.projectContext.governance.retentionDays * 86_400_000,
      ).toISOString();
      this.#persistence.createDurableWorkflow(
        durableWorkflowExecutionSchema.parse({
          schemaVersion: "1",
          runId: run.id,
          workflowId: preview.plan.id,
          workflowDefinitionVersion: preview.plan.plannerVersion,
          planDigest: run.planDigest,
          projectContextId: preview.projectContext.id,
          projectContextRevision: preview.projectContext.revision,
          projectContextDigest: preview.projectContext.digest,
          workspaceId: preview.projectContext.workspace.id,
          lifecycle: "prepared",
          revision: 1,
          budget: {
            limitsDigest: this.#sha256(
              canonicalizeJson(preview.projectContext.budget.limits),
            ),
            dispatchedStepIds: [],
            providerCallsUsed: 0,
            outputBytesObserved: 0,
          },
          createdAt: now,
          updatedAt: now,
          expiresAt,
        }),
        resolvedSteps.map(({ step }) =>
          durableWorkflowStepSchema.parse({
            runId: run.id,
            planId: run.planId,
            stepId: step.id,
            capabilityId: step.capabilityId,
            dependencies: step.dependsOn,
            lifecycle: step.dependsOn.length === 0 ? "ready" : "pending",
            revision: 1,
            dispatchStarted: false,
            effectClass: classifyOperationEffect(step.action),
            agentProfiles: step.agentProfiles ?? [],
            createdAt: now,
            updatedAt: now,
          }),
        ),
      );
    }
    if (
      !options.resumeRunId &&
      resolvedSteps.some((step) => step.policy.decision === "require_approval")
    ) {
      this.#persistence.updateRunStatus(
        run.id,
        "approved",
        this.#clock().toISOString(),
      );
    }
    if (!options.resumeRunId) {
      this.#persistence.updateRunStatus(
        run.id,
        "running",
        this.#clock().toISOString(),
      );
    }
    if (durable && !options.resumeRunId) {
      this.#persistence.updateDurableWorkflowLifecycle(
        run.id,
        "running",
        this.#clock().toISOString(),
      );
    }

    const controller = new AbortController();
    const activeRun: {
      readonly controller: AbortController;
      readonly planId: string;
      providerAttemptId?: string;
      currentStepId?: string;
      readonly branches: Map<
        string,
        {
          readonly controller: AbortController;
          readonly groupId: string;
          readonly branchId: string;
          providerAttemptId?: string;
        }
      >;
    } = { controller, planId: preview.plan.id, branches: new Map() };
    this.#activeRuns.set(run.id, activeRun);
    const completedSteps = new Set(
      resumeSteps
        .filter((step) => step.lifecycle === "succeeded")
        .map((step) => step.stepId),
    );
    let evidenceCount = completedSteps.size;
    const outputs: Record<string, unknown> = {};
    try {
      for (const initial of resolvedSteps) {
        if (completedSteps.has(initial.step.id)) continue;
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
        let consumedApproval: ApprovalRecord | undefined;
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
          consumedApproval = consumed;
        }

        const recoveryId = options.recoveryCheckpointIds?.[initial.step.id];
        const recovery = recoveryId
          ? this.#resolveRecovery(current, preview.plan.id, recoveryId)
          : undefined;
        let latestCheckpointRecordId: string | undefined;
        const dependencyOutputs = Object.fromEntries(
          current.step.dependsOn.flatMap((stepId) =>
            Object.hasOwn(outputs, stepId) ? [[stepId, outputs[stepId]]] : [],
          ),
        );
        const dispatchContext: DispatchContext = {
          runId: run.id,
          planId: run.planId,
          planDigest: run.planDigest,
          registrySnapshotId: run.registrySnapshotId,
          request: immutableSnapshot(currentPreview.request),
          projectContext: immutableSnapshot({
            id: currentPreview.projectContext.id,
            revision: currentPreview.projectContext.revision,
            digest: currentPreview.projectContext.digest,
            objectiveRequestId:
              currentPreview.projectContext.objective.requestId,
            workspaceId: currentPreview.projectContext.workspace.id,
          }),
          step: immutableSnapshot(current.step),
          descriptor: immutableSnapshot(current.descriptor),
          policy: immutableSnapshot(current.policy),
          ...(consumedApproval
            ? { approval: immutableSnapshot(consumedApproval) }
            : {}),
          ...(current.approvalDigest
            ? { expectedApprovalDigest: current.approvalDigest }
            : {}),
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
        const providerRequest = current.descriptor.providerRequest;
        if (durable && providerRequest) {
          const workflow = this.#persistence.findDurableWorkflow(run.id);
          if (
            !workflow ||
            workflow.budget.providerCallsUsed >=
              currentPreview.projectContext.budget.limits.maxProviderCalls
          ) {
            throw new Error("Durable provider-call budget is exhausted");
          }
        }
        const providerAttempt = providerRequest
          ? this.#persistence.saveProviderExecutionAttempt({
              id: this.#idFactory(),
              runId: run.id,
              planId: run.planId,
              stepId: current.step.id,
              capabilityId: current.step.capabilityId,
              adapterId: providerRequest.adapterId,
              adapterVersion: providerRequest.adapterVersion,
              adapterBuildDigest: providerRequest.adapterBuildDigest,
              providerId: providerRequest.providerId,
              transport: providerRequest.transport,
              requestDigest: providerRequest.requestDigest,
              contextDigest: providerRequest.contextDigest,
              effectClass: classifyOperationEffect(current.step.action),
              recoveryCapabilities: providerRequest.recoveryCapabilities,
              remoteState: "not_dispatched",
              budget: providerRequest.budget,
              createdAt: this.#clock().toISOString(),
              updatedAt: this.#clock().toISOString(),
            })
          : undefined;
        if (providerAttempt) {
          activeRun.providerAttemptId = providerAttempt.id;
        }
        if (durable) {
          this.#persistence.startDurableWorkflowStep(
            run.id,
            current.step.id,
            this.#clock().toISOString(),
            providerAttempt !== undefined,
            consumedApproval?.id,
            providerAttempt?.id,
          );
          activeRun.currentStepId = current.step.id;
        }
        if (providerAttempt) {
          this.#persistence.updateProviderExecutionState(
            providerAttempt.id,
            "dispatching",
            this.#clock().toISOString(),
          );
        }
        let result: DispatchResult;
        try {
          result = recovery
            ? await current.dispatcher.recover!(
                dispatchContext,
                recovery.checkpoint,
              )
            : await current.dispatcher.dispatch(dispatchContext);
        } catch (error) {
          if (providerAttempt) {
            this.#markProviderStateUnknown(providerAttempt.id);
            return this.#finishUnknown(
              run.id,
              current.step.id,
              evidenceCount,
              outputs,
            );
          }
          if (durable) {
            this.#persistence.markDurableWorkflowStepUnknown(
              run.id,
              current.step.id,
              this.#clock().toISOString(),
              "dispatch_result_unavailable",
            );
            return this.#finishRun(
              run.id,
              "orphaned",
              "Dispatch may have occurred; automatic retry is blocked",
              evidenceCount,
              outputs,
            );
          }
          throw error;
        } finally {
          delete activeRun.providerAttemptId;
        }
        try {
          this.#validateDispatchResult(result);
        } catch (error) {
          if (providerAttempt) {
            this.#markProviderStateUnknown(providerAttempt.id);
            return this.#finishUnknown(
              run.id,
              current.step.id,
              evidenceCount,
              outputs,
            );
          }
          if (durable) {
            this.#persistence.markDurableWorkflowStepUnknown(
              run.id,
              current.step.id,
              this.#clock().toISOString(),
              "invalid_dispatch_result",
            );
            return this.#finishRun(
              run.id,
              "orphaned",
              "Dispatch result was invalid; automatic retry is blocked",
              evidenceCount,
              outputs,
            );
          }
          throw error;
        }
        if (providerAttempt) {
          const remoteState = result.remoteState ?? "remote_state_unknown";
          this.#persistence.updateProviderExecutionState(
            providerAttempt.id,
            remoteState,
            this.#clock().toISOString(),
          );
          if (
            result.outcome === "remote_state_unknown" ||
            remoteState === "remote_state_unknown"
          ) {
            return this.#finishUnknown(
              run.id,
              current.step.id,
              evidenceCount,
              outputs,
            );
          }
        }
        const observedOutputBytes =
          result.output === undefined
            ? 0
            : Buffer.byteLength(canonicalizeJson(result.output), "utf8");
        if (durable && result.output !== undefined) {
          const workflow = this.#persistence.findDurableWorkflow(run.id);
          if (
            !workflow ||
            workflow.budget.outputBytesObserved + observedOutputBytes >
              currentPreview.projectContext.budget.limits.maxOutputBytes
          ) {
            result = {
              outcome: "failed",
              summary: "Workflow output budget exceeded",
            };
          }
        }
        if (durable && result.treeTerminationConfirmed === false) {
          this.#persistence.markDurableWorkflowStepUnknown(
            run.id,
            current.step.id,
            this.#clock().toISOString(),
            "process_tree_termination_unconfirmed",
          );
          return this.#finishRun(
            run.id,
            "orphaned",
            "Process tree termination could not be confirmed",
            evidenceCount,
            outputs,
          );
        }
        this.#appendEvidence(
          run,
          current,
          result,
          preview.request.privacyMode !== "standard",
          durable,
          observedOutputBytes,
        );
        delete activeRun.currentStepId;
        if (result.outcome === "succeeded" && latestCheckpointRecordId) {
          this.#persistence.consumeProviderCheckpoint(
            latestCheckpointRecordId,
            this.#clock().toISOString(),
          );
        }
        if (recoveryId) {
          this.#persistence.consumeProviderCheckpoint(
            recoveryId,
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
      if (durable && activeRun.currentStepId) {
        const currentStep = this.#persistence
          .listDurableWorkflowSteps(run.id)
          .find((step) => step.stepId === activeRun.currentStepId);
        if (currentStep?.lifecycle === "running") {
          this.#persistence.markDurableWorkflowStepUnknown(
            run.id,
            currentStep.stepId,
            this.#clock().toISOString(),
            "dispatch_terminal_unavailable",
          );
          return this.#finishRun(
            run.id,
            "orphaned",
            "Dispatch terminal could not be verified",
            evidenceCount,
            outputs,
          );
        }
      }
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

  async executeBranchGroup(
    input: OrchestrationPreview,
    groupInput: BranchGroup,
    options: RuntimeBranchExecutionOptions,
  ): Promise<RuntimeBranchExecutionResult> {
    let preview: OrchestrationPreview;
    let group: BranchGroup;
    const resolvedByStep = new Map<string, ResolvedStep>();
    const slices = new Map<string, ContextSliceManifest>();
    try {
      preview = this.#validatePreview(input);
      group = branchGroupSchema.parse(groupInput);
      this.#validateBranchGroup(preview, group, options.contextSlices);
      for (const branch of group.branches) {
        const step = preview.plan.steps.find(
          (candidate) => candidate.id === branch.stepId,
        );
        if (!step) throw new Error(`Branch step not found: ${branch.stepId}`);
        resolvedByStep.set(step.id, this.#resolveStep(preview, step));
        const slice = options.contextSlices.find(
          (candidate) => candidate.id === branch.contextSlice.id,
        );
        if (!slice)
          throw new Error(`Context slice not found: ${branch.branchId}`);
        slices.set(
          branch.branchId,
          this.#contextSlices.verify(
            slice,
            preview.projectContext,
            branch.branchId,
            group.groupId,
          ),
        );
      }
    } catch (error) {
      return this.#blocked(
        input.plan?.id ?? input.request?.id ?? "unknown",
        error,
        input.request?.privacyMode !== "standard",
      );
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

    for (const branch of group.branches) {
      const resolved = resolvedByStep.get(branch.stepId)!;
      if (resolved.policy.decision === "deny") {
        return this.#blocked(
          branch.branchId,
          new Error(`Policy denied branch ${branch.branchId}`),
          preview.request.privacyMode !== "standard",
        );
      }
      if (resolved.policy.decision === "require_approval") {
        const approvalId = options.approvalIds?.[branch.stepId];
        const approval = approvalId
          ? this.#persistence.findApproval(approvalId)
          : undefined;
        if (
          !approval ||
          approval.status !== "granted" ||
          approval.id !== branch.policyBinding.approvalId ||
          approval.planId !== preview.plan.id ||
          approval.stepId !== branch.stepId ||
          approval.planDigest !== preview.planIntegrity.digest ||
          approval.actionDigest !== branch.policyBinding.actionDigest ||
          approval.actionDigest !== resolved.approvalDigest
        ) {
          return {
            status: "approval_required",
            reason: `Branch approval is absent or out of scope: ${branch.branchId}`,
            evidenceCount: 0,
          };
        }
      }
    }

    const durable = preview.request.privacyMode === "standard";
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
    if (durable) {
      const expiresAt = new Date(
        Date.parse(now) +
          preview.projectContext.governance.retentionDays * 86_400_000,
      ).toISOString();
      this.#persistence.createDurableWorkflow(
        durableWorkflowExecutionSchema.parse({
          schemaVersion: "1",
          runId: run.id,
          workflowId: preview.plan.id,
          workflowDefinitionVersion: preview.plan.plannerVersion,
          planDigest: run.planDigest,
          projectContextId: preview.projectContext.id,
          projectContextRevision: preview.projectContext.revision,
          projectContextDigest: preview.projectContext.digest,
          workspaceId: preview.projectContext.workspace.id,
          lifecycle: "prepared",
          revision: 1,
          budget: {
            limitsDigest: this.#sha256(
              canonicalizeJson(preview.projectContext.budget.limits),
            ),
            dispatchedStepIds: [],
            providerCallsUsed: 0,
            outputBytesObserved: 0,
          },
          createdAt: now,
          updatedAt: now,
          expiresAt,
        }),
        preview.plan.steps.map((step) => {
          const isBranch = group.branches.some(
            (branch) => branch.stepId === step.id,
          );
          return durableWorkflowStepSchema.parse({
            runId: run.id,
            planId: run.planId,
            stepId: step.id,
            capabilityId: step.capabilityId,
            dependencies: isBranch ? [] : step.dependsOn,
            lifecycle:
              isBranch || step.dependsOn.length === 0 ? "ready" : "pending",
            revision: 1,
            dispatchStarted: false,
            effectClass: classifyOperationEffect(step.action),
            agentProfiles: step.agentProfiles ?? [],
            createdAt: now,
            updatedAt: now,
          });
        }),
      );
      this.#persistence.updateDurableWorkflowLifecycle(run.id, "running", now);
      this.#persistence.createBranchGroup(
        run.id,
        group,
        [...slices.values()],
        now,
        expiresAt,
      );
    }
    this.#persistence.updateRunStatus(run.id, "running", now);

    const rootController = new AbortController();
    const activeRun = {
      controller: rootController,
      planId: preview.plan.id,
      branches: new Map<
        string,
        {
          readonly controller: AbortController;
          readonly groupId: string;
          readonly branchId: string;
          providerAttemptId?: string;
        }
      >(),
    };
    this.#activeRuns.set(run.id, activeRun);
    const localStates = new Map<string, BranchExecutionState>();
    const outputs: Record<string, unknown> = {};
    const evidenceByBranch = new Map<
      string,
      { evidenceId: string; outputDigest?: string }
    >();
    let cursor = 0;
    const orderedBranches = [...group.branches].sort((left, right) =>
      left.branchId.localeCompare(right.branchId),
    );

    const executeOne = async (branch: BranchGroup["branches"][number]) => {
      if (rootController.signal.aborted) return;
      const resolved = resolvedByStep.get(branch.stepId)!;
      const controller = new AbortController();
      const key = `${group.groupId}\u0000${branch.branchId}`;
      activeRun.branches.set(key, {
        controller,
        groupId: group.groupId,
        branchId: branch.branchId,
      });
      const abort = () => controller.abort();
      rootController.signal.addEventListener("abort", abort, { once: true });
      let consumedApproval: ApprovalRecord | undefined;
      try {
        if (resolved.policy.decision === "require_approval") {
          const approvalId = options.approvalIds?.[branch.stepId];
          if (!approvalId || !resolved.approvalDigest) {
            throw new Error(`Approval missing for branch ${branch.branchId}`);
          }
          consumedApproval = this.#persistence.consumeApproval(
            approvalId,
            resolved.approvalDigest,
            this.#clock().toISOString(),
          );
          if (consumedApproval.status !== "consumed") {
            throw new Error(
              `Approval cannot be consumed: ${consumedApproval.status}`,
            );
          }
        }
        const providerRequest = resolved.descriptor.providerRequest;
        const dispatchId = this.#idFactory();
        const providerAttempt = providerRequest
          ? this.#persistence.saveProviderExecutionAttempt({
              id: dispatchId,
              runId: run.id,
              planId: run.planId,
              stepId: resolved.step.id,
              capabilityId: resolved.step.capabilityId,
              adapterId: providerRequest.adapterId,
              adapterVersion: providerRequest.adapterVersion,
              adapterBuildDigest: providerRequest.adapterBuildDigest,
              providerId: providerRequest.providerId,
              transport: providerRequest.transport,
              requestDigest: providerRequest.requestDigest,
              contextDigest: providerRequest.contextDigest,
              effectClass: classifyOperationEffect(resolved.step.action),
              recoveryCapabilities: providerRequest.recoveryCapabilities,
              remoteState: "not_dispatched",
              budget: providerRequest.budget,
              createdAt: this.#clock().toISOString(),
              updatedAt: this.#clock().toISOString(),
            })
          : undefined;
        const activeBranch = activeRun.branches.get(key)!;
        if (providerAttempt)
          activeBranch.providerAttemptId = providerAttempt.id;
        if (durable) {
          try {
            this.#persistence.startBranchExecution(
              run.id,
              group.groupId,
              branch.branchId,
              dispatchId,
              providerAttempt !== undefined,
              this.#clock().toISOString(),
              consumedApproval?.id,
            );
          } catch (error) {
            if (!rootController.signal.aborted) throw error;
            localStates.set(branch.branchId, {
              runId: run.id,
              groupId: group.groupId,
              branchId: branch.branchId,
              stepId: branch.stepId,
              lifecycle: "cancelled",
              revision: 2,
              providerCallsUsed: 0,
              outputBytesObserved: 0,
              terminalReason: "group_cancelled_before_dispatch",
              updatedAt: this.#clock().toISOString(),
            });
            return;
          }
        }
        localStates.set(
          branch.branchId,
          branchExecutionStateSchema.parse({
            runId: run.id,
            groupId: group.groupId,
            branchId: branch.branchId,
            stepId: branch.stepId,
            lifecycle: "running",
            revision: 2,
            providerCallsUsed: providerAttempt ? 1 : 0,
            outputBytesObserved: 0,
            dispatchId,
            updatedAt: this.#clock().toISOString(),
          }),
        );
        if (providerAttempt) {
          this.#persistence.updateProviderExecutionState(
            providerAttempt.id,
            "dispatching",
            this.#clock().toISOString(),
          );
        }
        const slice = slices.get(branch.branchId)!;
        const context: DispatchContext = {
          runId: run.id,
          planId: run.planId,
          planDigest: run.planDigest,
          registrySnapshotId: run.registrySnapshotId,
          request: immutableSnapshot(preview.request),
          projectContext: immutableSnapshot({
            id: preview.projectContext.id,
            revision: preview.projectContext.revision,
            digest: preview.projectContext.digest,
            objectiveRequestId: preview.projectContext.objective.requestId,
            workspaceId: preview.projectContext.workspace.id,
          }),
          contextSlice: immutableSnapshot({
            id: slice.id,
            revision: slice.revision,
            digest: slice.digest,
            branchId: slice.branchId,
            groupId: slice.groupId,
          }),
          step: immutableSnapshot(resolved.step),
          descriptor: immutableSnapshot(resolved.descriptor),
          policy: immutableSnapshot(resolved.policy),
          ...(consumedApproval
            ? { approval: immutableSnapshot(consumedApproval) }
            : {}),
          ...(resolved.approvalDigest
            ? { expectedApprovalDigest: resolved.approvalDigest }
            : {}),
          outputs: immutableSnapshot({}),
          signal: controller.signal,
          emit: (event) => {
            const parsed = runtimeStreamEventSchema.parse({
              runId: run.id,
              planId: run.planId,
              stepId: resolved.step.id,
              capabilityId: resolved.step.capabilityId,
              event,
            });
            try {
              options.onEvent?.(parsed);
            } catch {
              // Observers never control branch execution.
            }
          },
        };
        let result: DispatchResult;
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, branch.budget.timeoutMs);
        try {
          result = await resolved.dispatcher.dispatch(context);
          this.#validateDispatchResult(result);
        } catch {
          if (providerAttempt)
            this.#markProviderStateUnknown(providerAttempt.id);
          if (durable) {
            this.#persistence.markBranchUnknown(
              run.id,
              group.groupId,
              branch.branchId,
              this.#clock().toISOString(),
              "dispatch_terminal_unavailable",
            );
          }
          localStates.set(branch.branchId, {
            ...localStates.get(branch.branchId)!,
            lifecycle: "unknown",
            revision: 3,
            terminalReason: "dispatch_terminal_unavailable",
            updatedAt: this.#clock().toISOString(),
          });
          return;
        } finally {
          clearTimeout(timeout);
        }
        if (timedOut) {
          if (result.outcome !== "cancelled") {
            if (providerAttempt)
              this.#markProviderStateUnknown(providerAttempt.id);
            if (durable) {
              this.#persistence.markBranchUnknown(
                run.id,
                group.groupId,
                branch.branchId,
                this.#clock().toISOString(),
                "timeout_termination_unconfirmed",
              );
            }
            localStates.set(branch.branchId, {
              ...localStates.get(branch.branchId)!,
              lifecycle: "unknown",
              revision: 3,
              terminalReason: "timeout_termination_unconfirmed",
              updatedAt: this.#clock().toISOString(),
            });
            return;
          }
          result = {
            ...result,
            outcome: "timed_out",
            summary: "Branch timed out and cancellation was confirmed",
          };
        }
        if (providerAttempt) {
          const remoteState = result.remoteState ?? "remote_state_unknown";
          this.#persistence.updateProviderExecutionState(
            providerAttempt.id,
            remoteState,
            this.#clock().toISOString(),
          );
          if (
            result.outcome === "remote_state_unknown" ||
            remoteState === "remote_state_unknown"
          ) {
            if (durable) {
              this.#persistence.markBranchUnknown(
                run.id,
                group.groupId,
                branch.branchId,
                this.#clock().toISOString(),
                "remote_state_unknown",
              );
            }
            localStates.set(branch.branchId, {
              ...localStates.get(branch.branchId)!,
              lifecycle: "unknown",
              revision: 3,
              terminalReason: "remote_state_unknown",
              updatedAt: this.#clock().toISOString(),
            });
            return;
          }
        }
        if (result.treeTerminationConfirmed === false) {
          if (durable) {
            this.#persistence.markBranchUnknown(
              run.id,
              group.groupId,
              branch.branchId,
              this.#clock().toISOString(),
              "process_tree_termination_unconfirmed",
            );
          }
          localStates.set(branch.branchId, {
            ...localStates.get(branch.branchId)!,
            lifecycle: "unknown",
            revision: 3,
            terminalReason: "process_tree_termination_unconfirmed",
            updatedAt: this.#clock().toISOString(),
          });
          return;
        }
        const outputBytes =
          result.output === undefined
            ? 0
            : Buffer.byteLength(canonicalizeJson(result.output), "utf8");
        const evidence = stepEvidenceSchema.parse({
          id: this.#idFactory(),
          runId: run.id,
          planId: run.planId,
          stepId: resolved.step.id,
          capabilityId: resolved.step.capabilityId,
          subsystem: resolved.step.subsystem,
          capabilityVersion: resolved.descriptor.capabilityVersion,
          outcome: result.outcome,
          observedAt: this.#clock().toISOString(),
          summary:
            preview.request.privacyMode === "standard"
              ? result.summary
              : `Private ${resolved.step.subsystem} branch ${result.outcome}`,
          ...(result.outputDigest ? { outputDigest: result.outputDigest } : {}),
        });
        if (durable) {
          this.#persistence.finishBranchExecution(
            run.id,
            group.groupId,
            branch.branchId,
            evidence,
            outputBytes,
          );
        } else {
          this.#persistence.appendEvidence(evidence);
        }
        const lifecycle =
          result.outcome === "timed_out"
            ? "failed"
            : result.outcome === "remote_state_unknown"
              ? "unknown"
              : result.outcome;
        localStates.set(branch.branchId, {
          ...localStates.get(branch.branchId)!,
          lifecycle,
          revision: 3,
          outputBytesObserved: outputBytes,
          evidenceId: evidence.id,
          terminalReason: evidence.summary,
          updatedAt: evidence.observedAt,
        });
        evidenceByBranch.set(branch.branchId, {
          evidenceId: evidence.id,
          ...(evidence.outputDigest
            ? { outputDigest: evidence.outputDigest }
            : {}),
        });
        if (result.output !== undefined) {
          outputs[branch.stepId] = immutableSnapshot(result.output);
        }
      } finally {
        rootController.signal.removeEventListener("abort", abort);
        activeRun.branches.delete(key);
      }
    };

    const worker = async () => {
      while (!rootController.signal.aborted) {
        const index = cursor++;
        const branch = orderedBranches[index];
        if (!branch) return;
        await executeOne(branch);
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(group.maxConcurrency, orderedBranches.length) },
          () => worker(),
        ),
      );
      for (const branch of orderedBranches.slice(cursor)) {
        localStates.set(branch.branchId, {
          runId: run.id,
          groupId: group.groupId,
          branchId: branch.branchId,
          stepId: branch.stepId,
          lifecycle: "cancelled",
          revision: 2,
          providerCallsUsed: 0,
          outputBytesObserved: 0,
          terminalReason: "group_cancelled_before_dispatch",
          updatedAt: this.#clock().toISOString(),
        });
      }
      const fanIn = this.#buildFanInResult(
        run.id,
        group,
        orderedBranches.map(
          (branch) =>
            localStates.get(branch.branchId) ?? {
              runId: run.id,
              groupId: group.groupId,
              branchId: branch.branchId,
              stepId: branch.stepId,
              lifecycle: "blocked" as const,
              revision: 1,
              providerCallsUsed: 0,
              outputBytesObserved: 0,
              terminalReason: "branch_not_dispatched",
              updatedAt: this.#clock().toISOString(),
            },
        ),
        evidenceByBranch,
      );
      if (durable) {
        this.#persistence.recordFanInResult(fanIn, this.#clock().toISOString());
      }
      let evidenceCount = evidenceByBranch.size;
      if (fanIn.status === "confirmed") {
        const continuation = await this.#executeFanInContinuations(
          preview,
          run,
          group,
          options,
          rootController,
          outputs,
        );
        evidenceCount += continuation.evidenceCount;
        if (continuation.status) {
          const result = this.#finishRun(
            run.id,
            continuation.status,
            continuation.reason,
            evidenceCount,
            outputs,
          );
          return { ...result, fanIn };
        }
        const result = this.#finishRun(
          run.id,
          "completed",
          "Bounded fan-in confirmed",
          evidenceCount,
          outputs,
        );
        return { ...result, fanIn };
      }
      if (fanIn.status === "blocked") {
        if (this.#persistence.findRun(run.id)?.status === "running") {
          this.#persistence.updateRunStatus(
            run.id,
            "orphaned",
            this.#clock().toISOString(),
          );
        }
        return {
          status: "remote_state_unknown",
          reason: fanIn.reason,
          runId: run.id,
          evidenceCount,
          outputs,
          fanIn,
        };
      }
      const terminal = fanIn.status === "cancelled" ? "cancelled" : "failed";
      const result = this.#finishRun(
        run.id,
        terminal,
        fanIn.reason,
        evidenceCount,
        outputs,
      );
      return { ...result, fanIn };
    } finally {
      this.#activeRuns.delete(run.id);
    }
  }

  cancel(runId: string): boolean {
    const active = this.#activeRuns.get(runId);
    if (!active) return false;
    if (active.providerAttemptId) {
      const attempt = this.#persistence.findProviderExecutionAttempt(
        active.providerAttemptId,
      );
      if (
        attempt &&
        ["dispatching", "accepted", "running"].includes(attempt.remoteState)
      ) {
        this.#persistence.updateProviderExecutionState(
          attempt.id,
          "cancel_requested",
          this.#clock().toISOString(),
        );
      }
    }
    for (const branch of active.branches.values()) {
      if (this.#persistence.findBranchGroup(runId, branch.groupId)) {
        this.#persistence.requestBranchGroupCancellation(
          runId,
          branch.groupId,
          this.#clock().toISOString(),
        );
      }
      if (branch.providerAttemptId) {
        const attempt = this.#persistence.findProviderExecutionAttempt(
          branch.providerAttemptId,
        );
        if (
          attempt &&
          ["dispatching", "accepted", "running"].includes(attempt.remoteState)
        ) {
          this.#persistence.updateProviderExecutionState(
            attempt.id,
            "cancel_requested",
            this.#clock().toISOString(),
          );
        }
      }
      branch.controller.abort();
    }
    active.controller.abort();
    return true;
  }

  cancelBranch(runId: string, groupId: string, branchId: string): boolean {
    const active = this.#activeRuns.get(runId);
    const branch = active?.branches.get(`${groupId}\u0000${branchId}`);
    if (!active || !branch) return false;
    if (this.#persistence.findBranchGroup(runId, groupId)) {
      this.#persistence.requestBranchCancellation(
        runId,
        groupId,
        branchId,
        this.#clock().toISOString(),
      );
    }
    if (branch.providerAttemptId) {
      const attempt = this.#persistence.findProviderExecutionAttempt(
        branch.providerAttemptId,
      );
      if (
        attempt &&
        ["dispatching", "accepted", "running"].includes(attempt.remoteState)
      ) {
        this.#persistence.updateProviderExecutionState(
          attempt.id,
          "cancel_requested",
          this.#clock().toISOString(),
        );
      }
    }
    branch.controller.abort();
    return true;
  }

  cancelBranchGroup(runId: string, groupId: string): boolean {
    const active = this.#activeRuns.get(runId);
    if (!active) return false;
    const branches = [...active.branches.values()].filter(
      (branch) => branch.groupId === groupId,
    );
    if (this.#persistence.findBranchGroup(runId, groupId)) {
      this.#persistence.requestBranchGroupCancellation(
        runId,
        groupId,
        this.#clock().toISOString(),
      );
    }
    for (const branch of branches) {
      if (branch.providerAttemptId) {
        const attempt = this.#persistence.findProviderExecutionAttempt(
          branch.providerAttemptId,
        );
        if (
          attempt &&
          ["dispatching", "accepted", "running"].includes(attempt.remoteState)
        ) {
          this.#persistence.updateProviderExecutionState(
            attempt.id,
            "cancel_requested",
            this.#clock().toISOString(),
          );
        }
      }
      branch.controller.abort();
    }
    active.controller.abort();
    return branches.length > 0;
  }

  resolveUnknownProviderExecution(
    attemptId: string,
    resolution: "succeeded" | "failed" | "cancelled",
    actor: string,
  ): ProviderExecutionAttempt {
    const current = this.#persistence.findProviderExecutionAttempt(attemptId);
    const resolved = this.#persistence.updateProviderExecutionState(
      attemptId,
      resolution,
      this.#clock().toISOString(),
      actor,
    );
    if (current && this.#persistence.findDurableWorkflow(current.runId)) {
      this.#persistence.recordDurableWorkflowStepTerminal(
        stepEvidenceSchema.parse({
          id: this.#idFactory(),
          runId: current.runId,
          planId: current.planId,
          stepId: current.stepId,
          capabilityId: current.capabilityId,
          subsystem: "provider",
          capabilityVersion: current.adapterVersion,
          outcome: resolution,
          observedAt: this.#clock().toISOString(),
          summary: `Remote state resolved by ${actor}`,
        }),
        resolution,
        `Human resolution by ${actor}`,
        0,
      );
    }
    return resolved;
  }

  recoverOrphans(): string[] {
    return this.#persistence.recoverRunningRuns(this.#clock().toISOString());
  }

  async #executeFanInContinuations(
    preview: OrchestrationPreview,
    run: ExecutionRun,
    group: BranchGroup,
    options: RuntimeBranchExecutionOptions,
    controller: AbortController,
    outputs: Record<string, unknown>,
  ): Promise<{
    evidenceCount: number;
    status?: "failed" | "cancelled" | "timed_out" | "orphaned";
    reason: string;
  }> {
    const branchStepIds = new Set(
      group.branches.map((branch) => branch.stepId),
    );
    const completed = new Set(branchStepIds);
    let evidenceCount = 0;
    for (const step of preview.plan.steps) {
      if (branchStepIds.has(step.id)) continue;
      if (!step.dependsOn.every((dependency) => completed.has(dependency))) {
        return {
          evidenceCount,
          status: "failed",
          reason: `Fan-in continuation dependencies are incomplete for ${step.id}`,
        };
      }
      const resolved = this.#resolveStep(this.#validatePreview(preview), step);
      if (resolved.policy.decision === "deny") {
        return {
          evidenceCount,
          status: "failed",
          reason: `Policy denied fan-in continuation ${step.id}`,
        };
      }
      let consumedApproval: ApprovalRecord | undefined;
      if (resolved.policy.decision === "require_approval") {
        const approvalId = options.approvalIds?.[step.id];
        if (!approvalId || !resolved.approvalDigest) {
          return {
            evidenceCount,
            status: "failed",
            reason: `Approval missing for fan-in continuation ${step.id}`,
          };
        }
        consumedApproval = this.#persistence.consumeApproval(
          approvalId,
          resolved.approvalDigest,
          this.#clock().toISOString(),
        );
        if (consumedApproval.status !== "consumed") {
          return {
            evidenceCount,
            status: "failed",
            reason: `Approval is not consumable for ${step.id}`,
          };
        }
      }
      const durable = preview.request.privacyMode === "standard";
      const providerRequest = resolved.descriptor.providerRequest;
      const attempt = providerRequest
        ? this.#persistence.saveProviderExecutionAttempt({
            id: this.#idFactory(),
            runId: run.id,
            planId: run.planId,
            stepId: step.id,
            capabilityId: step.capabilityId,
            adapterId: providerRequest.adapterId,
            adapterVersion: providerRequest.adapterVersion,
            adapterBuildDigest: providerRequest.adapterBuildDigest,
            providerId: providerRequest.providerId,
            transport: providerRequest.transport,
            requestDigest: providerRequest.requestDigest,
            contextDigest: providerRequest.contextDigest,
            effectClass: classifyOperationEffect(step.action),
            recoveryCapabilities: providerRequest.recoveryCapabilities,
            remoteState: "not_dispatched",
            budget: providerRequest.budget,
            createdAt: this.#clock().toISOString(),
            updatedAt: this.#clock().toISOString(),
          })
        : undefined;
      if (durable) {
        this.#persistence.startDurableWorkflowStep(
          run.id,
          step.id,
          this.#clock().toISOString(),
          attempt !== undefined,
          consumedApproval?.id,
          attempt?.id,
        );
      }
      if (attempt) {
        this.#persistence.updateProviderExecutionState(
          attempt.id,
          "dispatching",
          this.#clock().toISOString(),
        );
      }
      const context: DispatchContext = {
        runId: run.id,
        planId: run.planId,
        planDigest: run.planDigest,
        registrySnapshotId: run.registrySnapshotId,
        request: immutableSnapshot(preview.request),
        projectContext: immutableSnapshot({
          id: preview.projectContext.id,
          revision: preview.projectContext.revision,
          digest: preview.projectContext.digest,
          objectiveRequestId: preview.projectContext.objective.requestId,
          workspaceId: preview.projectContext.workspace.id,
        }),
        step: immutableSnapshot(step),
        descriptor: immutableSnapshot(resolved.descriptor),
        policy: immutableSnapshot(resolved.policy),
        ...(consumedApproval
          ? { approval: immutableSnapshot(consumedApproval) }
          : {}),
        ...(resolved.approvalDigest
          ? { expectedApprovalDigest: resolved.approvalDigest }
          : {}),
        outputs: immutableSnapshot(
          Object.fromEntries(
            step.dependsOn.flatMap((dependency) =>
              Object.hasOwn(outputs, dependency)
                ? [[dependency, outputs[dependency]]]
                : [],
            ),
          ),
        ),
        signal: controller.signal,
        emit: (event) => {
          try {
            options.onEvent?.(
              runtimeStreamEventSchema.parse({
                runId: run.id,
                planId: run.planId,
                stepId: step.id,
                capabilityId: step.capabilityId,
                event,
              }),
            );
          } catch {
            // Observers never control continuation execution.
          }
        },
      };
      let result: DispatchResult;
      try {
        result = await resolved.dispatcher.dispatch(context);
        this.#validateDispatchResult(result);
      } catch {
        if (attempt) this.#markProviderStateUnknown(attempt.id);
        if (durable) {
          this.#persistence.markDurableWorkflowStepUnknown(
            run.id,
            step.id,
            this.#clock().toISOString(),
            "fan_in_continuation_terminal_unavailable",
          );
        }
        return {
          evidenceCount,
          status: "orphaned",
          reason: "Fan-in continuation terminal state is unknown",
        };
      }
      if (attempt) {
        const remoteState = result.remoteState ?? "remote_state_unknown";
        this.#persistence.updateProviderExecutionState(
          attempt.id,
          remoteState,
          this.#clock().toISOString(),
        );
        if (
          result.outcome === "remote_state_unknown" ||
          remoteState === "remote_state_unknown"
        ) {
          if (durable) {
            this.#persistence.markDurableWorkflowStepUnknown(
              run.id,
              step.id,
              this.#clock().toISOString(),
              "remote_state_unknown",
            );
          }
          return {
            evidenceCount,
            status: "orphaned",
            reason: "Fan-in continuation remote state is unknown",
          };
        }
      }
      if (result.treeTerminationConfirmed === false) {
        if (durable) {
          this.#persistence.markDurableWorkflowStepUnknown(
            run.id,
            step.id,
            this.#clock().toISOString(),
            "process_tree_termination_unconfirmed",
          );
        }
        return {
          evidenceCount,
          status: "orphaned",
          reason: "Fan-in continuation process termination is unconfirmed",
        };
      }
      const outputBytes =
        result.output === undefined
          ? 0
          : Buffer.byteLength(canonicalizeJson(result.output), "utf8");
      this.#appendEvidence(
        run,
        resolved,
        result,
        preview.request.privacyMode !== "standard",
        durable,
        outputBytes,
      );
      evidenceCount += 1;
      if (result.output !== undefined)
        outputs[step.id] = immutableSnapshot(result.output);
      if (result.outcome !== "succeeded") {
        return {
          evidenceCount,
          status:
            result.outcome === "timed_out"
              ? "timed_out"
              : result.outcome === "cancelled"
                ? "cancelled"
                : "failed",
          reason: result.summary,
        };
      }
      completed.add(step.id);
    }
    return { evidenceCount, reason: "Fan-in continuations completed" };
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

  #validateBranchGroup(
    preview: OrchestrationPreview,
    group: BranchGroup,
    slices: readonly ContextSliceManifest[],
  ): void {
    const unsigned = { ...group };
    Reflect.deleteProperty(unsigned, "digest");
    if (group.digest !== this.#sha256(canonicalizeJson(unsigned))) {
      throw new Error("Branch group digest mismatch");
    }
    if (
      group.planId !== preview.plan.id ||
      group.planDigest !== preview.planIntegrity.digest ||
      group.workspaceId !== preview.projectContext.workspace.id ||
      group.objectiveRequestId !== preview.projectContext.objective.requestId ||
      group.maxDepth !== 1
    ) {
      throw new Error("Branch group does not match the confirmed plan context");
    }
    if (
      group.branches.length > preview.projectContext.budget.limits.maxAgents ||
      group.budget.maxProviderCalls >
        preview.projectContext.budget.limits.maxProviderCalls ||
      group.budget.maxOutputBytes >
        preview.projectContext.budget.limits.maxOutputBytes ||
      group.budget.timeoutMs > preview.projectContext.budget.limits.timeoutMs ||
      group.branches.reduce(
        (total, branch) => total + branch.budget.maxProviderCalls,
        0,
      ) > group.budget.maxProviderCalls ||
      group.branches.reduce(
        (total, branch) => total + branch.budget.maxOutputBytes,
        0,
      ) > group.budget.maxOutputBytes
    ) {
      throw new Error("Branch group exceeds its hierarchical budget");
    }
    if (slices.length !== group.branches.length) {
      throw new Error("Each branch requires one exclusive context slice");
    }
    const sliceIds = new Set(slices.map((slice) => slice.id));
    if (sliceIds.size !== slices.length) {
      throw new Error(
        "Context slices cannot be shared implicitly between branches",
      );
    }
    for (const branch of group.branches) {
      const step = preview.plan.steps.find(
        (candidate) => candidate.id === branch.stepId,
      );
      if (!step) throw new Error(`Unknown branch step: ${branch.stepId}`);
      const resolved = this.#resolveStep(preview, step);
      const effect = classifyOperationEffect(step.action);
      const intrinsicallyReadOnly = step.action.kinds.every(
        (kind) => kind === "read",
      );
      if (
        !["pure", "read_only"].includes(effect) ||
        !intrinsicallyReadOnly ||
        step.action.risk === "destructive"
      ) {
        throw new Error(`Unsafe parallel effect for branch ${branch.branchId}`);
      }
      if (
        branch.projectContext.id !== preview.projectContext.id ||
        branch.projectContext.revision !== preview.projectContext.revision ||
        branch.projectContext.digest !== preview.projectContext.digest ||
        branch.executionTarget.subsystem !== step.subsystem ||
        branch.executionTarget.capabilityId !== step.capabilityId ||
        !branch.requiredCapabilities.includes(step.capabilityId) ||
        !sameCanonicalValue(branch.agentProfiles, step.agentProfiles ?? []) ||
        !sameCanonicalValue(branch.dependencies, step.dependsOn) ||
        branch.provenance.planDigest !== preview.planIntegrity.digest ||
        branch.provenance.descriptorDigest !==
          this.#sha256(canonicalizeJson(resolved.descriptor)) ||
        branch.policyBinding.rulesetVersion !== step.policy.rulesetVersion ||
        branch.policyBinding.decision !== step.policy.decision ||
        branch.policyBinding.actionDigest !==
          (resolved.approvalDigest ??
            this.#sha256(canonicalizeJson(step.action))) ||
        branch.budget.maxProviderCalls > group.budget.maxProviderCalls ||
        branch.budget.maxOutputBytes > group.budget.maxOutputBytes ||
        branch.budget.timeoutMs > group.budget.timeoutMs
      ) {
        throw new Error(`Branch binding mismatch: ${branch.branchId}`);
      }
      const slice = slices.find(
        (candidate) =>
          candidate.id === branch.contextSlice.id &&
          candidate.revision === branch.contextSlice.revision,
      );
      if (!slice || slice.digest !== branch.contextSlice.digest) {
        throw new Error(`Branch context slice mismatch: ${branch.branchId}`);
      }
    }
  }

  #buildFanInResult(
    runId: string,
    group: BranchGroup,
    states: readonly BranchExecutionState[],
    evidence: ReadonlyMap<
      string,
      { readonly evidenceId: string; readonly outputDigest?: string }
    >,
  ): FanInResult {
    const ordered = [...states].sort((left, right) =>
      left.branchId.localeCompare(right.branchId),
    );
    const succeeded = ordered.filter(
      (state) => state.lifecycle === "succeeded",
    ).length;
    let status: FanInResult["status"];
    let reason: string;
    if (ordered.some((state) => state.lifecycle === "unknown")) {
      status = "blocked";
      reason = "Fan-in blocked by an unknown branch state";
    } else if (succeeded === ordered.length) {
      status = "confirmed";
      reason = "All required branches completed with verified evidence";
    } else if (
      group.fanInPolicy.mode === "allow_partial" &&
      succeeded >= group.fanInPolicy.minimumSucceeded
    ) {
      status = "degraded";
      reason = `${succeeded}/${ordered.length} branches completed; degradation is explicit`;
    } else if (ordered.every((state) => state.lifecycle === "cancelled")) {
      status = "cancelled";
      reason = "All branches were cancelled";
    } else {
      status = "failed";
      reason = `${succeeded}/${ordered.length} required branches succeeded`;
    }
    const unsigned = {
      schemaVersion: "1" as const,
      runId,
      groupId: group.groupId,
      status,
      expectedBranches: ordered.length,
      succeededBranches: succeeded,
      branchResults: ordered.map((state) => ({
        branchId: state.branchId,
        lifecycle: state.lifecycle,
        ...(evidence.get(state.branchId)?.evidenceId
          ? { evidenceId: evidence.get(state.branchId)!.evidenceId }
          : {}),
        ...(evidence.get(state.branchId)?.outputDigest
          ? { outputDigest: evidence.get(state.branchId)!.outputDigest }
          : {}),
      })),
      reason,
    };
    return fanInResultSchema.parse({
      ...unsigned,
      digest: this.#sha256(canonicalizeJson(unsigned)),
    });
  }

  #resolveSteps(preview: OrchestrationPreview): ResolvedStep[] {
    return preview.plan.steps.map((step) => this.#resolveStep(preview, step));
  }

  #resolveStep(preview: OrchestrationPreview, step: PlannedStep): ResolvedStep {
    if (step.agentProfiles?.length && !this.#validateAgentProfiles) {
      throw new Error(`Agent profile catalog unavailable for ${step.id}`);
    }
    this.#validateAgentProfiles?.(step, preview.projectContext);
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
    durable: boolean,
    observedOutputBytes: number,
  ): void {
    if (result.outcome === "remote_state_unknown") {
      throw new Error(
        "Unknown remote state cannot be recorded as terminal evidence",
      );
    }
    const evidence = stepEvidenceSchema.parse({
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
    });
    if (durable) {
      this.#persistence.recordDurableWorkflowStepTerminal(
        evidence,
        result.outcome,
        evidence.summary,
        observedOutputBytes,
      );
    } else {
      this.#persistence.appendEvidence(evidence);
    }
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

  #markProviderStateUnknown(attemptId: string): void {
    const current = this.#persistence.findProviderExecutionAttempt(attemptId);
    if (
      current &&
      ["dispatching", "accepted", "running", "cancel_requested"].includes(
        current.remoteState,
      )
    ) {
      this.#persistence.updateProviderExecutionState(
        attemptId,
        "remote_state_unknown",
        this.#clock().toISOString(),
      );
    }
  }

  #finishUnknown(
    runId: string,
    stepId: string,
    evidenceCount: number,
    outputs: Readonly<Record<string, unknown>>,
  ): RuntimeExecutionResult {
    const durable = this.#persistence.findDurableWorkflow(runId);
    if (durable?.lifecycle === "running") {
      this.#persistence.markDurableWorkflowStepUnknown(
        runId,
        stepId,
        this.#clock().toISOString(),
        "remote_state_unknown",
      );
    }
    this.#persistence.updateRunStatus(
      runId,
      "orphaned",
      this.#clock().toISOString(),
    );
    this.#persistence.appendAuditEvent("execution.blocked", runId, {
      reason: "remote_state_unknown",
      stepId,
    });
    return {
      status: "remote_state_unknown",
      reason:
        "Remote state is unknown. Execution stopped without automatic retry.",
      runId,
      evidenceCount,
      outputs,
    };
  }

  #finishRun(
    runId: string,
    status: Exclude<
      RuntimeExecutionResult["status"],
      "blocked" | "approval_required" | "remote_state_unknown"
    >,
    reason: string,
    evidenceCount: number,
    outputs: Readonly<Record<string, unknown>>,
  ): RuntimeExecutionResult {
    const durable = this.#persistence.findDurableWorkflow(runId);
    if (
      durable &&
      ["prepared", "running", "blocked"].includes(durable.lifecycle)
    ) {
      const workflowStatus =
        status === "completed"
          ? "succeeded"
          : status === "cancelled"
            ? "cancelled"
            : status === "orphaned"
              ? "blocked"
              : "failed";
      if (durable.lifecycle === "running") {
        this.#persistence.finishDurableWorkflowRun(
          runId,
          status,
          workflowStatus,
          this.#clock().toISOString(),
          reason,
        );
        return { status, reason, runId, evidenceCount, outputs };
      }
    }
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
