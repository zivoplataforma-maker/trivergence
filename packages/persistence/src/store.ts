import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import {
  approvalRecordSchema,
  branchExecutionStateSchema,
  branchGroupSchema,
  contextSliceManifestSchema,
  durableWorkflowExecutionSchema,
  durableWorkflowStepSchema,
  executionRunSchema,
  fanInResultSchema,
  orchestrationPreviewSchema,
  planExecutionBindingSchema,
  projectContextSnapshotSchema,
  providerCheckpointRecordSchema,
  providerExecutionAttemptSchema,
  stepEvidenceSchema,
  type ApprovalRecord,
  type AuditEvent,
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
  type ProjectContextSnapshot,
  type ProviderCheckpointRecord,
  type ProviderExecutionAttempt,
  type StepEvidence,
} from "@trivergence/contracts";

import {
  AuditChain,
  listAuditEvents,
  verifyAuditChain,
  type AuditChainVerification,
} from "./audit-chain.js";
import { migrateDatabase } from "./migrations.js";

export type PersistenceMode = "readwrite" | "readonly-recovery";

export interface PersistenceHealth {
  readonly mode: PersistenceMode;
  readonly databaseIntegrity: "ok" | "failed";
  readonly audit: AuditChainVerification;
  readonly privilegedActionsAvailable: boolean;
  readonly reason?: string;
}

export interface PersistenceDependencies {
  readonly clock?: () => Date;
  readonly idFactory?: () => string;
}

export interface PersistedMemoryEntry {
  readonly id: string;
  readonly namespace: string;
  readonly subjectDigest: string;
  readonly content: string;
  readonly contentDigest: string;
  readonly provenance: Readonly<Record<string, string | number | boolean>>;
  readonly sourceRunId: string;
  readonly sourcePlanId: string;
  readonly sourceStepId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly deletedAt?: string;
}

export interface PersistedExecutionHistoryEntry {
  readonly runId: string;
  readonly goal: string;
  readonly strategyKind: "direct" | "sequential" | "parallel" | "unavailable";
  readonly status: ExecutionRun["status"] | "remote_state_unknown";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly evidenceCount: number;
}

export interface PersistedBranchGroup {
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const assertMemoryEntry = (entry: PersistedMemoryEntry): void => {
  if (!entry.id || !entry.namespace || entry.namespace.length > 120) {
    throw new Error("Invalid memory identity");
  }
  if (
    !SHA256_PATTERN.test(entry.subjectDigest) ||
    !SHA256_PATTERN.test(entry.contentDigest)
  ) {
    throw new Error("Invalid memory digest");
  }
  if (Buffer.byteLength(entry.content, "utf8") > 65_536) {
    throw new Error("Memory content exceeds 65536 bytes");
  }
  if (
    !Number.isFinite(Date.parse(entry.createdAt)) ||
    !Number.isFinite(Date.parse(entry.expiresAt)) ||
    Date.parse(entry.expiresAt) <= Date.parse(entry.createdAt)
  ) {
    throw new Error("Invalid memory retention window");
  }
  const provenanceJson = JSON.stringify(entry.provenance);
  if (Buffer.byteLength(provenanceJson, "utf8") > 8_192) {
    throw new Error("Memory provenance exceeds 8192 bytes");
  }
};

const activeWriterPaths = new Set<string>();

const writerKeyFor = (databasePath: string): string | undefined =>
  databasePath === ":memory:"
    ? undefined
    : resolve(databasePath).toLocaleLowerCase();

const allowedRunTransitions: Readonly<
  Record<ExecutionRun["status"], readonly ExecutionRun["status"][]>
> = {
  planned: ["awaiting_approval", "approved", "running", "failed", "cancelled"],
  awaiting_approval: ["approved", "failed", "cancelled"],
  approved: ["running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled", "timed_out", "orphaned"],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
  orphaned: ["running"],
};

const workflowTransitions: Readonly<
  Record<
    DurableWorkflowExecution["lifecycle"],
    readonly DurableWorkflowExecution["lifecycle"][]
  >
> = {
  prepared: ["running", "blocked", "failed", "cancelled"],
  running: ["blocked", "succeeded", "failed", "cancelled"],
  blocked: ["running", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const stepTransitions: Readonly<
  Record<
    DurableWorkflowStep["lifecycle"],
    readonly DurableWorkflowStep["lifecycle"][]
  >
> = {
  pending: ["ready", "blocked", "cancelled"],
  ready: ["running", "blocked", "cancelled"],
  running: ["succeeded", "failed", "cancelled", "timed_out", "unknown"],
  blocked: ["ready", "failed", "cancelled"],
  unknown: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

const rowToWorkflowExecution = (
  row: Record<string, unknown>,
): DurableWorkflowExecution =>
  durableWorkflowExecutionSchema.parse({
    schemaVersion: row.schema_version,
    runId: row.run_id,
    workflowId: row.workflow_id,
    workflowDefinitionVersion: row.workflow_definition_version,
    planDigest: row.plan_digest,
    projectContextId: row.project_context_id,
    projectContextRevision: row.project_context_revision,
    projectContextDigest: row.project_context_digest,
    workspaceId: row.workspace_id,
    lifecycle: row.lifecycle,
    revision: row.revision,
    budget: {
      limitsDigest: row.budget_limits_digest,
      dispatchedStepIds: JSON.parse(String(row.dispatched_step_ids_json)),
      providerCallsUsed: row.provider_calls_used,
      outputBytesObserved: row.output_bytes_observed,
    },
    ...(row.terminal_reason ? { terminalReason: row.terminal_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  });

const rowToWorkflowStep = (row: Record<string, unknown>): DurableWorkflowStep =>
  durableWorkflowStepSchema.parse({
    runId: row.run_id,
    planId: row.plan_id,
    stepId: row.step_id,
    capabilityId: row.capability_id,
    dependencies: JSON.parse(String(row.dependencies_json)),
    lifecycle: row.lifecycle,
    revision: row.revision,
    dispatchStarted: row.dispatch_started === 1,
    effectClass: row.effect_class,
    agentProfiles: JSON.parse(String(row.agent_profiles_json)),
    ...(row.approval_id ? { approvalId: row.approval_id } : {}),
    ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
    ...(row.evidence_id ? { evidenceId: row.evidence_id } : {}),
    ...(row.output_digest ? { outputDigest: row.output_digest } : {}),
    ...(row.terminal_reason ? { terminalReason: row.terminal_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const rowToRun = (row: Record<string, unknown>): ExecutionRun =>
  executionRunSchema.parse({
    id: row.id,
    requestId: row.request_id,
    planId: row.plan_id,
    registrySnapshotId: row.registry_snapshot_id,
    planDigest: row.plan_digest,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const rowToApproval = (row: Record<string, unknown>): ApprovalRecord =>
  approvalRecordSchema.parse({
    id: row.id,
    planId: row.plan_id,
    stepId: row.step_id,
    actionDigest: row.action_digest,
    planDigest: row.plan_digest,
    rulesetVersion: row.ruleset_version,
    descriptor: JSON.parse(String(row.descriptor_json)) as unknown,
    status: row.status,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
    ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
    ...(row.actor ? { actor: row.actor } : {}),
  });

const rowToProviderCheckpoint = (
  row: Record<string, unknown>,
): ProviderCheckpointRecord =>
  providerCheckpointRecordSchema.parse({
    id: row.id,
    runId: row.run_id,
    planId: row.plan_id,
    stepId: row.step_id,
    capabilityId: row.capability_id,
    adapterId: row.adapter_id,
    providerId: row.provider_id,
    requestDigest: row.request_digest,
    checkpoint: JSON.parse(String(row.checkpoint_json)) as unknown,
    status: row.status,
    observedAt: row.observed_at,
    ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
  });

const rowToProviderExecutionAttempt = (
  row: Record<string, unknown>,
): ProviderExecutionAttempt =>
  providerExecutionAttemptSchema.parse({
    id: row.id,
    runId: row.run_id,
    planId: row.plan_id,
    stepId: row.step_id,
    capabilityId: row.capability_id,
    adapterId: row.adapter_id,
    adapterVersion: row.adapter_version,
    adapterBuildDigest: row.adapter_build_digest,
    providerId: row.provider_id,
    transport: row.transport,
    requestDigest: row.request_digest,
    contextDigest: row.context_digest,
    effectClass: row.effect_class,
    recoveryCapabilities: JSON.parse(
      String(row.recovery_capabilities_json),
    ) as unknown,
    remoteState: row.remote_state,
    budget: JSON.parse(String(row.budget_json)) as unknown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.resolution_actor ? { resolutionActor: row.resolution_actor } : {}),
  });

const rowToMemoryEntry = (
  row: Record<string, unknown>,
): PersistedMemoryEntry => ({
  id: String(row.id),
  namespace: String(row.namespace),
  subjectDigest: String(row.subject_digest),
  content: String(row.content),
  contentDigest: String(row.content_digest),
  provenance: JSON.parse(String(row.provenance_json)) as Readonly<
    Record<string, string | number | boolean>
  >,
  sourceRunId: String(row.source_run_id),
  sourcePlanId: String(row.source_plan_id),
  sourceStepId: String(row.source_step_id),
  createdAt: String(row.created_at),
  expiresAt: String(row.expires_at),
  ...(row.deleted_at ? { deletedAt: String(row.deleted_at) } : {}),
});

const verifyDatabaseIntegrity = (database: DatabaseSync): boolean => {
  try {
    const rows = database.prepare("PRAGMA quick_check").all() as Record<
      string,
      unknown
    >[];
    return (
      rows.length === 1 &&
      Object.values(rows[0] ?? {}).every((value) => value === "ok")
    );
  } catch {
    return false;
  }
};

const configureConnection = (
  database: DatabaseSync,
  mode: PersistenceMode,
): void => {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA trusted_schema = OFF");
  if (mode === "readwrite") {
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = FULL");
    database.exec("PRAGMA secure_delete = ON");
  } else {
    database.exec("PRAGMA query_only = ON");
  }
};

export class PersistenceStore {
  readonly #database: DatabaseSync;
  readonly #audit: AuditChain;
  readonly #clock: () => Date;
  readonly #health: PersistenceHealth;
  readonly #writerKey: string | undefined;
  #backupInProgress = false;
  #closed = false;

  private constructor(
    database: DatabaseSync,
    health: PersistenceHealth,
    dependencies: PersistenceDependencies,
    writerKey?: string,
  ) {
    this.#database = database;
    this.#health = health;
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#writerKey = writerKey;
    this.#audit = new AuditChain(database, {
      clock: this.#clock,
      idFactory: dependencies.idFactory ?? randomUUID,
    });
  }

  static open(
    databasePath: string,
    dependencies: PersistenceDependencies = {},
  ): PersistenceStore {
    const writerKey = writerKeyFor(databasePath);
    if (writerKey && activeWriterPaths.has(writerKey)) {
      throw new Error(
        "A persistence writer is already active for this database",
      );
    }
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(databasePath, {
        allowExtension: false,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
        timeout: 5_000,
      });
      configureConnection(database, "readwrite");
      migrateDatabase(database);
      const databaseIntegrity = verifyDatabaseIntegrity(database);
      const audit = verifyAuditChain(database);
      if (!databaseIntegrity || !audit.valid) {
        database.close();
        database = undefined;
        return PersistenceStore.openRecovery(
          databasePath,
          !databaseIntegrity
            ? "Database integrity verification failed"
            : (audit.reason ?? "Audit verification failed"),
          dependencies,
        );
      }
      if (writerKey) activeWriterPaths.add(writerKey);
      return new PersistenceStore(
        database,
        {
          mode: "readwrite",
          databaseIntegrity: "ok",
          audit,
          privilegedActionsAvailable: true,
        },
        dependencies,
        writerKey,
      );
    } catch (error) {
      if (database) {
        database.close();
      }
      try {
        return PersistenceStore.openRecovery(
          databasePath,
          error instanceof Error ? error.message : "Persistence open failed",
          dependencies,
        );
      } catch {
        throw error;
      }
    }
  }

  static openRecovery(
    databasePath: string,
    reason = "Recovery mode requested",
    dependencies: PersistenceDependencies = {},
  ): PersistenceStore {
    const database = new DatabaseSync(databasePath, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: true,
      timeout: 5_000,
    });
    configureConnection(database, "readonly-recovery");
    const databaseIntegrity = verifyDatabaseIntegrity(database);
    const audit = verifyAuditChain(database);
    return new PersistenceStore(
      database,
      {
        mode: "readonly-recovery",
        databaseIntegrity: databaseIntegrity ? "ok" : "failed",
        audit,
        privilegedActionsAvailable: false,
        reason,
      },
      dependencies,
      undefined,
    );
  }

  get health(): PersistenceHealth {
    if (this.#closed) return this.#health;
    const databaseIntegrity = verifyDatabaseIntegrity(this.#database);
    const audit = verifyAuditChain(this.#database);
    const healthy = databaseIntegrity && audit.valid;
    return {
      ...this.#health,
      databaseIntegrity: databaseIntegrity ? "ok" : "failed",
      audit,
      privilegedActionsAvailable: this.#health.mode === "readwrite" && healthy,
      ...(!healthy && !this.#health.reason
        ? { reason: "Persistence integrity verification failed" }
        : {}),
    };
  }

  assertPrivilegedActionsAvailable(): void {
    this.#assertOpen();
    const health = this.health;
    if (!health.privilegedActionsAvailable) {
      throw new Error(
        `Privileged actions are blocked: ${health.reason ?? "persistence is unhealthy"}`,
      );
    }
  }

  persistPreview(input: OrchestrationPreview): void {
    this.#assertWritable();
    const preview = orchestrationPreviewSchema.parse(input);
    const createdAt = this.#clock().toISOString();
    this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO orchestration_requests(
            id, goal, profile, requested_capabilities_json, created_at,
            workspace_id, privacy_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          preview.request.id,
          preview.request.privacyMode !== "standard"
            ? "[Objetivo privado no conservado]"
            : preview.request.goal,
          preview.request.profile,
          JSON.stringify(preview.request.requestedCapabilities),
          createdAt,
          preview.request.workspaceId ?? null,
          preview.request.privacyMode ?? "private",
        );
      if (preview.projectContext.governance.privacyMode === "standard") {
        const snapshotJson = JSON.stringify(preview.projectContext);
        if (Buffer.byteLength(snapshotJson, "utf8") > 65_536) {
          throw new Error("Project Context exceeds 65536 bytes");
        }
        const expiresAt = new Date(
          Date.parse(preview.projectContext.createdAt) +
            preview.projectContext.governance.retentionDays * 86_400_000,
        ).toISOString();
        this.#database
          .prepare(
            `INSERT INTO project_context_snapshots(
              context_id, revision, request_id, workspace_id, schema_version,
              snapshot_json, digest, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            preview.projectContext.id,
            preview.projectContext.revision,
            preview.request.id,
            preview.projectContext.workspace.id,
            preview.projectContext.schemaVersion,
            snapshotJson,
            preview.projectContext.digest,
            preview.projectContext.createdAt,
            expiresAt,
          );
        this.#audit.append({
          eventType: "project_context.snapshot_persisted",
          subjectId: preview.projectContext.id,
          payload: {
            digest: preview.projectContext.digest,
            requestId: preview.request.id,
            revision: preview.projectContext.revision,
            workspaceId: preview.projectContext.workspace.id,
          },
        });
      }
      this.#database
        .prepare(
          `INSERT INTO capability_snapshots(
            id, version, capability_count, created_at
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
        )
        .run(
          preview.registrySnapshot.id,
          preview.registrySnapshot.version,
          preview.registrySnapshot.capabilityCount,
          createdAt,
        );
      const persistedSnapshot = this.#database
        .prepare(
          `SELECT version, capability_count
          FROM capability_snapshots
          WHERE id = ?`,
        )
        .get(preview.registrySnapshot.id) as
        Record<string, unknown> | undefined;
      if (
        persistedSnapshot?.version !== preview.registrySnapshot.version ||
        persistedSnapshot.capability_count !==
          preview.registrySnapshot.capabilityCount
      ) {
        throw new Error("Capability snapshot identity metadata does not match");
      }
      this.#database
        .prepare(
          `INSERT INTO execution_plans(
            id, request_id, registry_snapshot_id, plan_digest,
            planner_version, issues_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          preview.plan.id,
          preview.request.id,
          preview.registrySnapshot.id,
          preview.planIntegrity.digest,
          preview.plan.plannerVersion,
          JSON.stringify(preview.plan.issues),
          createdAt,
        );
      this.#database
        .prepare(
          `INSERT INTO strategies(
            plan_id, kind, reason, capability_ids_json, evidence_json,
            strategy_version
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          preview.plan.id,
          preview.strategy.kind,
          preview.strategy.reason,
          JSON.stringify(preview.strategy.capabilityIds),
          JSON.stringify(preview.strategy.evidence),
          preview.strategy.strategyVersion,
        );

      const insertStep = this.#database.prepare(
        `INSERT INTO plan_steps(
          plan_id, step_id, position, capability_id, subsystem,
          depends_on_json, action_json, policy_json, agent_profiles_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      preview.plan.steps.forEach((step, position) => {
        insertStep.run(
          preview.plan.id,
          step.id,
          position,
          step.capabilityId,
          step.subsystem,
          JSON.stringify(step.dependsOn),
          JSON.stringify(
            preview.request.privacyMode !== "standard"
              ? { ...step.action, input: {} }
              : step.action,
          ),
          JSON.stringify(step.policy),
          JSON.stringify(step.agentProfiles ?? []),
        );
      });

      this.#database
        .prepare(
          `INSERT INTO plan_evaluations(
            plan_id, status, reason, checks_json, evaluator_version
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          preview.plan.id,
          preview.evaluation.status,
          preview.evaluation.reason,
          JSON.stringify(preview.evaluation.checks),
          preview.evaluation.evaluatorVersion,
        );
      this.#audit.append({
        eventType: "orchestration.preview_persisted",
        subjectId: preview.plan.id,
        payload: {
          evaluationStatus: preview.evaluation.status,
          planDigest: preview.planIntegrity.digest,
          registrySnapshotId: preview.registrySnapshot.id,
          requestId: preview.request.id,
        },
      });
    });
  }

  createRun(input: ExecutionRun): void {
    this.#assertWritable();
    const run = executionRunSchema.parse(input);
    if (run.status !== "planned") {
      throw new Error("New execution runs must start planned");
    }
    this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO execution_runs(
            id, request_id, plan_id, registry_snapshot_id, plan_digest,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          run.id,
          run.requestId,
          run.planId,
          run.registrySnapshotId,
          run.planDigest,
          run.status,
          run.createdAt,
          run.updatedAt,
        );
      this.#audit.append({
        eventType: "execution.run_created",
        subjectId: run.id,
        payload: {
          planDigest: run.planDigest,
          planId: run.planId,
          registrySnapshotId: run.registrySnapshotId,
          status: run.status,
        },
      });
    });
  }

  createDurableWorkflow(
    input: DurableWorkflowExecution,
    stepInputs: readonly DurableWorkflowStep[],
  ): void {
    this.#assertWritable();
    const workflow = durableWorkflowExecutionSchema.parse(input);
    const steps = stepInputs.map((step) =>
      durableWorkflowStepSchema.parse(step),
    );
    if (workflow.lifecycle !== "prepared" || workflow.revision !== 1) {
      throw new Error(
        "New durable workflows must start prepared at revision 1",
      );
    }
    if (
      steps.length === 0 ||
      steps.some((step) => step.runId !== workflow.runId)
    ) {
      throw new Error("Durable workflow steps must belong to the workflow run");
    }
    if (Date.parse(workflow.expiresAt) <= Date.parse(workflow.createdAt)) {
      throw new Error("Durable workflow expiry must follow creation");
    }
    this.#validateDurableWorkflowBinding(workflow);
    const planSteps = this.#database
      .prepare(
        `SELECT step_id, capability_id, depends_on_json, agent_profiles_json
         FROM plan_steps WHERE plan_id = ?`,
      )
      .all(workflow.workflowId) as {
      step_id: string;
      capability_id: string;
      depends_on_json: string;
      agent_profiles_json: string;
    }[];
    if (
      planSteps.length !== steps.length ||
      planSteps.some((planned) => {
        const step = steps.find(
          (candidate) => candidate.stepId === planned.step_id,
        );
        return (
          !step ||
          step.capabilityId !== planned.capability_id ||
          JSON.stringify(step.dependencies) !== planned.depends_on_json ||
          JSON.stringify(step.agentProfiles) !== planned.agent_profiles_json ||
          step.planId !== workflow.workflowId ||
          step.revision !== 1 ||
          step.dispatchStarted ||
          !["ready", "pending"].includes(step.lifecycle)
        );
      })
    ) {
      throw new Error("Durable workflow steps do not match the persisted plan");
    }
    this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO durable_workflow_executions(
            run_id, workflow_id, workflow_definition_version, schema_version,
            plan_digest, project_context_id, project_context_revision,
            project_context_digest, workspace_id, lifecycle, revision,
            budget_limits_digest, dispatched_step_ids_json, provider_calls_used,
            output_bytes_observed, terminal_reason, created_at, updated_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          workflow.runId,
          workflow.workflowId,
          workflow.workflowDefinitionVersion,
          workflow.schemaVersion,
          workflow.planDigest,
          workflow.projectContextId,
          workflow.projectContextRevision,
          workflow.projectContextDigest,
          workflow.workspaceId,
          workflow.lifecycle,
          workflow.revision,
          workflow.budget.limitsDigest,
          JSON.stringify(workflow.budget.dispatchedStepIds),
          workflow.budget.providerCallsUsed,
          workflow.budget.outputBytesObserved,
          workflow.terminalReason ?? null,
          workflow.createdAt,
          workflow.updatedAt,
          workflow.expiresAt,
        );
      const insertStep = this.#database.prepare(
        `INSERT INTO durable_workflow_steps(
          run_id, plan_id, step_id, capability_id, dependencies_json,
          lifecycle, revision, dispatch_started, effect_class, approval_id,
          attempt_id, evidence_id, output_digest, terminal_reason,
          created_at, updated_at, agent_profiles_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const step of steps) {
        insertStep.run(
          step.runId,
          step.planId,
          step.stepId,
          step.capabilityId,
          JSON.stringify(step.dependencies),
          step.lifecycle,
          step.revision,
          step.dispatchStarted ? 1 : 0,
          step.effectClass,
          step.approvalId ?? null,
          step.attemptId ?? null,
          step.evidenceId ?? null,
          step.outputDigest ?? null,
          step.terminalReason ?? null,
          step.createdAt,
          step.updatedAt,
          JSON.stringify(step.agentProfiles),
        );
      }
      this.#audit.append({
        eventType: "workflow.state_created",
        subjectId: workflow.runId,
        payload: {
          planDigest: workflow.planDigest,
          projectContextDigest: workflow.projectContextDigest,
          stepCount: steps.length,
          workflowDefinitionVersion: workflow.workflowDefinitionVersion,
        },
      });
    });
  }

  findDurableWorkflow(runId: string): DurableWorkflowExecution | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM durable_workflow_executions WHERE run_id = ?")
      .get(runId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const workflow = rowToWorkflowExecution(row);
    this.#validateDurableWorkflowBinding(workflow);
    this.listDurableWorkflowSteps(runId);
    return workflow;
  }

  listDurableWorkflowSteps(runId: string): DurableWorkflowStep[] {
    this.#assertOpen();
    const steps = (
      this.#database
        .prepare(
          `SELECT * FROM durable_workflow_steps
           WHERE run_id = ? ORDER BY rowid`,
        )
        .all(runId) as Record<string, unknown>[]
    ).map(rowToWorkflowStep);
    const plan = this.#database
      .prepare("SELECT plan_id FROM execution_runs WHERE id = ?")
      .get(runId) as { plan_id: string } | undefined;
    if (!plan) {
      if (steps.length > 0) throw new Error("Durable workflow run is missing");
      return [];
    }
    const planSteps = this.#database
      .prepare(
        `SELECT step_id, capability_id, depends_on_json, agent_profiles_json
         FROM plan_steps WHERE plan_id = ?`,
      )
      .all(plan.plan_id) as {
      step_id: string;
      capability_id: string;
      depends_on_json: string;
      agent_profiles_json: string;
    }[];
    const planned = new Map(planSteps.map((step) => [step.step_id, step]));
    const durableExists = this.#database
      .prepare("SELECT 1 FROM durable_workflow_executions WHERE run_id = ?")
      .get(runId);
    if (
      durableExists &&
      (steps.length !== planSteps.length ||
        steps.some((step) => {
          const source = planned.get(step.stepId);
          const evidence = step.evidenceId
            ? (this.#database
                .prepare(
                  `SELECT run_id, plan_id, step_id, outcome, output_digest
                   FROM step_evidence WHERE id = ?`,
                )
                .get(step.evidenceId) as Record<string, unknown> | undefined)
            : undefined;
          return (
            !source ||
            step.planId !== plan.plan_id ||
            step.capabilityId !== source.capability_id ||
            JSON.stringify(step.dependencies) !== source.depends_on_json ||
            JSON.stringify(step.agentProfiles) !== source.agent_profiles_json ||
            [
              "running",
              "unknown",
              "succeeded",
              "failed",
              "cancelled",
              "timed_out",
            ].includes(step.lifecycle) !== step.dispatchStarted ||
            (step.evidenceId !== undefined &&
              (!evidence ||
                evidence.run_id !== runId ||
                evidence.plan_id !== plan.plan_id ||
                evidence.step_id !== step.stepId ||
                evidence.outcome !== step.lifecycle ||
                evidence.output_digest !== (step.outputDigest ?? null))) ||
            (["succeeded", "failed", "cancelled", "timed_out"].includes(
              step.lifecycle,
            ) &&
              !step.evidenceId)
          );
        }))
    ) {
      throw new Error("Durable workflow step state is inconsistent");
    }
    return steps;
  }

  updateDurableWorkflowLifecycle(
    runId: string,
    next: DurableWorkflowExecution["lifecycle"],
    updatedAt: string,
    terminalReason?: string,
  ): DurableWorkflowExecution {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.findDurableWorkflow(runId);
      if (!current) throw new Error(`Durable workflow not found: ${runId}`);
      if (!workflowTransitions[current.lifecycle].includes(next)) {
        throw new Error(
          `Invalid workflow transition: ${current.lifecycle} -> ${next}`,
        );
      }
      if (next === "succeeded") {
        const incomplete = this.#database
          .prepare(
            `SELECT COUNT(*) AS count FROM durable_workflow_steps
             WHERE run_id = ? AND (lifecycle != 'succeeded' OR evidence_id IS NULL)`,
          )
          .get(runId) as { count: number };
        if (incomplete.count > 0) {
          throw new Error(
            "Workflow cannot succeed with incomplete dependencies",
          );
        }
      }
      const result = this.#database
        .prepare(
          `UPDATE durable_workflow_executions
           SET lifecycle = ?, revision = revision + 1, terminal_reason = ?, updated_at = ?
           WHERE run_id = ? AND lifecycle = ? AND revision = ?`,
        )
        .run(
          next,
          terminalReason ?? null,
          updatedAt,
          runId,
          current.lifecycle,
          current.revision,
        );
      if (result.changes !== 1)
        throw new Error("Durable workflow changed concurrently");
      this.#audit.append({
        eventType: "workflow.state_changed",
        subjectId: runId,
        payload: {
          from: current.lifecycle,
          revision: current.revision + 1,
          to: next,
        },
      });
      return this.findDurableWorkflow(runId)!;
    });
  }

  finishDurableWorkflowRun(
    runId: string,
    runStatus: "completed" | "failed" | "cancelled" | "timed_out" | "orphaned",
    workflowStatus: "succeeded" | "failed" | "cancelled" | "blocked",
    updatedAt: string,
    reason: string,
  ): void {
    this.#assertWritable();
    this.#transaction(() => {
      const run = this.findRun(runId);
      const workflow = this.findDurableWorkflow(runId);
      if (!run || !workflow || run.status !== "running") {
        throw new Error("Durable workflow run is not running");
      }
      if (!workflowTransitions[workflow.lifecycle].includes(workflowStatus)) {
        throw new Error("Invalid durable workflow terminal transition");
      }
      if (
        (runStatus === "completed") !== (workflowStatus === "succeeded") ||
        (runStatus === "cancelled") !== (workflowStatus === "cancelled") ||
        (runStatus === "orphaned") !== (workflowStatus === "blocked")
      ) {
        throw new Error("Run and workflow terminal states disagree");
      }
      if (workflowStatus === "succeeded") {
        const incomplete = this.#database
          .prepare(
            `SELECT COUNT(*) AS count FROM durable_workflow_steps
             WHERE run_id = ? AND (lifecycle != 'succeeded' OR evidence_id IS NULL)`,
          )
          .get(runId) as { count: number };
        if (incomplete.count > 0) {
          throw new Error(
            "Workflow cannot succeed with incomplete dependencies",
          );
        }
      }
      const workflowUpdate = this.#database
        .prepare(
          `UPDATE durable_workflow_executions
           SET lifecycle = ?, revision = revision + 1,
             terminal_reason = ?, updated_at = ?
           WHERE run_id = ? AND lifecycle = ? AND revision = ?`,
        )
        .run(
          workflowStatus,
          reason,
          updatedAt,
          runId,
          workflow.lifecycle,
          workflow.revision,
        );
      const runUpdate = this.#database
        .prepare(
          `UPDATE execution_runs SET status = ?, updated_at = ?
           WHERE id = ? AND status = 'running'`,
        )
        .run(runStatus, updatedAt, runId);
      if (workflowUpdate.changes !== 1 || runUpdate.changes !== 1) {
        throw new Error("Durable workflow changed concurrently");
      }
      this.#audit.append({
        eventType: "workflow.state_changed",
        subjectId: runId,
        payload: {
          from: workflow.lifecycle,
          revision: workflow.revision + 1,
          to: workflowStatus,
        },
      });
      this.#audit.append({
        eventType: "execution.run_status_changed",
        subjectId: runId,
        payload: { from: run.status, to: runStatus },
      });
    });
  }

  startDurableWorkflowStep(
    runId: string,
    stepId: string,
    updatedAt: string,
    providerCall: boolean,
    approvalId?: string,
    attemptId?: string,
  ): DurableWorkflowStep {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.#findDurableWorkflowStep(runId, stepId);
      if (
        !current ||
        current.lifecycle !== "ready" ||
        current.dispatchStarted
      ) {
        throw new Error(
          "Durable workflow step is not ready for first dispatch",
        );
      }
      const workflow = this.findDurableWorkflow(runId);
      if (!workflow || workflow.lifecycle !== "running") {
        throw new Error("Durable workflow is not running");
      }
      const dispatched = [...workflow.budget.dispatchedStepIds, stepId];
      const result = this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = 'running',
             revision = revision + 1, dispatch_started = 1,
             approval_id = ?, attempt_id = ?, updated_at = ?
           WHERE run_id = ? AND step_id = ? AND lifecycle = 'ready'
             AND dispatch_started = 0 AND revision = ?`,
        )
        .run(
          approvalId ?? null,
          attemptId ?? null,
          updatedAt,
          runId,
          stepId,
          current.revision,
        );
      if (result.changes !== 1)
        throw new Error("Durable workflow step changed concurrently");
      this.#database
        .prepare(
          `UPDATE durable_workflow_executions
           SET dispatched_step_ids_json = ?, provider_calls_used = provider_calls_used + ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND revision = ?`,
        )
        .run(
          JSON.stringify(dispatched),
          providerCall ? 1 : 0,
          updatedAt,
          runId,
          workflow.revision,
        );
      this.#audit.append({
        eventType: "workflow.step_state_changed",
        subjectId: runId,
        payload: {
          from: "ready",
          revision: current.revision + 1,
          stepId,
          to: "running",
        },
      });
      return this.#findDurableWorkflowStep(runId, stepId)!;
    });
  }

  recordDurableWorkflowStepTerminal(
    evidenceInput: StepEvidence,
    next: Extract<
      DurableWorkflowStep["lifecycle"],
      "succeeded" | "failed" | "cancelled" | "timed_out"
    >,
    terminalReason: string,
    outputBytes: number,
  ): void {
    this.#assertWritable();
    const evidence = stepEvidenceSchema.parse(evidenceInput);
    if (evidence.outcome !== next) {
      throw new Error("Evidence outcome does not match durable terminal state");
    }
    if (!Number.isSafeInteger(outputBytes) || outputBytes < 0) {
      throw new Error("Invalid durable workflow output accounting");
    }
    this.#transaction(() => {
      const current = this.#findDurableWorkflowStep(
        evidence.runId,
        evidence.stepId,
      );
      if (!current || !stepTransitions[current.lifecycle].includes(next)) {
        throw new Error("Invalid durable workflow step terminal transition");
      }
      this.#insertEvidence(evidence);
      const result = this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = ?, revision = revision + 1,
             evidence_id = ?, output_digest = ?, terminal_reason = ?, updated_at = ?
           WHERE run_id = ? AND step_id = ? AND lifecycle = ? AND revision = ?`,
        )
        .run(
          next,
          evidence.id,
          evidence.outputDigest ?? null,
          terminalReason,
          evidence.observedAt,
          evidence.runId,
          evidence.stepId,
          current.lifecycle,
          current.revision,
        );
      if (result.changes !== 1)
        throw new Error("Durable workflow step changed concurrently");
      this.#database
        .prepare(
          `UPDATE durable_workflow_executions
           SET output_bytes_observed = output_bytes_observed + ?,
             revision = revision + 1, updated_at = ? WHERE run_id = ?`,
        )
        .run(outputBytes, evidence.observedAt, evidence.runId);
      if (next === "succeeded")
        this.#releaseReadySteps(evidence.runId, evidence.observedAt);
      this.#audit.append({
        eventType: "workflow.step_state_changed",
        subjectId: evidence.runId,
        payload: {
          evidenceId: evidence.id,
          from: current.lifecycle,
          stepId: evidence.stepId,
          to: next,
        },
      });
    });
  }

  markDurableWorkflowStepUnknown(
    runId: string,
    stepId: string,
    updatedAt: string,
    reason: string,
  ): void {
    this.#assertWritable();
    this.#transaction(() => {
      const current = this.#findDurableWorkflowStep(runId, stepId);
      if (!current || current.lifecycle !== "running") {
        throw new Error("Only a running durable step can become unknown");
      }
      this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = 'unknown',
             revision = revision + 1, terminal_reason = ?, updated_at = ?
           WHERE run_id = ? AND step_id = ? AND lifecycle = 'running'`,
        )
        .run(reason, updatedAt, runId, stepId);
      this.#database
        .prepare(
          `UPDATE durable_workflow_executions SET lifecycle = 'blocked',
             revision = revision + 1, terminal_reason = ?, updated_at = ?
           WHERE run_id = ? AND lifecycle = 'running'`,
        )
        .run(reason, updatedAt, runId);
      this.#audit.append({
        eventType: "workflow.step_state_changed",
        subjectId: runId,
        payload: { from: "running", reason, stepId, to: "unknown" },
      });
    });
  }

  createBranchGroup(
    runId: string,
    groupInput: BranchGroup,
    slicesInput: readonly ContextSliceManifest[],
    createdAt: string,
    expiresAt: string,
  ): PersistedBranchGroup {
    this.#assertWritable();
    const group = branchGroupSchema.parse(groupInput);
    const slices = slicesInput.map((slice) =>
      contextSliceManifestSchema.parse(slice),
    );
    if (slices.length !== group.branches.length) {
      throw new Error("Each branch requires exactly one context slice");
    }
    return this.#transaction(() => {
      const workflow = this.findDurableWorkflow(runId);
      if (
        !workflow ||
        workflow.workflowId !== group.planId ||
        workflow.planDigest !== group.planDigest ||
        workflow.workspaceId !== group.workspaceId
      ) {
        throw new Error("Branch group does not match its durable workflow");
      }
      const insertSlice = this.#database.prepare(
        `INSERT INTO context_slice_manifests(
          slice_id, revision, context_id, context_revision, workspace_id,
          objective_request_id, group_id, branch_id, manifest_json, digest,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const slice of slices) {
        if (
          slice.groupId !== group.groupId ||
          slice.workspaceId !== group.workspaceId ||
          slice.objectiveRequestId !== group.objectiveRequestId ||
          !group.branches.some(
            (branch) =>
              branch.branchId === slice.branchId &&
              branch.contextSlice.id === slice.id &&
              branch.contextSlice.revision === slice.revision &&
              branch.contextSlice.digest === slice.digest,
          )
        ) {
          throw new Error("Context slice does not match its branch binding");
        }
        insertSlice.run(
          slice.id,
          slice.revision,
          slice.projectContext.id,
          slice.projectContext.revision,
          slice.workspaceId,
          slice.objectiveRequestId,
          slice.groupId,
          slice.branchId,
          JSON.stringify(slice),
          slice.digest,
          slice.createdAt,
          slice.expiresAt,
        );
      }
      this.#database
        .prepare(
          `INSERT INTO branch_groups(
            run_id, group_id, group_digest, lifecycle, max_concurrency,
            max_provider_calls, max_output_bytes, provider_calls_used,
            output_bytes_observed, cancel_requested, revision, created_at,
            updated_at, expires_at
          ) VALUES (?, ?, ?, 'pending', ?, ?, ?, 0, 0, 0, 1, ?, ?, ?)`,
        )
        .run(
          runId,
          group.groupId,
          group.digest,
          group.maxConcurrency,
          group.budget.maxProviderCalls,
          group.budget.maxOutputBytes,
          createdAt,
          createdAt,
          expiresAt,
        );
      const insertBranch = this.#database.prepare(
        `INSERT INTO branch_executions(
          run_id, group_id, branch_id, step_id, descriptor_json,
          context_slice_id, context_slice_revision, context_slice_digest,
          lifecycle, max_provider_calls, max_output_bytes,
          provider_calls_used, output_bytes_observed, revision, created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, 0, 0, 1, ?, ?)`,
      );
      for (const branch of group.branches) {
        insertBranch.run(
          runId,
          group.groupId,
          branch.branchId,
          branch.stepId,
          JSON.stringify(branch),
          branch.contextSlice.id,
          branch.contextSlice.revision,
          branch.contextSlice.digest,
          branch.budget.maxProviderCalls,
          branch.budget.maxOutputBytes,
          createdAt,
          createdAt,
        );
      }
      this.#audit.append({
        eventType: "workflow.state_changed",
        subjectId: runId,
        payload: {
          branchCount: group.branches.length,
          groupId: group.groupId,
          to: "branch_group_pending",
        },
      });
      return this.findBranchGroup(runId, group.groupId)!;
    });
  }

  findContextSlice(
    sliceId: string,
    revision: number,
  ): ContextSliceManifest | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        `SELECT manifest_json FROM context_slice_manifests
         WHERE slice_id = ? AND revision = ?`,
      )
      .get(sliceId, revision) as { manifest_json: string } | undefined;
    return row
      ? contextSliceManifestSchema.parse(JSON.parse(row.manifest_json))
      : undefined;
  }

  findBranchGroup(
    runId: string,
    groupId: string,
  ): PersistedBranchGroup | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM branch_groups WHERE run_id = ? AND group_id = ?")
      .get(runId, groupId) as Record<string, unknown> | undefined;
    return row ? this.#branchGroupFromRow(row) : undefined;
  }

  listBranchExecutions(runId: string, groupId: string): BranchExecutionState[] {
    this.#assertOpen();
    return (
      this.#database
        .prepare(
          `SELECT run_id, group_id, branch_id, step_id, lifecycle, revision,
             provider_calls_used, output_bytes_observed, dispatch_id,
             evidence_id, terminal_reason, updated_at
           FROM branch_executions WHERE run_id = ? AND group_id = ?
           ORDER BY branch_id`,
        )
        .all(runId, groupId) as Record<string, unknown>[]
    ).map((row) =>
      branchExecutionStateSchema.parse({
        runId: row.run_id,
        groupId: row.group_id,
        branchId: row.branch_id,
        stepId: row.step_id,
        lifecycle: row.lifecycle,
        revision: row.revision,
        providerCallsUsed: row.provider_calls_used,
        outputBytesObserved: row.output_bytes_observed,
        ...(row.dispatch_id ? { dispatchId: row.dispatch_id } : {}),
        ...(row.evidence_id ? { evidenceId: row.evidence_id } : {}),
        ...(row.terminal_reason ? { terminalReason: row.terminal_reason } : {}),
        updatedAt: row.updated_at,
      }),
    );
  }

  startBranchExecution(
    runId: string,
    groupId: string,
    branchId: string,
    dispatchId: string,
    providerCall: boolean,
    updatedAt: string,
    approvalId?: string,
  ): BranchExecutionState {
    this.#assertWritable();
    return this.#transaction(() => {
      const group = this.findBranchGroup(runId, groupId);
      const state = this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      );
      if (
        !group ||
        !state ||
        state.lifecycle !== "ready" ||
        group.cancelRequested ||
        !["pending", "running"].includes(group.lifecycle)
      ) {
        throw new Error("Branch is not eligible for dispatch");
      }
      const branchRow = this.#database
        .prepare(
          `SELECT max_provider_calls, provider_calls_used FROM branch_executions
           WHERE run_id = ? AND group_id = ? AND branch_id = ?`,
        )
        .get(runId, groupId, branchId) as {
        max_provider_calls: number;
        provider_calls_used: number;
      };
      const charge = providerCall ? 1 : 0;
      if (
        branchRow.provider_calls_used + charge > branchRow.max_provider_calls ||
        group.providerCallsUsed + charge > group.maxProviderCalls
      ) {
        throw new Error("Branch provider-call budget is exhausted");
      }
      const durableStep = this.#findDurableWorkflowStep(runId, state.stepId);
      const workflow = this.findDurableWorkflow(runId);
      if (
        !durableStep ||
        durableStep.lifecycle !== "ready" ||
        durableStep.dispatchStarted ||
        !workflow ||
        workflow.lifecycle !== "running"
      ) {
        throw new Error("Durable branch step is not ready");
      }
      this.#database
        .prepare(
          `UPDATE branch_executions SET lifecycle = 'running',
             provider_calls_used = provider_calls_used + ?, dispatch_id = ?,
             approval_id = ?, revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND branch_id = ?
             AND lifecycle = 'ready' AND revision = ?`,
        )
        .run(
          charge,
          dispatchId,
          approvalId ?? null,
          updatedAt,
          runId,
          groupId,
          branchId,
          state.revision,
        );
      this.#database
        .prepare(
          `UPDATE branch_groups SET lifecycle = 'running',
             provider_calls_used = provider_calls_used + ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND revision = ?`,
        )
        .run(charge, updatedAt, runId, groupId, group.revision);
      this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = 'running',
             dispatch_started = 1, approval_id = ?, revision = revision + 1,
             updated_at = ?
           WHERE run_id = ? AND step_id = ? AND lifecycle = 'ready'
             AND dispatch_started = 0 AND revision = ?`,
        )
        .run(
          approvalId ?? null,
          updatedAt,
          runId,
          state.stepId,
          durableStep.revision,
        );
      this.#database
        .prepare(
          `UPDATE durable_workflow_executions
           SET dispatched_step_ids_json = ?,
             provider_calls_used = provider_calls_used + ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND revision = ?`,
        )
        .run(
          JSON.stringify([...workflow.budget.dispatchedStepIds, state.stepId]),
          charge,
          updatedAt,
          runId,
          workflow.revision,
        );
      this.#audit.append({
        eventType: "workflow.step_state_changed",
        subjectId: runId,
        payload: { branchId, from: "ready", groupId, to: "running" },
      });
      return this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      )!;
    });
  }

  finishBranchExecution(
    runId: string,
    groupId: string,
    branchId: string,
    evidenceInput: StepEvidence,
    outputBytes: number,
  ): BranchExecutionState {
    this.#assertWritable();
    const evidence = stepEvidenceSchema.parse(evidenceInput);
    const lifecycle =
      evidence.outcome === "timed_out" ? "failed" : evidence.outcome;
    if (!Number.isSafeInteger(outputBytes) || outputBytes < 0) {
      throw new Error("Invalid branch output accounting");
    }
    return this.#transaction(() => {
      const group = this.findBranchGroup(runId, groupId);
      const state = this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      );
      const workflow = this.findDurableWorkflow(runId);
      const durableStep = this.#findDurableWorkflowStep(runId, evidence.stepId);
      const branchBudget = this.#database
        .prepare(
          `SELECT max_output_bytes, output_bytes_observed FROM branch_executions
           WHERE run_id = ? AND group_id = ? AND branch_id = ?`,
        )
        .get(runId, groupId, branchId) as {
        max_output_bytes: number;
        output_bytes_observed: number;
      };
      if (
        !group ||
        !state ||
        !["running", "cancel_requested"].includes(state.lifecycle) ||
        !workflow ||
        !durableStep ||
        durableStep.lifecycle !== "running" ||
        branchBudget.output_bytes_observed + outputBytes >
          branchBudget.max_output_bytes ||
        group.outputBytesObserved + outputBytes > group.maxOutputBytes
      ) {
        throw new Error("Invalid or over-budget branch terminal transition");
      }
      this.#insertEvidence(evidence);
      this.#database
        .prepare(
          `UPDATE branch_executions SET lifecycle = ?, evidence_id = ?,
             output_bytes_observed = output_bytes_observed + ?, terminal_reason = ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND branch_id = ?
             AND lifecycle IN ('running', 'cancel_requested') AND revision = ?`,
        )
        .run(
          lifecycle,
          evidence.id,
          outputBytes,
          evidence.summary,
          evidence.observedAt,
          runId,
          groupId,
          branchId,
          state.revision,
        );
      this.#database
        .prepare(
          `UPDATE branch_groups SET output_bytes_observed = output_bytes_observed + ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND revision = ?`,
        )
        .run(outputBytes, evidence.observedAt, runId, groupId, group.revision);
      this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = ?, evidence_id = ?,
             output_digest = ?, terminal_reason = ?, revision = revision + 1,
             updated_at = ? WHERE run_id = ? AND step_id = ?
             AND lifecycle = 'running' AND revision = ?`,
        )
        .run(
          evidence.outcome,
          evidence.id,
          evidence.outputDigest ?? null,
          evidence.summary,
          evidence.observedAt,
          runId,
          evidence.stepId,
          durableStep.revision,
        );
      this.#database
        .prepare(
          `UPDATE durable_workflow_executions SET output_bytes_observed = output_bytes_observed + ?,
             revision = revision + 1, updated_at = ? WHERE run_id = ? AND revision = ?`,
        )
        .run(outputBytes, evidence.observedAt, runId, workflow.revision);
      if (lifecycle === "succeeded") {
        this.#releaseReadySteps(runId, evidence.observedAt);
      }
      this.#audit.append({
        eventType: "workflow.step_state_changed",
        subjectId: runId,
        payload: {
          branchId,
          evidenceId: evidence.id,
          from: "running",
          groupId,
          to: lifecycle,
        },
      });
      return this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      )!;
    });
  }

  markBranchUnknown(
    runId: string,
    groupId: string,
    branchId: string,
    updatedAt: string,
    reason: string,
  ): void {
    this.#assertWritable();
    this.#transaction(() => {
      const state = this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      );
      if (
        !state ||
        !["running", "cancel_requested"].includes(state.lifecycle)
      ) {
        throw new Error("Only an active branch can become unknown");
      }
      this.#database
        .prepare(
          `UPDATE branch_executions SET lifecycle = 'unknown', terminal_reason = ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND branch_id = ? AND revision = ?`,
        )
        .run(reason, updatedAt, runId, groupId, branchId, state.revision);
      this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = 'unknown', terminal_reason = ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND step_id = ? AND lifecycle = 'running'`,
        )
        .run(reason, updatedAt, runId, state.stepId);
      this.#database
        .prepare(
          `UPDATE branch_groups SET lifecycle = 'blocked', revision = revision + 1,
             updated_at = ? WHERE run_id = ? AND group_id = ?`,
        )
        .run(updatedAt, runId, groupId);
      this.#database
        .prepare(
          `UPDATE durable_workflow_executions SET lifecycle = 'blocked',
             terminal_reason = ?, revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND lifecycle = 'running'`,
        )
        .run(reason, updatedAt, runId);
    });
  }

  requestBranchGroupCancellation(
    runId: string,
    groupId: string,
    updatedAt: string,
  ): BranchExecutionState[] {
    this.#assertWritable();
    return this.#transaction(() => {
      const group = this.findBranchGroup(runId, groupId);
      if (!group) throw new Error("Branch group not found");
      if (group.cancelRequested)
        return this.listBranchExecutions(runId, groupId);
      this.#database
        .prepare(
          `UPDATE branch_groups SET cancel_requested = 1, revision = revision + 1,
             updated_at = ? WHERE run_id = ? AND group_id = ? AND revision = ?`,
        )
        .run(updatedAt, runId, groupId, group.revision);
      this.#database
        .prepare(
          `UPDATE branch_executions SET lifecycle = 'cancelled', terminal_reason = 'group_cancelled_before_dispatch',
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND lifecycle IN ('pending', 'ready')`,
        )
        .run(updatedAt, runId, groupId);
      this.#database
        .prepare(
          `UPDATE branch_executions SET lifecycle = 'cancel_requested',
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND lifecycle = 'running'`,
        )
        .run(updatedAt, runId, groupId);
      this.#database
        .prepare(
          `UPDATE durable_workflow_steps SET lifecycle = 'blocked',
             terminal_reason = 'group_cancelled_before_dispatch', revision = revision + 1,
             updated_at = ? WHERE run_id = ? AND step_id IN (
               SELECT step_id FROM branch_executions
               WHERE run_id = ? AND group_id = ? AND lifecycle = 'cancelled'
             ) AND lifecycle IN ('pending', 'ready')`,
        )
        .run(updatedAt, runId, runId, groupId);
      return this.listBranchExecutions(runId, groupId);
    });
  }

  requestBranchCancellation(
    runId: string,
    groupId: string,
    branchId: string,
    updatedAt: string,
  ): BranchExecutionState {
    this.#assertWritable();
    return this.#transaction(() => {
      const state = this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      );
      if (!state) throw new Error("Branch not found");
      if (
        state.lifecycle === "cancel_requested" ||
        state.lifecycle === "cancelled"
      ) {
        return state;
      }
      if (state.lifecycle === "running") {
        this.#database
          .prepare(
            `UPDATE branch_executions SET lifecycle = 'cancel_requested',
               revision = revision + 1, updated_at = ?
             WHERE run_id = ? AND group_id = ? AND branch_id = ?
               AND lifecycle = 'running' AND revision = ?`,
          )
          .run(updatedAt, runId, groupId, branchId, state.revision);
      } else if (["pending", "ready"].includes(state.lifecycle)) {
        this.#database
          .prepare(
            `UPDATE branch_executions SET lifecycle = 'cancelled',
               terminal_reason = 'cancelled_before_dispatch',
               revision = revision + 1, updated_at = ?
             WHERE run_id = ? AND group_id = ? AND branch_id = ?
               AND lifecycle IN ('pending', 'ready') AND revision = ?`,
          )
          .run(updatedAt, runId, groupId, branchId, state.revision);
        this.#database
          .prepare(
            `UPDATE durable_workflow_steps SET lifecycle = 'blocked',
               terminal_reason = 'cancelled_before_dispatch',
               revision = revision + 1, updated_at = ?
             WHERE run_id = ? AND step_id = ? AND lifecycle IN ('pending', 'ready')`,
          )
          .run(updatedAt, runId, state.stepId);
      } else {
        return state;
      }
      return this.listBranchExecutions(runId, groupId).find(
        (branch) => branch.branchId === branchId,
      )!;
    });
  }

  recordFanInResult(
    resultInput: FanInResult,
    updatedAt: string,
  ): PersistedBranchGroup {
    this.#assertWritable();
    const result = fanInResultSchema.parse(resultInput);
    return this.#transaction(() => {
      const group = this.findBranchGroup(result.runId, result.groupId);
      if (!group) throw new Error("Branch group not found");
      const update = this.#database
        .prepare(
          `UPDATE branch_groups SET lifecycle = ?, fan_in_json = ?,
             revision = revision + 1, updated_at = ?
           WHERE run_id = ? AND group_id = ? AND revision = ?`,
        )
        .run(
          result.status,
          JSON.stringify(result),
          updatedAt,
          result.runId,
          result.groupId,
          group.revision,
        );
      if (update.changes !== 1)
        throw new Error("Branch group changed concurrently");
      this.#audit.append({
        eventType: "workflow.state_changed",
        subjectId: result.runId,
        payload: {
          groupId: result.groupId,
          succeededBranches: result.succeededBranches,
          to: result.status,
        },
      });
      return this.findBranchGroup(result.runId, result.groupId)!;
    });
  }

  updateRunStatus(
    runId: string,
    nextStatus: ExecutionRun["status"],
    updatedAt: string,
  ): ExecutionRun {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.findRun(runId);
      if (!current) throw new Error(`Execution run not found: ${runId}`);
      if (!allowedRunTransitions[current.status].includes(nextStatus)) {
        throw new Error(
          `Invalid run transition: ${current.status} -> ${nextStatus}`,
        );
      }
      const parsed = executionRunSchema.parse({
        ...current,
        status: nextStatus,
        updatedAt,
      });
      const result = this.#database
        .prepare(
          "UPDATE execution_runs SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
        )
        .run(nextStatus, parsed.updatedAt, runId, current.status);
      if (result.changes !== 1) {
        throw new Error("Execution run changed concurrently");
      }
      this.#audit.append({
        eventType: "execution.run_status_changed",
        subjectId: runId,
        payload: { from: current.status, to: nextStatus },
      });
      return parsed;
    });
  }

  recoverRunningRuns(updatedAt: string): string[] {
    this.#assertWritable();
    return this.#transaction(() => {
      const rows = this.#database
        .prepare("SELECT id FROM execution_runs WHERE status = 'running'")
        .all() as { id: string }[];
      const update = this.#database.prepare(
        "UPDATE execution_runs SET status = 'orphaned', updated_at = ? WHERE id = ? AND status = 'running'",
      );
      const recovered: string[] = [];
      for (const row of rows) {
        const attempts = this.#database
          .prepare(
            `SELECT id, remote_state, request_digest, step_id
             FROM provider_execution_attempts
             WHERE run_id = ? AND remote_state IN (
               'dispatching', 'accepted', 'running', 'cancel_requested'
             )`,
          )
          .all(row.id) as {
          id: string;
          remote_state: string;
          request_digest: string;
          step_id: string;
        }[];
        for (const attempt of attempts) {
          this.#database
            .prepare(
              `UPDATE provider_execution_attempts
               SET remote_state = 'remote_state_unknown', updated_at = ?
               WHERE id = ? AND remote_state = ?`,
            )
            .run(updatedAt, attempt.id, attempt.remote_state);
          this.#audit.append({
            eventType: "provider.remote_state_changed",
            subjectId: attempt.id,
            payload: {
              from: attempt.remote_state,
              reason: "runtime_restart_recovery",
              requestDigest: attempt.request_digest,
              runId: row.id,
              stepId: attempt.step_id,
              to: "remote_state_unknown",
            },
          });
        }
        const runningSteps = this.#database
          .prepare(
            `SELECT step_id FROM durable_workflow_steps
             WHERE run_id = ? AND lifecycle = 'running'`,
          )
          .all(row.id) as { step_id: string }[];
        for (const step of runningSteps) {
          this.#database
            .prepare(
              `UPDATE durable_workflow_steps
               SET lifecycle = 'unknown', revision = revision + 1,
                 terminal_reason = 'runtime_restart_state_uncertain', updated_at = ?
               WHERE run_id = ? AND step_id = ? AND lifecycle = 'running'`,
            )
            .run(updatedAt, row.id, step.step_id);
          this.#audit.append({
            eventType: "workflow.step_state_changed",
            subjectId: row.id,
            payload: {
              from: "running",
              reason: "runtime_restart_state_uncertain",
              stepId: step.step_id,
              to: "unknown",
            },
          });
        }
        this.#database
          .prepare(
            `UPDATE branch_executions SET lifecycle = 'unknown',
               revision = revision + 1,
               terminal_reason = 'runtime_restart_state_uncertain', updated_at = ?
             WHERE run_id = ? AND lifecycle IN ('running', 'cancel_requested')`,
          )
          .run(updatedAt, row.id);
        this.#database
          .prepare(
            `UPDATE branch_groups SET lifecycle = 'blocked',
               revision = revision + 1, updated_at = ?
             WHERE run_id = ? AND lifecycle IN ('pending', 'running')
               AND EXISTS (
                 SELECT 1 FROM branch_executions branch
                 WHERE branch.run_id = branch_groups.run_id
                   AND branch.group_id = branch_groups.group_id
                   AND branch.lifecycle = 'unknown'
               )`,
          )
          .run(updatedAt, row.id);
        this.#database
          .prepare(
            `UPDATE durable_workflow_executions
             SET lifecycle = 'blocked', revision = revision + 1,
               terminal_reason = ?, updated_at = ?
             WHERE run_id = ? AND lifecycle IN ('prepared', 'running')`,
          )
          .run(
            runningSteps.length > 0
              ? "runtime_restart_state_uncertain"
              : "runtime_restart_before_next_dispatch",
            updatedAt,
            row.id,
          );
        const result = update.run(updatedAt, row.id);
        if (result.changes !== 1) continue;
        recovered.push(row.id);
        this.#audit.append({
          eventType: "execution.run_status_changed",
          subjectId: row.id,
          payload: {
            from: "running",
            reason: "runtime_restart_recovery",
            to: "orphaned",
          },
        });
      }
      return recovered;
    });
  }

  findPlanBinding(planId: string): PlanExecutionBinding | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        `SELECT
          plans.id AS plan_id,
          plans.request_id,
          plans.registry_snapshot_id,
          plans.plan_digest,
          evaluations.status AS evaluation_status
        FROM execution_plans AS plans
        JOIN plan_evaluations AS evaluations ON evaluations.plan_id = plans.id
        WHERE plans.id = ?`,
      )
      .get(planId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return planExecutionBindingSchema.parse({
      planId: row.plan_id,
      requestId: row.request_id,
      registrySnapshotId: row.registry_snapshot_id,
      planDigest: row.plan_digest,
      evaluationStatus: row.evaluation_status,
    });
  }

  createApproval(input: ApprovalRecord): ApprovalRecord {
    this.#assertWritable();
    const approval = approvalRecordSchema.parse(input);
    if (approval.status !== "pending") {
      throw new Error("New approvals must start pending");
    }
    if (Date.parse(approval.expiresAt) <= Date.parse(approval.requestedAt)) {
      throw new Error("Approval expiry must be after its request time");
    }
    return this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO approvals(
            id, plan_id, step_id, action_digest, plan_digest,
            ruleset_version, descriptor_json, status, requested_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          approval.id,
          approval.planId,
          approval.stepId,
          approval.actionDigest,
          approval.planDigest,
          approval.rulesetVersion,
          JSON.stringify(approval.descriptor),
          approval.status,
          approval.requestedAt,
          approval.expiresAt,
        );
      this.#audit.append({
        eventType: "approval.requested",
        subjectId: approval.id,
        payload: {
          actionDigest: approval.actionDigest,
          planId: approval.planId,
          stepId: approval.stepId,
        },
      });
      return approval;
    });
  }

  findApproval(approvalId: string): ApprovalRecord | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM approvals WHERE id = ?")
      .get(approvalId) as Record<string, unknown> | undefined;
    return row ? rowToApproval(row) : undefined;
  }

  decideApproval(
    approvalId: string,
    decision: "grant" | "deny",
    actor: string,
    decidedAt: string,
  ): ApprovalRecord {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.findApproval(approvalId);
      if (!current) throw new Error(`Approval not found: ${approvalId}`);
      if (current.status !== "pending") {
        throw new Error(`Approval is not pending: ${current.status}`);
      }
      const expired = Date.parse(current.expiresAt) <= Date.parse(decidedAt);
      const status = expired
        ? ("expired" as const)
        : decision === "grant"
          ? ("granted" as const)
          : ("denied" as const);
      const parsed = approvalRecordSchema.parse({
        ...current,
        status,
        decidedAt,
        actor,
      });
      const result = this.#database
        .prepare(
          `UPDATE approvals
           SET status = ?, decided_at = ?, actor = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(status, decidedAt, actor, approvalId);
      if (result.changes !== 1)
        throw new Error("Approval changed concurrently");
      this.#audit.append({
        eventType: expired
          ? "approval.expired"
          : decision === "grant"
            ? "approval.granted"
            : "approval.denied",
        subjectId: approvalId,
        payload: { actor, actionDigest: current.actionDigest },
      });
      return parsed;
    });
  }

  consumeApproval(
    approvalId: string,
    expectedActionDigest: string,
    consumedAt: string,
  ): ApprovalRecord {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.findApproval(approvalId);
      if (!current) throw new Error(`Approval not found: ${approvalId}`);
      if (current.actionDigest !== expectedActionDigest) {
        throw new Error("Approval digest does not match the current effect");
      }
      if (current.status !== "granted") return current;
      const expired = Date.parse(current.expiresAt) <= Date.parse(consumedAt);
      const status = expired ? ("expired" as const) : ("consumed" as const);
      const parsed = approvalRecordSchema.parse({
        ...current,
        status,
        ...(expired ? {} : { consumedAt }),
      });
      const result = this.#database
        .prepare(
          `UPDATE approvals
           SET status = ?, consumed_at = ?
           WHERE id = ? AND status = 'granted' AND action_digest = ?`,
        )
        .run(
          status,
          expired ? null : consumedAt,
          approvalId,
          expectedActionDigest,
        );
      if (result.changes !== 1)
        throw new Error("Approval changed concurrently");
      this.#audit.append({
        eventType: expired ? "approval.expired" : "approval.consumed",
        subjectId: approvalId,
        payload: { actionDigest: current.actionDigest },
      });
      return parsed;
    });
  }

  appendEvidence(input: StepEvidence): void {
    this.#assertWritable();
    const evidence = stepEvidenceSchema.parse(input);
    this.#transaction(() => {
      this.#insertEvidence(evidence);
    });
  }

  #insertEvidence(evidence: StepEvidence): void {
    this.#database
      .prepare(
        `INSERT INTO step_evidence(
          id, run_id, plan_id, step_id, capability_id, subsystem,
          capability_version, outcome, observed_at, summary, output_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        evidence.id,
        evidence.runId,
        evidence.planId,
        evidence.stepId,
        evidence.capabilityId,
        evidence.subsystem,
        evidence.capabilityVersion,
        evidence.outcome,
        evidence.observedAt,
        evidence.summary,
        evidence.outputDigest ?? null,
      );
    this.#audit.append({
      eventType: "execution.evidence_recorded",
      subjectId: evidence.runId,
      payload: {
        capabilityId: evidence.capabilityId,
        evidenceId: evidence.id,
        outcome: evidence.outcome,
        planId: evidence.planId,
        stepId: evidence.stepId,
      },
    });
  }

  #findDurableWorkflowStep(
    runId: string,
    stepId: string,
  ): DurableWorkflowStep | undefined {
    const row = this.#database
      .prepare(
        "SELECT * FROM durable_workflow_steps WHERE run_id = ? AND step_id = ?",
      )
      .get(runId, stepId) as Record<string, unknown> | undefined;
    return row ? rowToWorkflowStep(row) : undefined;
  }

  #validateDurableWorkflowBinding(workflow: DurableWorkflowExecution): void {
    const binding = this.#database
      .prepare(
        `SELECT runs.plan_id, runs.plan_digest,
           COALESCE(requests.workspace_id, '00000000-0000-4000-8000-000000000000') AS workspace_id,
           contexts.context_id, contexts.revision, contexts.digest
         FROM execution_runs AS runs
         JOIN orchestration_requests AS requests ON requests.id = runs.request_id
         JOIN project_context_snapshots AS contexts
           ON contexts.request_id = runs.request_id
         WHERE runs.id = ?`,
      )
      .get(workflow.runId) as Record<string, unknown> | undefined;
    if (
      !binding ||
      binding.plan_id !== workflow.workflowId ||
      binding.plan_digest !== workflow.planDigest ||
      binding.workspace_id !== workflow.workspaceId ||
      binding.context_id !== workflow.projectContextId ||
      binding.revision !== workflow.projectContextRevision ||
      binding.digest !== workflow.projectContextDigest
    ) {
      throw new Error("Durable workflow binding is inconsistent");
    }
  }

  #releaseReadySteps(runId: string, updatedAt: string): void {
    const pending = this.#database
      .prepare(
        `SELECT * FROM durable_workflow_steps
         WHERE run_id = ? AND lifecycle = 'pending'`,
      )
      .all(runId) as Record<string, unknown>[];
    for (const row of pending) {
      const step = rowToWorkflowStep(row);
      const dependencies = step.dependencies.map((dependency) =>
        this.#findDurableWorkflowStep(runId, dependency),
      );
      if (
        dependencies.length === step.dependencies.length &&
        dependencies.every(
          (dependency) => dependency?.lifecycle === "succeeded",
        )
      ) {
        this.#database
          .prepare(
            `UPDATE durable_workflow_steps SET lifecycle = 'ready',
               revision = revision + 1, updated_at = ?
             WHERE run_id = ? AND step_id = ? AND lifecycle = 'pending'`,
          )
          .run(updatedAt, runId, step.stepId);
      }
    }
  }

  saveProviderExecutionAttempt(
    input: ProviderExecutionAttempt,
  ): ProviderExecutionAttempt {
    this.#assertWritable();
    const attempt = providerExecutionAttemptSchema.parse(input);
    if (attempt.remoteState !== "not_dispatched") {
      throw new Error("New provider attempts must start not_dispatched");
    }
    return this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO provider_execution_attempts(
            id, run_id, plan_id, step_id, capability_id, adapter_id,
            adapter_version, adapter_build_digest, provider_id, transport,
            request_digest, context_digest, effect_class,
            recovery_capabilities_json, remote_state, budget_json,
            created_at, updated_at, resolution_actor
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          attempt.id,
          attempt.runId,
          attempt.planId,
          attempt.stepId,
          attempt.capabilityId,
          attempt.adapterId,
          attempt.adapterVersion,
          attempt.adapterBuildDigest,
          attempt.providerId,
          attempt.transport,
          attempt.requestDigest,
          attempt.contextDigest,
          attempt.effectClass,
          JSON.stringify(attempt.recoveryCapabilities),
          attempt.remoteState,
          JSON.stringify(attempt.budget),
          attempt.createdAt,
          attempt.updatedAt,
        );
      this.#audit.append({
        eventType: "provider.attempt_recorded",
        subjectId: attempt.id,
        payload: {
          effectClass: attempt.effectClass,
          adapterBuildDigest: attempt.adapterBuildDigest,
          adapterVersion: attempt.adapterVersion,
          contextDigest: attempt.contextDigest,
          planId: attempt.planId,
          requestDigest: attempt.requestDigest,
          runId: attempt.runId,
          stepId: attempt.stepId,
        },
      });
      return attempt;
    });
  }

  findProviderExecutionAttempt(
    attemptId: string,
  ): ProviderExecutionAttempt | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM provider_execution_attempts WHERE id = ?")
      .get(attemptId) as Record<string, unknown> | undefined;
    return row ? rowToProviderExecutionAttempt(row) : undefined;
  }

  findProviderExecutionAttemptForRun(
    runId: string,
    stepId: string,
  ): ProviderExecutionAttempt | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare(
        "SELECT * FROM provider_execution_attempts WHERE run_id = ? AND step_id = ?",
      )
      .get(runId, stepId) as Record<string, unknown> | undefined;
    return row ? rowToProviderExecutionAttempt(row) : undefined;
  }

  updateProviderExecutionState(
    attemptId: string,
    remoteState: ProviderExecutionAttempt["remoteState"],
    updatedAt: string,
    resolutionActor?: string,
  ): ProviderExecutionAttempt {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.findProviderExecutionAttempt(attemptId);
      if (!current) throw new Error("Provider execution attempt not found");
      const transitions: Readonly<
        Record<
          ProviderExecutionAttempt["remoteState"],
          readonly ProviderExecutionAttempt["remoteState"][]
        >
      > = {
        not_dispatched: ["dispatching"],
        dispatching: [
          "accepted",
          "running",
          "cancel_requested",
          "succeeded",
          "failed",
          "cancelled",
          "remote_state_unknown",
        ],
        accepted: [
          "running",
          "cancel_requested",
          "succeeded",
          "failed",
          "cancelled",
          "remote_state_unknown",
        ],
        running: [
          "cancel_requested",
          "succeeded",
          "failed",
          "cancelled",
          "remote_state_unknown",
        ],
        cancel_requested: [
          "running",
          "cancelled",
          "failed",
          "remote_state_unknown",
        ],
        remote_state_unknown: ["succeeded", "failed", "cancelled"],
        succeeded: [],
        failed: [],
        cancelled: [],
      };
      const allowedTransitions = transitions[current.remoteState];
      if (!allowedTransitions?.includes(remoteState)) {
        throw new Error(
          `Invalid provider state transition: ${current.remoteState} -> ${remoteState}`,
        );
      }
      const normalizedActor = resolutionActor?.trim();
      if (
        current.remoteState === "remote_state_unknown" &&
        (!normalizedActor || normalizedActor.length > 120)
      ) {
        throw new Error("Human resolution requires an actor");
      }
      if (
        current.remoteState !== "remote_state_unknown" &&
        normalizedActor !== undefined
      ) {
        throw new Error("Resolution actor is only valid after unknown state");
      }
      const parsed = providerExecutionAttemptSchema.parse({
        ...current,
        remoteState,
        updatedAt,
        ...(normalizedActor ? { resolutionActor: normalizedActor } : {}),
      });
      const result = this.#database
        .prepare(
          `UPDATE provider_execution_attempts
           SET remote_state = ?, updated_at = ?, resolution_actor = ?
           WHERE id = ? AND remote_state = ?`,
        )
        .run(
          remoteState,
          updatedAt,
          normalizedActor ?? null,
          attemptId,
          current.remoteState,
        );
      if (result.changes !== 1) {
        throw new Error("Provider execution attempt changed concurrently");
      }
      this.#audit.append({
        eventType: normalizedActor
          ? "provider.remote_state_resolved"
          : "provider.remote_state_changed",
        subjectId: attemptId,
        payload: {
          from: current.remoteState,
          requestDigest: current.requestDigest,
          runId: current.runId,
          stepId: current.stepId,
          to: remoteState,
          ...(normalizedActor ? { actor: normalizedActor } : {}),
        },
      });
      return parsed;
    });
  }

  saveProviderCheckpoint(
    input: ProviderCheckpointRecord,
  ): ProviderCheckpointRecord {
    this.#assertWritable();
    const checkpoint = providerCheckpointRecordSchema.parse(input);
    if (checkpoint.status !== "active" || checkpoint.consumedAt) {
      throw new Error("Saved provider checkpoints must be active");
    }
    return this.#transaction(() => {
      const existing = this.#database
        .prepare(
          "SELECT * FROM provider_checkpoints WHERE run_id = ? AND step_id = ?",
        )
        .get(checkpoint.runId, checkpoint.stepId) as
        Record<string, unknown> | undefined;
      const stored = existing
        ? providerCheckpointRecordSchema.parse({
            ...checkpoint,
            id: existing.id,
          })
        : checkpoint;
      if (existing && existing.status !== "active") {
        throw new Error("Consumed provider checkpoint cannot be replaced");
      }
      if (existing) {
        this.#database
          .prepare(
            `UPDATE provider_checkpoints
             SET capability_id = ?, adapter_id = ?, provider_id = ?,
                 request_digest = ?, checkpoint_json = ?, observed_at = ?
             WHERE id = ? AND status = 'active'`,
          )
          .run(
            stored.capabilityId,
            stored.adapterId,
            stored.providerId,
            stored.requestDigest,
            JSON.stringify(stored.checkpoint),
            stored.observedAt,
            stored.id,
          );
      } else {
        this.#database
          .prepare(
            `INSERT INTO provider_checkpoints(
              id, run_id, plan_id, step_id, capability_id, adapter_id,
              provider_id, request_digest, checkpoint_json, status, observed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            stored.id,
            stored.runId,
            stored.planId,
            stored.stepId,
            stored.capabilityId,
            stored.adapterId,
            stored.providerId,
            stored.requestDigest,
            JSON.stringify(stored.checkpoint),
            stored.status,
            stored.observedAt,
          );
      }
      this.#audit.append({
        eventType: "provider.checkpoint_recorded",
        subjectId: stored.id,
        payload: {
          checkpointDigest: stored.checkpoint.checkpointDigest,
          planId: stored.planId,
          runId: stored.runId,
          stepId: stored.stepId,
        },
      });
      return stored;
    });
  }

  findProviderCheckpoint(
    checkpointId: string,
  ): ProviderCheckpointRecord | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM provider_checkpoints WHERE id = ?")
      .get(checkpointId) as Record<string, unknown> | undefined;
    return row ? rowToProviderCheckpoint(row) : undefined;
  }

  consumeProviderCheckpoint(
    checkpointId: string,
    consumedAt: string,
  ): ProviderCheckpointRecord {
    this.#assertWritable();
    return this.#transaction(() => {
      const current = this.findProviderCheckpoint(checkpointId);
      if (!current) throw new Error("Provider checkpoint not found");
      if (current.status !== "active") {
        throw new Error("Provider checkpoint is not active");
      }
      const consumed = providerCheckpointRecordSchema.parse({
        ...current,
        status: "consumed",
        consumedAt,
      });
      const result = this.#database
        .prepare(
          `UPDATE provider_checkpoints
           SET status = 'consumed', consumed_at = ?
           WHERE id = ? AND status = 'active'`,
        )
        .run(consumedAt, checkpointId);
      if (result.changes !== 1) {
        throw new Error("Provider checkpoint changed concurrently");
      }
      this.#audit.append({
        eventType: "provider.checkpoint_consumed",
        subjectId: checkpointId,
        payload: {
          checkpointDigest: current.checkpoint.checkpointDigest,
          runId: current.runId,
          stepId: current.stepId,
        },
      });
      return consumed;
    });
  }

  saveMemoryEntry(entry: PersistedMemoryEntry): PersistedMemoryEntry {
    this.#assertWritable();
    assertMemoryEntry(entry);
    return this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO memory_entries(
            id, namespace, subject_digest, content, content_digest,
            provenance_json, source_run_id, source_plan_id, source_step_id,
            created_at, expires_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .run(
          entry.id,
          entry.namespace,
          entry.subjectDigest,
          entry.content,
          entry.contentDigest,
          JSON.stringify(entry.provenance),
          entry.sourceRunId,
          entry.sourcePlanId,
          entry.sourceStepId,
          entry.createdAt,
          entry.expiresAt,
        );
      this.#audit.append({
        eventType: "memory.entry_stored",
        subjectId: entry.id,
        payload: {
          namespace: entry.namespace,
          subjectDigest: entry.subjectDigest,
          contentDigest: entry.contentDigest,
          sourceRunId: entry.sourceRunId,
          sourcePlanId: entry.sourcePlanId,
          sourceStepId: entry.sourceStepId,
          expiresAt: entry.expiresAt,
        },
      });
      return entry;
    });
  }

  listMemoryEntries(
    namespace: string,
    now: string,
    limit: number,
  ): PersistedMemoryEntry[] {
    this.#assertOpen();
    if (!namespace || namespace.length > 120) {
      throw new Error("Invalid memory namespace");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 32) {
      throw new Error("Memory query limit must be between 1 and 32");
    }
    if (!Number.isFinite(Date.parse(now)))
      throw new Error("Invalid query time");
    return (
      this.#database
        .prepare(
          `SELECT * FROM memory_entries
           WHERE namespace = ? AND deleted_at IS NULL AND expires_at > ?
           ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .all(namespace, now, limit) as Record<string, unknown>[]
    ).map(rowToMemoryEntry);
  }

  deleteMemoryEntry(id: string, deletedAt: string): PersistedMemoryEntry {
    this.#assertWritable();
    if (!Number.isFinite(Date.parse(deletedAt))) {
      throw new Error("Invalid deletion time");
    }
    return this.#transaction(() => {
      const result = this.#database
        .prepare(
          `UPDATE memory_entries
           SET deleted_at = ?, content = '', provenance_json = '{}'
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(deletedAt, id);
      if (Number(result.changes) !== 1) {
        throw new Error("Memory entry is missing or already deleted");
      }
      const row = this.#database
        .prepare("SELECT * FROM memory_entries WHERE id = ?")
        .get(id) as Record<string, unknown>;
      const entry = rowToMemoryEntry(row);
      this.#audit.append({
        eventType: "memory.entry_deleted",
        subjectId: id,
        payload: {
          namespace: entry.namespace,
          contentDigest: entry.contentDigest,
          deletedAt,
        },
      });
      return entry;
    });
  }

  pruneExpiredMemory(now: string): number {
    this.#assertWritable();
    if (!Number.isFinite(Date.parse(now)))
      throw new Error("Invalid prune time");
    return this.#transaction(() => {
      const rows = this.#database
        .prepare(
          `SELECT id, namespace, content_digest FROM memory_entries
           WHERE deleted_at IS NULL AND expires_at <= ? ORDER BY id`,
        )
        .all(now) as Record<string, unknown>[];
      const update = this.#database.prepare(
        `UPDATE memory_entries
         SET deleted_at = ?, content = '', provenance_json = '{}'
         WHERE id = ? AND deleted_at IS NULL`,
      );
      for (const row of rows) {
        update.run(now, String(row.id));
        this.#audit.append({
          eventType: "memory.expired_pruned",
          subjectId: String(row.id),
          payload: {
            namespace: String(row.namespace),
            contentDigest: String(row.content_digest),
            prunedAt: now,
          },
        });
      }
      return rows.length;
    });
  }

  appendAuditEvent(
    eventType: AuditEventType,
    subjectId: string,
    payload: AuditPayload,
  ): AuditEvent {
    this.#assertWritable();
    return this.#transaction(() =>
      this.#audit.append({ eventType, subjectId, payload }),
    );
  }

  findRun(runId: string): ExecutionRun | undefined {
    this.#assertOpen();
    const row = this.#database
      .prepare("SELECT * FROM execution_runs WHERE id = ?")
      .get(runId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return rowToRun(row);
  }

  listExecutionHistory(
    workspaceId: string,
    limit = 25,
  ): PersistedExecutionHistoryEntry[] {
    this.#assertOpen();
    if (
      !workspaceId ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 10_000
    ) {
      throw new Error("Invalid execution history query");
    }
    const rows = this.#database
      .prepare(
        `SELECT
          runs.id AS run_id,
          requests.goal,
          strategies.kind AS strategy_kind,
          CASE WHEN EXISTS (
            SELECT 1 FROM provider_execution_attempts AS attempts
            WHERE attempts.run_id = runs.id
              AND attempts.remote_state = 'remote_state_unknown'
          ) THEN 'remote_state_unknown' ELSE runs.status END AS status,
          runs.created_at,
          runs.updated_at,
          COUNT(evidence.id) AS evidence_count
        FROM execution_runs AS runs
        JOIN orchestration_requests AS requests ON requests.id = runs.request_id
        JOIN strategies ON strategies.plan_id = runs.plan_id
        LEFT JOIN step_evidence AS evidence ON evidence.run_id = runs.id
        WHERE requests.workspace_id = ?
        GROUP BY runs.id, requests.goal, strategies.kind, runs.status,
          runs.created_at, runs.updated_at
        ORDER BY runs.updated_at DESC, runs.id DESC
        LIMIT ?`,
      )
      .all(workspaceId, limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      runId: String(row.run_id),
      goal: String(row.goal),
      strategyKind:
        row.strategy_kind as PersistedExecutionHistoryEntry["strategyKind"],
      status: row.status as PersistedExecutionHistoryEntry["status"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      evidenceCount: Number(row.evidence_count),
    }));
  }

  listEvidence(runId: string): StepEvidence[] {
    this.#assertOpen();
    const rows = this.#database
      .prepare(
        "SELECT * FROM step_evidence WHERE run_id = ? ORDER BY observed_at, id",
      )
      .all(runId) as Record<string, unknown>[];
    return rows.map((row) =>
      stepEvidenceSchema.parse({
        id: row.id,
        runId: row.run_id,
        planId: row.plan_id,
        stepId: row.step_id,
        capabilityId: row.capability_id,
        subsystem: row.subsystem,
        capabilityVersion: row.capability_version,
        outcome: row.outcome,
        observedAt: row.observed_at,
        summary: row.summary,
        ...(row.output_digest ? { outputDigest: row.output_digest } : {}),
      }),
    );
  }

  listAuditEvents(): AuditEvent[] {
    this.#assertOpen();
    return listAuditEvents(this.#database);
  }

  listWorkspaceAuditEvents(workspaceId: string, limit = 50): AuditEvent[] {
    this.#assertOpen();
    if (!workspaceId || !Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("Invalid workspace audit query");
    }
    const requests = this.#database
      .prepare("SELECT id FROM orchestration_requests WHERE workspace_id = ?")
      .all(workspaceId) as { id: string }[];
    const subjects = new Set<string>([
      workspaceId,
      ...requests.map((row) => row.id),
    ]);
    const plans = this.#database
      .prepare(
        `SELECT plans.id FROM execution_plans AS plans
       JOIN orchestration_requests AS requests ON requests.id = plans.request_id
       WHERE requests.workspace_id = ?`,
      )
      .all(workspaceId) as { id: string }[];
    for (const row of plans) subjects.add(row.id);
    const projectContexts = this.#database
      .prepare(
        "SELECT context_id FROM project_context_snapshots WHERE workspace_id = ?",
      )
      .all(workspaceId) as { context_id: string }[];
    for (const row of projectContexts) subjects.add(row.context_id);
    const runs = this.#database
      .prepare(
        `SELECT runs.id FROM execution_runs AS runs
       JOIN orchestration_requests AS requests ON requests.id = runs.request_id
       WHERE requests.workspace_id = ?`,
      )
      .all(workspaceId) as { id: string }[];
    for (const row of runs) subjects.add(row.id);
    for (const table of [
      "step_evidence",
      "provider_checkpoints",
      "provider_execution_attempts",
      "memory_entries",
    ] as const) {
      const rows = this.#database
        .prepare(
          `SELECT records.id FROM ${table} AS records
         JOIN execution_runs AS runs ON runs.id = records.${table === "memory_entries" ? "source_run_id" : "run_id"}
         JOIN orchestration_requests AS requests ON requests.id = runs.request_id
         WHERE requests.workspace_id = ?`,
        )
        .all(workspaceId) as { id: string }[];
      for (const row of rows) subjects.add(row.id);
    }
    const approvals = this.#database
      .prepare(
        `SELECT approvals.id FROM approvals
       JOIN execution_plans AS plans ON plans.id = approvals.plan_id
       JOIN orchestration_requests AS requests ON requests.id = plans.request_id
       WHERE requests.workspace_id = ?`,
      )
      .all(workspaceId) as { id: string }[];
    for (const row of approvals) subjects.add(row.id);
    return listAuditEvents(this.#database)
      .filter((event) => subjects.has(event.subjectId))
      .slice(-limit)
      .reverse();
  }

  findLatestProjectContext(
    workspaceId: string,
  ): ProjectContextSnapshot | undefined {
    this.#assertOpen();
    if (!workspaceId) throw new Error("Invalid workspace id");
    const row = this.#database
      .prepare(
        `SELECT snapshot_json FROM project_context_snapshots
         WHERE workspace_id = ? AND expires_at > ?
         ORDER BY created_at DESC, revision DESC LIMIT 1`,
      )
      .get(workspaceId, this.#clock().toISOString()) as
      { snapshot_json: string } | undefined;
    return row
      ? projectContextSnapshotSchema.parse(JSON.parse(row.snapshot_json))
      : undefined;
  }

  pruneExpiredProjectContexts(workspaceId: string, now: string): number {
    this.#assertWritable();
    if (!workspaceId || !Number.isFinite(Date.parse(now))) {
      throw new Error("Invalid Project Context retention boundary");
    }
    return this.#transaction(() => {
      this.#database
        .prepare(
          `DELETE FROM context_slice_manifests
           WHERE workspace_id = ? AND expires_at <= ?`,
        )
        .run(workspaceId, now);
      const result = this.#database
        .prepare(
          `DELETE FROM project_context_snapshots
           WHERE workspace_id = ? AND expires_at <= ?`,
        )
        .run(workspaceId, now);
      if (result.changes > 0) {
        this.#audit.append({
          eventType: "privacy.workspace_data_deleted",
          subjectId: workspaceId,
          payload: {
            deletedProjectContexts: Number(result.changes),
            retention: true,
          },
        });
      }
      return Number(result.changes);
    });
  }

  pruneExpiredDurableWorkflows(workspaceId: string, now: string): number {
    this.#assertWritable();
    if (!workspaceId || !Number.isFinite(Date.parse(now))) {
      throw new Error("Invalid durable workflow retention boundary");
    }
    return this.#transaction(() => {
      const expired = this.#database
        .prepare(
          `SELECT run_id FROM durable_workflow_executions
           WHERE workspace_id = ? AND expires_at <= ? AND lifecycle != 'running'`,
        )
        .all(workspaceId, now) as { run_id: string }[];
      for (const row of expired) {
        this.#database
          .prepare(
            `DELETE FROM context_slice_manifests
             WHERE (slice_id, revision) IN (
               SELECT context_slice_id, context_slice_revision
               FROM branch_executions WHERE run_id = ?
             )`,
          )
          .run(row.run_id);
        this.#database
          .prepare("DELETE FROM branch_executions WHERE run_id = ?")
          .run(row.run_id);
        this.#database
          .prepare("DELETE FROM branch_groups WHERE run_id = ?")
          .run(row.run_id);
        this.#database
          .prepare("DELETE FROM durable_workflow_steps WHERE run_id = ?")
          .run(row.run_id);
        this.#database
          .prepare("DELETE FROM durable_workflow_executions WHERE run_id = ?")
          .run(row.run_id);
      }
      if (expired.length > 0) {
        this.#audit.append({
          eventType: "privacy.workspace_data_deleted",
          subjectId: workspaceId,
          payload: {
            deletedDurableWorkflows: expired.length,
            retention: true,
          },
        });
      }
      return expired.length;
    });
  }

  getWorkspaceRetention(workspaceId: string): number {
    this.#assertOpen();
    if (!workspaceId) throw new Error("Invalid workspace id");
    try {
      const row = this.#database
        .prepare("SELECT days FROM workspace_retention WHERE workspace_id = ?")
        .get(workspaceId) as { days: number } | undefined;
      return row?.days ?? 30;
    } catch (error) {
      if (this.#health.mode === "readonly-recovery") return 30;
      throw error;
    }
  }

  hasWorkspaceRetention(workspaceId: string): boolean {
    this.#assertOpen();
    if (!workspaceId) throw new Error("Invalid workspace id");
    return Boolean(
      this.#database
        .prepare("SELECT 1 FROM workspace_retention WHERE workspace_id = ?")
        .get(workspaceId),
    );
  }

  setWorkspaceRetention(workspaceId: string, days: number): void {
    this.#assertWritable();
    if (!workspaceId || !Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error("Invalid workspace retention");
    }
    this.#transaction(() => {
      this.#database
        .prepare(
          `INSERT INTO workspace_retention(workspace_id, days) VALUES (?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET days = excluded.days`,
        )
        .run(workspaceId, days);
      this.#audit.append({
        eventType: "privacy.retention_changed",
        subjectId: workspaceId,
        payload: { days },
      });
    });
  }

  purgeWorkspaceData(workspaceId: string, before?: string): number {
    this.#assertWritable();
    if (!workspaceId || (before && !Number.isFinite(Date.parse(before)))) {
      throw new Error("Invalid workspace data purge");
    }
    const cutoff = before ?? "9999-12-31T23:59:59.999Z";
    return this.#transaction(() => {
      const target = `SELECT id FROM orchestration_requests
        WHERE workspace_id = ? AND created_at < ?`;
      const plans = `SELECT id FROM execution_plans WHERE request_id IN (${target})`;
      const runs = `SELECT id FROM execution_runs WHERE request_id IN (${target})`;
      const count = this.#database
        .prepare(
          `SELECT COUNT(*) AS count FROM orchestration_requests
         WHERE workspace_id = ? AND created_at < ?`,
        )
        .get(workspaceId, cutoff) as { count: number };
      if (count.count === 0) return 0;
      const bindings = [workspaceId, cutoff];
      for (const [table, column, subquery] of [
        ["branch_executions", "run_id", runs],
        ["branch_groups", "run_id", runs],
        ["durable_workflow_steps", "run_id", runs],
        ["durable_workflow_executions", "run_id", runs],
        ["memory_entries", "source_run_id", runs],
        ["provider_execution_attempts", "run_id", runs],
        ["provider_checkpoints", "run_id", runs],
        ["step_evidence", "run_id", runs],
        ["approvals", "plan_id", plans],
        ["execution_runs", "request_id", target],
        ["plan_evaluations", "plan_id", plans],
        ["plan_steps", "plan_id", plans],
        ["strategies", "plan_id", plans],
        ["execution_plans", "request_id", target],
      ] as const) {
        this.#database
          .prepare(`DELETE FROM ${table} WHERE ${column} IN (${subquery})`)
          .run(...bindings);
      }
      this.#database
        .prepare(
          `DELETE FROM context_slice_manifests
           WHERE workspace_id = ? AND created_at < ?`,
        )
        .run(...bindings);
      this.#database
        .prepare(
          `DELETE FROM orchestration_requests WHERE workspace_id = ? AND created_at < ?`,
        )
        .run(...bindings);
      this.#audit.append({
        eventType: "privacy.workspace_data_deleted",
        subjectId: workspaceId,
        payload: {
          deletedRequests: count.count,
          retention: before !== undefined,
        },
      });
      return count.count;
    });
  }

  exportWorkspaceData(workspaceId: string): Record<string, unknown> {
    this.#assertOpen();
    if (!workspaceId) throw new Error("Invalid workspace id");
    const requestFilter = `SELECT id FROM orchestration_requests WHERE workspace_id = ?`;
    const planFilter = `SELECT id FROM execution_plans WHERE request_id IN (${requestFilter})`;
    const runFilter = `SELECT id FROM execution_runs WHERE request_id IN (${requestFilter})`;
    const rows = (table: string, condition: string) =>
      this.#database
        .prepare(`SELECT * FROM ${table} WHERE ${condition}`)
        .all(workspaceId);
    return {
      formatVersion: 1,
      exportedAt: this.#clock().toISOString(),
      workspaceId,
      retentionDays: this.getWorkspaceRetention(workspaceId),
      requests: rows("orchestration_requests", "workspace_id = ?"),
      projectContexts: rows("project_context_snapshots", "workspace_id = ?"),
      contextSlices: rows("context_slice_manifests", "workspace_id = ?"),
      plans: rows("execution_plans", `request_id IN (${requestFilter})`),
      capabilitySnapshots: rows(
        "capability_snapshots",
        `id IN (SELECT registry_snapshot_id FROM execution_plans WHERE request_id IN (${requestFilter}))`,
      ),
      strategies: rows("strategies", `plan_id IN (${planFilter})`),
      steps: rows("plan_steps", `plan_id IN (${planFilter})`),
      evaluations: rows("plan_evaluations", `plan_id IN (${planFilter})`),
      approvals: rows("approvals", `plan_id IN (${planFilter})`),
      runs: rows("execution_runs", `request_id IN (${requestFilter})`),
      durableWorkflows: rows(
        "durable_workflow_executions",
        `run_id IN (${runFilter})`,
      ),
      durableWorkflowSteps: rows(
        "durable_workflow_steps",
        `run_id IN (${runFilter})`,
      ),
      branchGroups: rows("branch_groups", `run_id IN (${runFilter})`),
      branchExecutions: rows("branch_executions", `run_id IN (${runFilter})`),
      evidence: rows("step_evidence", `run_id IN (${runFilter})`),
      providerExecutionAttempts: rows(
        "provider_execution_attempts",
        `run_id IN (${runFilter})`,
      ),
      checkpoints: rows("provider_checkpoints", `run_id IN (${runFilter})`),
      memory: rows("memory_entries", `source_run_id IN (${runFilter})`),
      auditEvents: this.listWorkspaceAuditEvents(
        workspaceId,
        Number.MAX_SAFE_INTEGER,
      ),
      auditChainValid: this.verifyAuditChain().valid,
    };
  }

  verifyAuditChain(): AuditChainVerification {
    this.#assertOpen();
    return verifyAuditChain(this.#database);
  }

  close(): void {
    if (!this.#closed) {
      this.#database.close();
      if (this.#writerKey) activeWriterPaths.delete(this.#writerKey);
      this.#closed = true;
    }
  }

  async createOnlineBackup(destinationPath: string): Promise<number> {
    this.#assertWritable();
    if (this.#backupInProgress) {
      throw new Error("A persistence backup is already in progress");
    }
    if (existsSync(destinationPath)) {
      throw new Error("Backup destination must not already exist");
    }
    this.#backupInProgress = true;
    try {
      return await backup(this.#database, destinationPath);
    } finally {
      this.#backupInProgress = false;
    }
  }

  #branchGroupFromRow(row: Record<string, unknown>): PersistedBranchGroup {
    const fanIn = row.fan_in_json
      ? fanInResultSchema.parse(JSON.parse(String(row.fan_in_json)))
      : undefined;
    return {
      runId: String(row.run_id),
      groupId: String(row.group_id),
      groupDigest: String(row.group_digest),
      lifecycle: String(row.lifecycle) as PersistedBranchGroup["lifecycle"],
      maxConcurrency: Number(row.max_concurrency),
      maxProviderCalls: Number(row.max_provider_calls),
      maxOutputBytes: Number(row.max_output_bytes),
      providerCallsUsed: Number(row.provider_calls_used),
      outputBytesObserved: Number(row.output_bytes_observed),
      cancelRequested: Number(row.cancel_requested) === 1,
      ...(fanIn ? { fanIn } : {}),
      revision: Number(row.revision),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      expiresAt: String(row.expires_at),
    };
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new Error("Persistence store is closed");
    }
  }

  #assertWritable(): void {
    this.assertPrivilegedActionsAvailable();
    if (this.#backupInProgress) {
      throw new Error("Persistence writes are paused during backup");
    }
  }
}
