import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import {
  approvalRecordSchema,
  executionRunSchema,
  orchestrationPreviewSchema,
  planExecutionBindingSchema,
  providerCheckpointRecordSchema,
  providerExecutionAttemptSchema,
  stepEvidenceSchema,
  type ApprovalRecord,
  type AuditEvent,
  type AuditEventType,
  type AuditPayload,
  type ExecutionRun,
  type OrchestrationPreview,
  type PlanExecutionBinding,
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
  orphaned: [],
};

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
          depends_on_json, action_json, policy_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    });
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
