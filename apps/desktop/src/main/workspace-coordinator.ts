import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename } from "node:path";

import {
  workspaceWorkflowOutputSchema,
  desktopWorkspaceSchema,
  orchestrationPreviewSchema,
  providerExecutionResultSchema,
  providerRequestInputSchema,
  workspaceApprovalDecisionRequestSchema,
  workspaceApprovalDecisionResponseSchema,
  workspaceApprovalRequestSchema,
  workspaceApprovalResponseSchema,
  workspaceExecutionCancelResponseSchema,
  workspaceExecutionStartRequestSchema,
  workspaceExecutionStartResponseSchema,
  workspaceExecutionStateSchema,
  workspaceFileOutputSchema,
  workspaceHistoryRequestSchema,
  workspaceHistoryResponseSchema,
  workspaceAuditRequestSchema,
  workspaceAuditResponseSchema,
  workspaceRetentionRequestSchema,
  workspaceRetentionResponseSchema,
  workspaceDataRequestSchema,
  workspaceDataDeleteResponseSchema,
  persistenceStatusResponseSchema,
  workspaceProviderOutputSchema,
  workspacePreviewRequestSchema,
  workspaceRunReferenceSchema,
  workspaceSearchOutputSchema,
  type DesktopWorkspace,
  type OrchestrationPreview,
  type RuntimeStreamEvent,
  type WorkspaceApprovalDecisionRequest,
  type WorkspaceApprovalRequest,
  type WorkspaceExecutionStartRequest,
  type WorkspaceExecutionState,
  type WorkspaceRunReference,
} from "@trivergence/contracts";
import {
  AgentTeam,
  AgentTeamDispatcher,
  createAgentCapabilities,
} from "@trivergence/agents";
import {
  coordinationCapabilityIds,
  coordinationBudgetSchema,
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
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import type {
  PersistenceRecoveryRecord,
  PersistenceStore,
} from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import {
  createReferenceProviderCapability,
  AdapterHost,
  ProviderStepDispatcher,
  ReferenceProviderAdapter,
  referenceProviderCapabilityId,
} from "@trivergence/provider-adapters";
import { RuntimeEngine } from "@trivergence/runtime";
import {
  createWorkspaceCapabilities,
  createWorkspaceDispatchers,
  workspaceCapabilityIds,
  workspaceFileResultSchema,
  workspaceSearchInputSchema,
  workspaceSearchResultSchema,
  WorkspaceRoot,
  WorkspaceService,
} from "@trivergence/workspace";
import {
  createWorkflowCapabilities,
  WorkflowEngine,
  WorkflowEvaluationDispatcher,
  WorkflowSynthesisDispatcher,
} from "@trivergence/workflows";

const MAX_INLINE_OUTPUT_BYTES = 900 * 1_024;

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

interface WorkspaceSession {
  readonly descriptor: DesktopWorkspace;
  readonly service: WorkspaceService;
  readonly engine: OrchestrationEngine;
  readonly runtime: RuntimeEngine;
}

interface StoredPreview {
  readonly workspaceId: string;
  readonly preview: OrchestrationPreview;
}

interface ActiveRun {
  readonly workspaceId: string;
  readonly planId: string;
  readonly runtime: RuntimeEngine;
  readonly events: RuntimeStreamEvent[];
  state: WorkspaceExecutionState;
}

export class DesktopWorkspaceCoordinator {
  readonly #sessions = new Map<string, WorkspaceSession>();
  readonly #previews = new Map<string, StoredPreview>();
  readonly #runs = new Map<string, ActiveRun>();
  readonly #approvalWorkspaces = new Map<string, string>();

  constructor(
    private readonly persistence: PersistenceStore,
    private readonly recoveredRuns: number,
    private readonly recovery?: PersistenceRecoveryRecord,
  ) {}

  openWorkspace(rootPath: string): DesktopWorkspace {
    if (
      [...this.#runs.values()].some((run) =>
        ["running", "cancelling"].includes(run.state.status),
      )
    ) {
      throw new Error("Cancel the active execution before changing workspace");
    }
    const canonicalPath = realpathSync.native(rootPath);
    const identity = sha256(
      process.platform === "win32"
        ? canonicalPath.toLocaleLowerCase()
        : canonicalPath,
    );
    const workspaceId = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-5${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
    if (this.persistence.health.privilegedActionsAvailable) {
      if (this.persistence.hasWorkspaceRetention(workspaceId)) {
        const retentionDays =
          this.persistence.getWorkspaceRetention(workspaceId);
        const cutoff = new Date(
          Date.now() - retentionDays * 86_400_000,
        ).toISOString();
        this.persistence.purgeWorkspaceData(workspaceId, cutoff);
      }
      this.persistence.pruneExpiredMemory(new Date().toISOString());
    }
    const root = new WorkspaceRoot({ id: workspaceId, path: canonicalPath });
    const service = new WorkspaceService(root);
    const memory = new MemoryService(this.persistence);
    const referenceAdapter = new ReferenceProviderAdapter();
    const referenceCapability = createReferenceProviderCapability();
    const adapterHost = new AdapterHost([
      {
        capabilityId: referenceProviderCapabilityId,
        capabilityVersion: referenceCapability.version,
        adapter: referenceAdapter,
      },
    ]);
    const agentTeam = new AgentTeam(adapterHost, referenceProviderCapabilityId);
    const workflow = new WorkflowEngine(agentTeam);
    const capabilities = [
      ...createWorkspaceCapabilities(false),
      referenceCapability,
      ...createMemoryCapabilities(),
      ...createAgentCapabilities(),
      ...createWorkflowCapabilities(),
    ];
    const registry = new CapabilityRegistry(
      `workspace-${root.fingerprint.slice(0, 12)}-1`,
      capabilities,
    );
    const engine = new OrchestrationEngine(registry, randomUUID, sha256);
    const runtime = new RuntimeEngine({
      persistence: this.persistence,
      dispatchers: [
        ...createWorkspaceDispatchers(service),
        new ProviderStepDispatcher({ host: adapterHost }),
        new MemoryRecallDispatcher(memory),
        new AgentTeamDispatcher(agentTeam),
        new WorkflowSynthesisDispatcher(workflow),
        new MemoryCommitDispatcher(memory),
        new WorkflowEvaluationDispatcher(workflow),
      ],
      revalidate: (preview) => engine.revalidate(preview),
      evaluatePolicy,
      sha256,
    });
    const descriptor = desktopWorkspaceSchema.parse({
      id: root.id,
      displayName: basename(root.path) || root.path,
      rootPath: root.path,
      fingerprint: root.fingerprint,
      capabilities: capabilities.map((capability) => capability.id),
      recoveredRuns: this.recoveredRuns,
      persistence: {
        mode: this.persistence.health.mode,
        databaseIntegrity: this.persistence.health.databaseIntegrity,
        auditValid: this.persistence.health.audit.valid,
        privilegedActionsAvailable:
          this.persistence.health.privilegedActionsAvailable,
        ...(this.persistence.health.reason
          ? { reason: this.persistence.health.reason }
          : {}),
        ...(this.recovery
          ? {
              recovery: {
                incidentId: this.recovery.incidentId,
                detectedAt: this.recovery.detectedAt,
                reason: this.recovery.reason,
                quarantineDirectory: this.recovery.quarantineDirectory,
                files: this.recovery.files,
              },
            }
          : {}),
      },
    });

    this.#sessions.clear();
    this.#previews.clear();
    this.#runs.clear();
    this.#approvalWorkspaces.clear();
    this.#sessions.set(root.id, { descriptor, service, engine, runtime });
    return descriptor;
  }

  preview(input: unknown): OrchestrationPreview {
    const request = workspacePreviewRequestSchema.parse(input);
    const session = this.#session(request.workspaceId);
    const capabilityInputs = {
      [workspaceCapabilityIds.read]: {
        path: request.detail,
      },
      [workspaceCapabilityIds.search]: {
        query: request.detail.slice(0, 200),
      },
      [referenceProviderCapabilityId]: providerRequestInputSchema.parse({
        prompt: request.goal,
        context: request.detail ? [request.detail] : [],
      }),
      [coordinationCapabilityIds.workflowEvaluation]:
        coordinationBudgetSchema.parse({
          maxAgents: request.maxAgents,
          maxProviderCalls: request.maxProviderCalls,
          maxOutputBytes: request.maxOutputBytes,
          maxMemoryItems: request.maxMemoryItems,
          maxMemoryBytes: request.maxMemoryBytes,
          timeoutMs: request.timeoutMs,
          maxReplans: request.maxReplans,
          retentionDays: request.retentionDays,
        }),
    };

    const preview = orchestrationPreviewSchema.parse(
      session.engine.preview({
        id: request.requestId,
        goal: request.goal,
        profile: request.profile,
        privacyMode: request.privacyMode,
        workspaceId: request.workspaceId,
        requestedCapabilities: request.routeHint ? [request.routeHint] : [],
        capabilityInputs,
      }),
    );
    if (preview.strategy.capabilityIds.includes(workspaceCapabilityIds.read)) {
      if (!request.detail) {
        throw new Error("Indica una ruta relativa en el detalle del objetivo.");
      }
      session.service.root.resolveExisting(
        String(capabilityInputs[workspaceCapabilityIds.read].path),
        "file",
      );
    }
    if (
      preview.strategy.capabilityIds.includes(workspaceCapabilityIds.search)
    ) {
      if (!request.detail) {
        throw new Error(
          "Indica el texto literal a buscar en el detalle del objetivo.",
        );
      }
      workspaceSearchInputSchema.parse(
        capabilityInputs[workspaceCapabilityIds.search],
      );
    }
    this.persistence.persistPreview(preview);
    this.#previews.set(preview.plan.id, {
      workspaceId: request.workspaceId,
      preview,
    });
    return preview;
  }

  startExecution(
    input: WorkspaceExecutionStartRequest,
  ): ReturnType<typeof workspaceExecutionStartResponseSchema.parse> {
    const request = workspaceExecutionStartRequestSchema.parse(input);
    if (
      [...this.#runs.values()].some(
        (run) =>
          run.workspaceId === request.workspaceId &&
          run.planId === request.planId &&
          ["running", "cancelling"].includes(run.state.status),
      )
    ) {
      throw new Error("This plan already has an active execution");
    }
    const session = this.#session(request.workspaceId);
    const stored = this.#storedPreview(request.workspaceId, request.planId);
    const runId = randomUUID();
    const active: ActiveRun = {
      workspaceId: request.workspaceId,
      planId: request.planId,
      runtime: session.runtime,
      events: [],
      state: workspaceExecutionStateSchema.parse({
        runId,
        status: "running",
        reason: "Execution is running",
        evidenceCount: 0,
      }),
    };
    this.#runs.set(runId, active);

    void session.runtime
      .execute(stored.preview, {
        runId,
        ...(request.approvalIds ? { approvalIds: request.approvalIds } : {}),
        onEvent: (event) => {
          active.events.push(event);
          if (active.events.length > 256) active.events.shift();
          active.state = workspaceExecutionStateSchema.parse({
            ...active.state,
            stream: active.events,
          });
        },
      })
      .then((result) => {
        active.state = this.#stateFromResult(
          runId,
          stored.preview,
          session.engine,
          result,
          active.events,
        );
      })
      .catch((error: unknown) => {
        let persistedRun: ReturnType<PersistenceStore["findRun"]>;
        let evidenceCount = 0;
        try {
          persistedRun = this.persistence.findRun(runId);
          if (persistedRun) {
            evidenceCount = this.persistence.listEvidence(runId).length;
          }
        } catch {
          // A broken store must not prevent the renderer from seeing the failure.
        }
        active.state = workspaceExecutionStateSchema.parse({
          runId,
          status:
            persistedRun &&
            [
              "completed",
              "failed",
              "cancelled",
              "timed_out",
              "orphaned",
            ].includes(persistedRun.status)
              ? persistedRun.status
              : "failed",
          reason: (error instanceof Error
            ? `No se pudo completar la evaluación/presentación: ${error.message}`
            : "No se pudo completar la evaluación/presentación."
          ).slice(0, 500),
          evidenceCount,
        });
      });

    return workspaceExecutionStartResponseSchema.parse({
      runId,
      status: "running",
    });
  }

  executionState(input: WorkspaceRunReference): WorkspaceExecutionState {
    const { runId } = workspaceRunReferenceSchema.parse(input);
    const active = this.#runs.get(runId);
    if (!active) throw new Error("Execution session not found");
    return workspaceExecutionStateSchema.parse(active.state);
  }

  history(input: { workspaceId: string; limit?: number }) {
    const request = workspaceHistoryRequestSchema.parse(input);
    this.#session(request.workspaceId);
    return workspaceHistoryResponseSchema.parse({
      entries: this.persistence.listExecutionHistory(
        request.workspaceId,
        request.limit,
      ),
    });
  }

  persistenceStatus() {
    const health = this.persistence.health;
    return persistenceStatusResponseSchema.parse({
      mode: health.mode,
      databaseIntegrity: health.databaseIntegrity,
      auditValid: health.audit.valid,
      privilegedActionsAvailable: health.privilegedActionsAvailable,
      recoveredRuns: this.recoveredRuns,
      ...(health.reason ? { reason: health.reason } : {}),
      ...(this.recovery
        ? {
            recovery: {
              incidentId: this.recovery.incidentId,
              detectedAt: this.recovery.detectedAt,
              reason: this.recovery.reason,
              quarantineDirectory: this.recovery.quarantineDirectory,
              files: this.recovery.files,
            },
          }
        : {}),
    });
  }

  audit(input: unknown) {
    const request = workspaceAuditRequestSchema.parse(input);
    this.#session(request.workspaceId);
    return workspaceAuditResponseSchema.parse({
      valid: this.persistence.verifyAuditChain().valid,
      events: this.persistence.listWorkspaceAuditEvents(
        request.workspaceId,
        request.limit,
      ),
    });
  }

  retention(input: unknown) {
    const request = workspaceDataRequestSchema.parse(input);
    this.#session(request.workspaceId);
    return workspaceRetentionResponseSchema.parse({
      days: this.persistence.getWorkspaceRetention(request.workspaceId),
      deletedRequests: 0,
    });
  }

  saveRetention(input: unknown) {
    const request = workspaceRetentionRequestSchema.parse(input);
    this.#session(request.workspaceId);
    if (
      [...this.#runs.values()].some(
        (run) =>
          run.workspaceId === request.workspaceId &&
          ["running", "cancelling"].includes(run.state.status),
      )
    )
      throw new Error("Cancel the active execution before changing retention");
    this.persistence.assertPrivilegedActionsAvailable();
    const cutoff = new Date(
      Date.now() - request.days * 86_400_000,
    ).toISOString();
    const deletedRequests = this.persistence.purgeWorkspaceData(
      request.workspaceId,
      cutoff,
    );
    this.persistence.setWorkspaceRetention(request.workspaceId, request.days);
    return workspaceRetentionResponseSchema.parse({
      days: request.days,
      deletedRequests,
    });
  }

  deleteWorkspaceData(input: unknown) {
    const request = workspaceDataRequestSchema.parse(input);
    this.#session(request.workspaceId);
    if (
      [...this.#runs.values()].some(
        (run) =>
          run.workspaceId === request.workspaceId &&
          ["running", "cancelling"].includes(run.state.status),
      )
    )
      throw new Error("Cancel the active execution before deleting data");
    this.persistence.assertPrivilegedActionsAvailable();
    const deletedRequests = this.persistence.purgeWorkspaceData(
      request.workspaceId,
    );
    this.#previews.clear();
    this.#runs.clear();
    return workspaceDataDeleteResponseSchema.parse({
      status: "deleted",
      deletedRequests,
    });
  }

  exportWorkspaceData(input: unknown) {
    const request = workspaceDataRequestSchema.parse(input);
    this.#session(request.workspaceId);
    return this.persistence.exportWorkspaceData(request.workspaceId);
  }

  cancelExecution(input: WorkspaceRunReference) {
    const { runId } = workspaceRunReferenceSchema.parse(input);
    const active = this.#runs.get(runId);
    if (!active) throw new Error("Execution session not found");
    const accepted = active.runtime.cancel(runId);
    if (accepted) {
      active.state = workspaceExecutionStateSchema.parse({
        ...active.state,
        status: "cancelling",
        reason: "Cancellation requested",
      });
    }
    return workspaceExecutionCancelResponseSchema.parse({ runId, accepted });
  }

  requestApproval(input: WorkspaceApprovalRequest) {
    const request = workspaceApprovalRequestSchema.parse(input);
    const session = this.#session(request.workspaceId);
    const stored = this.#storedPreview(request.workspaceId, request.planId);
    const step = stored.preview.plan.steps.find(
      (candidate) => candidate.id === request.stepId,
    );
    if (!step) throw new Error("Approval step not found");
    const approval = session.runtime.requestApproval(
      stored.preview,
      request.stepId,
    );
    this.#approvalWorkspaces.set(approval.id, request.workspaceId);
    return workspaceApprovalResponseSchema.parse({
      approvalId: approval.id,
      planId: approval.planId,
      stepId: approval.stepId,
      actionSummary: step.action.summary,
      policyReason: step.policy.reason,
      expiresAt: approval.expiresAt,
      descriptor: approval.descriptor,
    });
  }

  decideApproval(input: WorkspaceApprovalDecisionRequest) {
    const request = workspaceApprovalDecisionRequestSchema.parse(input);
    if (
      this.#approvalWorkspaces.get(request.approvalId) !== request.workspaceId
    ) {
      throw new Error("Approval does not belong to this workspace session");
    }
    const session = this.#session(request.workspaceId);
    const approval = session.runtime.decideApproval(
      request.approvalId,
      request.decision,
      "desktop-user",
    );
    return workspaceApprovalDecisionResponseSchema.parse({
      approvalId: approval.id,
      status: approval.status,
    });
  }

  #session(workspaceId: string): WorkspaceSession {
    const session = this.#sessions.get(workspaceId);
    if (!session) throw new Error("Workspace session is not active");
    return session;
  }

  #storedPreview(workspaceId: string, planId: string): StoredPreview {
    const stored = this.#previews.get(planId);
    if (!stored || stored.workspaceId !== workspaceId) {
      throw new Error("Plan does not belong to the active workspace session");
    }
    return stored;
  }

  #stateFromResult(
    runId: string,
    preview: OrchestrationPreview,
    engine: OrchestrationEngine,
    result: Awaited<ReturnType<RuntimeEngine["execute"]>>,
    events: readonly RuntimeStreamEvent[],
  ): WorkspaceExecutionState {
    const persistedRun = result.runId
      ? this.persistence.findRun(result.runId)
      : undefined;
    const outcomeEvaluation = persistedRun
      ? engine.evaluateOutcome(
          preview,
          persistedRun,
          this.persistence.listEvidence(persistedRun.id),
        )
      : undefined;
    if (outcomeEvaluation) {
      this.persistence.appendAuditEvent(
        "execution.outcome_evaluated",
        persistedRun!.id,
        {
          status: outcomeEvaluation.status,
          planId: preview.plan.id,
          checksDigest: sha256(JSON.stringify(outcomeEvaluation.checks)),
        },
      );
    }
    const requestedStep = preview.plan.steps.find((step) =>
      [
        workspaceCapabilityIds.read,
        workspaceCapabilityIds.search,
        referenceProviderCapabilityId,
        coordinationCapabilityIds.workflowEvaluation,
      ].includes(step.capabilityId),
    );
    let output: unknown;
    if (requestedStep && result.outputs?.[requestedStep.id] !== undefined) {
      if (requestedStep.capabilityId === workspaceCapabilityIds.read) {
        const value = workspaceFileResultSchema.parse(
          result.outputs[requestedStep.id],
        );
        output = workspaceFileOutputSchema.parse({ kind: "file", ...value });
      } else if (requestedStep.capabilityId === workspaceCapabilityIds.search) {
        const value = workspaceSearchResultSchema.parse(
          result.outputs[requestedStep.id],
        );
        output = workspaceSearchOutputSchema.parse({
          kind: "search",
          ...value,
        });
      } else if (requestedStep.capabilityId === referenceProviderCapabilityId) {
        output = workspaceProviderOutputSchema.parse({
          kind: "provider",
          result: providerExecutionResultSchema.parse(
            result.outputs[requestedStep.id],
          ),
        });
      } else {
        output = workspaceWorkflowOutputSchema.parse({
          kind: "workflow",
          result: workflowEvaluationResultSchema.parse(
            result.outputs[requestedStep.id],
          ),
        });
      }
    }
    const outputBytes =
      output === undefined
        ? 0
        : Buffer.byteLength(JSON.stringify(output), "utf8");
    const outputAvailable = outputBytes <= MAX_INLINE_OUTPUT_BYTES;
    return workspaceExecutionStateSchema.parse({
      runId,
      status: result.status,
      reason: result.reason,
      evidenceCount: result.evidenceCount,
      ...(outcomeEvaluation ? { outcomeEvaluation } : {}),
      ...(events.length > 0 ? { stream: [...events] } : {}),
      ...(output !== undefined && outputAvailable ? { output } : {}),
      ...(output !== undefined && !outputAvailable
        ? {
            outputUnavailableReason:
              "The verified result is too large to display safely inline.",
          }
        : {}),
    });
  }
}
