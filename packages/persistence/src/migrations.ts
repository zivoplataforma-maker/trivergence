import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  readonly version: string;
  readonly sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: "0001_orchestration_audit",
    sql: `
      CREATE TABLE orchestration_requests (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        profile TEXT NOT NULL CHECK (profile IN ('observer', 'assistant', 'developer')),
        requested_capabilities_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE capability_snapshots (
        id TEXT PRIMARY KEY CHECK (length(id) = 64),
        version TEXT NOT NULL,
        capability_count INTEGER NOT NULL CHECK (capability_count > 0),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE execution_plans (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        registry_snapshot_id TEXT NOT NULL,
        plan_digest TEXT NOT NULL UNIQUE CHECK (length(plan_digest) = 64),
        planner_version TEXT NOT NULL,
        issues_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (request_id) REFERENCES orchestration_requests(id),
        FOREIGN KEY (registry_snapshot_id) REFERENCES capability_snapshots(id),
        UNIQUE (id, request_id, registry_snapshot_id, plan_digest)
      ) STRICT;

      CREATE TABLE strategies (
        plan_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('direct', 'sequential', 'parallel', 'unavailable')),
        reason TEXT NOT NULL,
        capability_ids_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        strategy_version TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES execution_plans(id) ON DELETE RESTRICT
      ) STRICT;

      CREATE TABLE plan_steps (
        plan_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        capability_id TEXT NOT NULL,
        subsystem TEXT NOT NULL,
        depends_on_json TEXT NOT NULL,
        action_json TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        PRIMARY KEY (plan_id, step_id),
        UNIQUE (plan_id, position),
        FOREIGN KEY (plan_id) REFERENCES execution_plans(id) ON DELETE RESTRICT
      ) STRICT;

      CREATE TABLE plan_evaluations (
        plan_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('ready', 'approval_required', 'blocked')),
        reason TEXT NOT NULL,
        checks_json TEXT NOT NULL,
        evaluator_version TEXT NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES execution_plans(id) ON DELETE RESTRICT
      ) STRICT;

      CREATE TABLE execution_runs (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        registry_snapshot_id TEXT NOT NULL,
        plan_digest TEXT NOT NULL CHECK (length(plan_digest) = 64),
        status TEXT NOT NULL CHECK (status IN (
          'planned', 'awaiting_approval', 'approved', 'running', 'completed',
          'failed', 'cancelled', 'timed_out', 'orphaned'
        )),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (plan_id, request_id, registry_snapshot_id, plan_digest)
          REFERENCES execution_plans(id, request_id, registry_snapshot_id, plan_digest),
        UNIQUE (id, plan_id)
      ) STRICT;

      CREATE TABLE step_evidence (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        subsystem TEXT NOT NULL,
        capability_version TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'cancelled', 'timed_out')),
        observed_at TEXT NOT NULL,
        summary TEXT NOT NULL,
        output_digest TEXT CHECK (output_digest IS NULL OR length(output_digest) = 64),
        FOREIGN KEY (run_id, plan_id) REFERENCES execution_runs(id, plan_id),
        FOREIGN KEY (plan_id, step_id) REFERENCES plan_steps(plan_id, step_id)
      ) STRICT;

      CREATE TABLE audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        occurred_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        previous_digest TEXT NOT NULL CHECK (length(previous_digest) = 64),
        event_digest TEXT NOT NULL UNIQUE CHECK (length(event_digest) = 64)
      ) STRICT;

      CREATE TRIGGER audit_events_no_update
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;

      CREATE TRIGGER audit_events_no_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;

      CREATE INDEX execution_plans_request_idx ON execution_plans(request_id);
      CREATE INDEX execution_runs_plan_idx ON execution_runs(plan_id);
      CREATE INDEX step_evidence_run_idx ON step_evidence(run_id);
      CREATE INDEX audit_events_subject_idx ON audit_events(subject_id, sequence);
    `,
  },
  {
    version: "0002_runtime_approvals",
    sql: `
      CREATE UNIQUE INDEX execution_plans_id_digest_uq
        ON execution_plans(id, plan_digest);

      CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        action_digest TEXT NOT NULL CHECK (length(action_digest) = 64),
        plan_digest TEXT NOT NULL CHECK (length(plan_digest) = 64),
        ruleset_version TEXT NOT NULL,
        descriptor_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'pending', 'granted', 'denied', 'consumed', 'expired'
        )),
        requested_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        decided_at TEXT,
        consumed_at TEXT,
        actor TEXT,
        FOREIGN KEY (plan_id, step_id) REFERENCES plan_steps(plan_id, step_id),
        FOREIGN KEY (plan_id, plan_digest)
          REFERENCES execution_plans(id, plan_digest),
        UNIQUE (id, action_digest)
      ) STRICT;

      CREATE INDEX approvals_plan_step_idx
        ON approvals(plan_id, step_id, status);
      CREATE INDEX approvals_expiry_idx ON approvals(status, expires_at);
    `,
  },
  {
    version: "0003_provider_checkpoints",
    sql: `
      CREATE TABLE provider_checkpoints (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
        checkpoint_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'consumed')),
        observed_at TEXT NOT NULL,
        consumed_at TEXT,
        FOREIGN KEY (run_id, plan_id) REFERENCES execution_runs(id, plan_id),
        FOREIGN KEY (plan_id, step_id) REFERENCES plan_steps(plan_id, step_id),
        UNIQUE (run_id, step_id)
      ) STRICT;

      CREATE INDEX provider_checkpoints_status_idx
        ON provider_checkpoints(status, observed_at);
      CREATE INDEX provider_checkpoints_request_idx
        ON provider_checkpoints(request_digest, status);
    `,
  },
  {
    version: "0004_m6_memory",
    sql: `
      CREATE TABLE memory_entries (
        id TEXT PRIMARY KEY,
        namespace TEXT NOT NULL,
        subject_digest TEXT NOT NULL CHECK (length(subject_digest) = 64),
        content TEXT NOT NULL,
        content_digest TEXT NOT NULL CHECK (length(content_digest) = 64),
        provenance_json TEXT NOT NULL,
        source_run_id TEXT NOT NULL,
        source_plan_id TEXT NOT NULL,
        source_step_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (source_run_id, source_plan_id)
          REFERENCES execution_runs(id, plan_id),
        FOREIGN KEY (source_plan_id, source_step_id)
          REFERENCES plan_steps(plan_id, step_id)
      ) STRICT;

      CREATE TRIGGER memory_entries_immutable_content
      BEFORE UPDATE OF namespace, subject_digest, content, content_digest,
        provenance_json, source_run_id, source_plan_id, source_step_id,
        created_at, expires_at
      ON memory_entries
      BEGIN
        SELECT RAISE(ABORT, 'memory entry content is immutable');
      END;

      CREATE INDEX memory_entries_active_idx
        ON memory_entries(namespace, deleted_at, expires_at, created_at DESC);
      CREATE INDEX memory_entries_subject_idx
        ON memory_entries(subject_digest, created_at DESC);
    `,
  },
  {
    version: "0005_objective_history_privacy",
    sql: `
      ALTER TABLE orchestration_requests ADD COLUMN workspace_id TEXT;
      ALTER TABLE orchestration_requests ADD COLUMN privacy_mode TEXT NOT NULL
        DEFAULT 'private' CHECK (privacy_mode IN ('private', 'standard'));
      CREATE INDEX orchestration_requests_workspace_idx
        ON orchestration_requests(workspace_id, created_at DESC);
    `,
  },
  {
    version: "0006_privacy_retention",
    sql: `
      DROP TRIGGER memory_entries_immutable_content;
      CREATE TRIGGER memory_entries_immutable_content
      BEFORE UPDATE OF namespace, subject_digest, content, content_digest,
        provenance_json, source_run_id, source_plan_id, source_step_id,
        created_at, expires_at
      ON memory_entries
      WHEN NOT (
        NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
        AND NEW.content = '' AND NEW.provenance_json = '{}'
        AND NEW.namespace = OLD.namespace
        AND NEW.subject_digest = OLD.subject_digest
        AND NEW.content_digest = OLD.content_digest
        AND NEW.source_run_id = OLD.source_run_id
        AND NEW.source_plan_id = OLD.source_plan_id
        AND NEW.source_step_id = OLD.source_step_id
        AND NEW.created_at = OLD.created_at
        AND NEW.expires_at = OLD.expires_at
      )
      BEGIN
        SELECT RAISE(ABORT, 'memory entry content is immutable');
      END;

      CREATE TABLE workspace_retention (
        workspace_id TEXT PRIMARY KEY,
        days INTEGER NOT NULL CHECK (days BETWEEN 1 AND 365)
      ) STRICT;
    `,
  },
  {
    version: "0007_provider_execution_attempts",
    sql: `
      CREATE TABLE provider_execution_attempts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        capability_id TEXT NOT NULL,
        adapter_id TEXT NOT NULL,
        adapter_version TEXT NOT NULL,
        adapter_build_digest TEXT NOT NULL CHECK (length(adapter_build_digest) = 64),
        provider_id TEXT NOT NULL,
        transport TEXT NOT NULL CHECK (transport IN (
          'in_memory_stream', 'stdio_jsonl', 'http_stream'
        )),
        request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
        context_digest TEXT NOT NULL CHECK (length(context_digest) = 64),
        effect_class TEXT NOT NULL CHECK (effect_class IN (
          'pure', 'read_only', 'reversible', 'side_effectful', 'irreversible'
        )),
        recovery_capabilities_json TEXT NOT NULL,
        remote_state TEXT NOT NULL CHECK (remote_state IN (
          'not_dispatched', 'dispatching', 'accepted', 'running',
          'cancel_requested', 'succeeded', 'failed', 'cancelled',
          'remote_state_unknown'
        )),
        budget_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolution_actor TEXT,
        FOREIGN KEY (run_id, plan_id) REFERENCES execution_runs(id, plan_id),
        FOREIGN KEY (plan_id, step_id) REFERENCES plan_steps(plan_id, step_id),
        UNIQUE (run_id, step_id)
      ) STRICT;

      CREATE INDEX provider_execution_attempts_state_idx
        ON provider_execution_attempts(remote_state, updated_at);
      CREATE INDEX provider_execution_attempts_request_idx
        ON provider_execution_attempts(request_digest, remote_state);
    `,
  },
];

const checksum = (sql: string) =>
  createHash("sha256").update(sql, "utf8").digest("hex");

export const latestSchemaVersion =
  migrations.at(-1)?.version ?? "0000_uninitialized";

export const migrateDatabase = (
  database: DatabaseSync,
  pendingMigrations: readonly Migration[] = migrations,
): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const findMigration = database.prepare(
    "SELECT checksum FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of pendingMigrations) {
    const expectedChecksum = checksum(migration.sql);
    const existing = findMigration.get(migration.version) as
      { checksum: string } | undefined;

    if (existing) {
      if (existing.checksum !== expectedChecksum) {
        throw new Error(`Migration checksum mismatch: ${migration.version}`);
      }
      continue;
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(migration.sql);
      recordMigration.run(
        migration.version,
        expectedChecksum,
        new Date().toISOString(),
      );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
};
