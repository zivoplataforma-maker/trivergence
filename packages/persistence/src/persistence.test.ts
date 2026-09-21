import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ExecutionRun,
  OrchestrationPreview,
  StepEvidence,
} from "@trivergence/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  activateBackup,
  createBackup,
  PersistenceStore,
  restoreBackup,
  validateBackup,
} from "./index.js";
import { migrateDatabase } from "./migrations.js";

const PLAN_DIGEST = "a".repeat(64);
const SNAPSHOT_DIGEST = "b".repeat(64);
const NOW = "2026-08-04T12:00:00.000Z";

const strategy = {
  kind: "direct" as const,
  reason: "Una capacidad disponible resuelve el objetivo",
  capabilityIds: ["system.diagnostics.read"],
  evidence: ["system.diagnostics.read:available"],
  strategyVersion: "1" as const,
};

const preview: OrchestrationPreview = {
  request: {
    id: "10000000-0000-4000-8000-000000000001",
    goal: "Persistir un preview verificable",
    profile: "observer",
    requestedCapabilities: ["system.diagnostics.read"],
  },
  registryVersion: "test-1",
  registrySnapshot: {
    id: SNAPSHOT_DIGEST,
    version: "test-1",
    capabilityCount: 1,
  },
  strategy,
  plan: {
    id: "20000000-0000-4000-8000-000000000001",
    requestId: "10000000-0000-4000-8000-000000000001",
    strategy,
    steps: [
      {
        id: "step-1",
        capabilityId: "system.diagnostics.read",
        subsystem: "runtime",
        dependsOn: [],
        action: {
          id: "30000000-0000-4000-8000-000000000001",
          tool: "system.diagnostics.read",
          toolVersion: "1",
          kinds: ["read"],
          risk: "safe",
          summary: "Leer diagnósticos locales",
        },
        policy: {
          decision: "allow",
          reason: "Lectura local segura",
          matchedRule: "observer.safe.read",
          rulesetVersion: "1",
        },
      },
    ],
    issues: [],
    plannerVersion: "1",
  },
  evaluation: {
    status: "ready",
    reason: "El plan está listo",
    checks: [
      { id: "strategy_resolved", passed: true, evidence: "Directa" },
      { id: "plan_valid", passed: true, evidence: "Sin issues" },
      { id: "steps_present", passed: true, evidence: "Un paso" },
      { id: "policy_satisfied", passed: true, evidence: "Permitido" },
    ],
    evaluatorVersion: "1",
  },
  planIntegrity: {
    algorithm: "sha256",
    digest: PLAN_DIGEST,
    canonicalizationVersion: "1",
  },
};

const run: ExecutionRun = {
  id: "40000000-0000-4000-8000-000000000001",
  requestId: preview.request.id,
  planId: preview.plan.id,
  registrySnapshotId: SNAPSHOT_DIGEST,
  planDigest: PLAN_DIGEST,
  status: "planned",
  createdAt: NOW,
  updatedAt: NOW,
};

const evidence: StepEvidence = {
  id: "50000000-0000-4000-8000-000000000001",
  runId: run.id,
  planId: preview.plan.id,
  stepId: "step-1",
  capabilityId: "system.diagnostics.read",
  subsystem: "runtime",
  capabilityVersion: "1",
  outcome: "succeeded",
  observedAt: NOW,
  summary: "Diagnósticos leídos",
  outputDigest: "c".repeat(64),
};

const temporaryDirectories: string[] = [];

const databasePath = () => {
  const directory = mkdtempSync(join(tmpdir(), "trivergence-persistence-"));
  temporaryDirectories.push(directory);
  return join(directory, "trivergence.db");
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("PersistenceStore", () => {
  it("redacts private goals, erases deleted memory and preserves audit on purge", () => {
    const store = PersistenceStore.open(databasePath(), {
      clock: () => new Date(NOW),
    });
    const workspaceId = "60000000-0000-4000-8000-000000000001";
    store.persistPreview({
      ...preview,
      request: { ...preview.request, workspaceId, privacyMode: "private" },
    });
    store.createRun(run);
    store.appendEvidence(evidence);
    store.saveProviderExecutionAttempt({
      id: "65000000-0000-4000-8000-000000000001",
      runId: run.id,
      planId: preview.plan.id,
      stepId: "step-1",
      capabilityId: "system.diagnostics.read",
      adapterId: "trivergence.reference-provider",
      adapterVersion: "1.0.0",
      adapterBuildDigest: "a".repeat(64),
      providerId: "reference",
      transport: "in_memory_stream",
      requestDigest: "f".repeat(64),
      contextDigest: "b".repeat(64),
      effectClass: "read_only",
      recoveryCapabilities: [],
      remoteState: "not_dispatched",
      budget: {
        maxInputBytes: 4_096,
        maxOutputBytes: 4_096,
        maxChunks: 32,
        timeoutMs: 30_000,
        maxCostMicrounits: 0,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
    store.saveMemoryEntry({
      id: "70000000-0000-4000-8000-000000000001",
      namespace: "test",
      subjectDigest: "d".repeat(64),
      content: "secreto local",
      contentDigest: "e".repeat(64),
      provenance: { source: "test" },
      sourceRunId: run.id,
      sourcePlanId: preview.plan.id,
      sourceStepId: "step-1",
      createdAt: NOW,
      expiresAt: "2026-09-04T12:00:00.000Z",
    });
    expect(store.listExecutionHistory(workspaceId)[0]?.goal).toBe(
      "[Objetivo privado no conservado]",
    );
    expect(store.listWorkspaceAuditEvents(workspaceId).length).toBeGreaterThan(
      0,
    );
    expect(JSON.stringify(store.exportWorkspaceData(workspaceId))).toContain(
      "secreto local",
    );
    expect(
      store.exportWorkspaceData(workspaceId)["providerExecutionAttempts"],
    ).toHaveLength(1);
    expect(
      store
        .listWorkspaceAuditEvents(workspaceId)
        .map((event) => event.eventType),
    ).toContain("provider.attempt_recorded");
    const deleted = store.deleteMemoryEntry(
      "70000000-0000-4000-8000-000000000001",
      NOW,
    );
    expect(deleted.content).toBe("");
    expect(deleted.provenance).toEqual({});
    expect(
      JSON.stringify(store.exportWorkspaceData(workspaceId)),
    ).not.toContain("secreto local");
    store.setWorkspaceRetention(workspaceId, 7);
    expect(store.hasWorkspaceRetention(workspaceId)).toBe(true);
    expect(store.purgeWorkspaceData(workspaceId)).toBe(1);
    expect(store.findRun(run.id)).toBeUndefined();
    expect(
      store.findProviderExecutionAttempt(
        "65000000-0000-4000-8000-000000000001",
      ),
    ).toBeUndefined();
    expect(store.listExecutionHistory(workspaceId)).toEqual([]);
    expect(store.verifyAuditChain().valid).toBe(true);
    expect(
      store
        .listWorkspaceAuditEvents(workspaceId)
        .map((event) => event.eventType),
    ).toContain("privacy.workspace_data_deleted");
    store.close();
  });
  it("persists preview, run and evidence with one valid audit chain", () => {
    const store = PersistenceStore.open(databasePath(), {
      clock: () => new Date(NOW),
    });

    store.persistPreview(preview);
    store.createRun(run);
    store.appendEvidence(evidence);

    expect(store.findRun(run.id)).toEqual(run);
    expect(store.listEvidence(run.id)).toEqual([evidence]);
    expect(store.listAuditEvents().map((event) => event.eventType)).toEqual([
      "orchestration.preview_persisted",
      "execution.run_created",
      "execution.evidence_recorded",
    ]);
    expect(store.verifyAuditChain()).toMatchObject({
      valid: true,
      eventCount: 3,
    });
    expect(store.health.privilegedActionsAvailable).toBe(true);
    store.close();
  });

  it("reuses a content-addressed capability snapshot across previews", () => {
    const store = PersistenceStore.open(databasePath(), {
      clock: () => new Date(NOW),
    });
    const nextRequestId = "10000000-0000-4000-8000-000000000002";
    const nextPreview: OrchestrationPreview = {
      ...preview,
      request: { ...preview.request, id: nextRequestId },
      plan: {
        ...preview.plan,
        id: "20000000-0000-4000-8000-000000000002",
        requestId: nextRequestId,
      },
      planIntegrity: { ...preview.planIntegrity, digest: "e".repeat(64) },
    };

    store.persistPreview(preview);
    expect(() => store.persistPreview(nextPreview)).not.toThrow();
    expect(store.listAuditEvents()).toHaveLength(2);
    store.close();
  });

  it("rejects conflicting metadata for an existing snapshot identity", () => {
    const store = PersistenceStore.open(databasePath());
    const conflictingRequestId = "10000000-0000-4000-8000-000000000003";
    const conflictingPreview: OrchestrationPreview = {
      ...preview,
      request: { ...preview.request, id: conflictingRequestId },
      registrySnapshot: { ...preview.registrySnapshot, capabilityCount: 2 },
      plan: {
        ...preview.plan,
        id: "20000000-0000-4000-8000-000000000003",
        requestId: conflictingRequestId,
      },
      planIntegrity: { ...preview.planIntegrity, digest: "f".repeat(64) },
    };

    store.persistPreview(preview);
    expect(() => store.persistPreview(conflictingPreview)).toThrow(
      /snapshot identity metadata/u,
    );
    expect(store.listAuditEvents()).toHaveLength(1);
    store.close();
  });

  it("rolls back a run and its audit when integrity references do not match", () => {
    const store = PersistenceStore.open(databasePath());
    store.persistPreview(preview);

    expect(() =>
      store.createRun({ ...run, planDigest: "d".repeat(64) }),
    ).toThrow();
    expect(store.findRun(run.id)).toBeUndefined();
    expect(store.listAuditEvents()).toHaveLength(1);
    store.close();
  });

  it("allows only one read-write store per database in the process", () => {
    const path = databasePath();
    const writer = PersistenceStore.open(path);

    expect(() => PersistenceStore.open(path)).toThrow(/already active/u);
    const recoveryReader = PersistenceStore.openRecovery(path);
    expect(recoveryReader.health.mode).toBe("readonly-recovery");

    recoveryReader.close();
    writer.close();
    const nextWriter = PersistenceStore.open(path);
    nextWriter.close();
  });

  it("enforces append-only audit events at the database layer", () => {
    const path = databasePath();
    const store = PersistenceStore.open(path);
    store.persistPreview(preview);
    store.close();

    const database = new DatabaseSync(path);
    expect(() =>
      database.prepare("UPDATE audit_events SET subject_id = ?").run("changed"),
    ).toThrow(/append-only/u);
    expect(() => database.prepare("DELETE FROM audit_events").run()).toThrow(
      /append-only/u,
    );
    database.close();
  });

  it("opens physically read-only and blocks privileged actions after tampering", () => {
    const path = databasePath();
    const store = PersistenceStore.open(path);
    store.persistPreview(preview);
    store.close();

    const database = new DatabaseSync(path);
    database.exec("DROP TRIGGER audit_events_no_update");
    database
      .prepare("UPDATE audit_events SET payload_json = ? WHERE sequence = 1")
      .run('{"tampered":true}');
    database.close();

    const recovery = PersistenceStore.open(path);
    expect(recovery.health).toMatchObject({
      mode: "readonly-recovery",
      privilegedActionsAvailable: false,
      audit: { valid: false },
    });
    expect(() => recovery.assertPrivilegedActionsAvailable()).toThrow(
      /blocked/u,
    );
    expect(() => recovery.persistPreview(preview)).toThrow(/blocked/u);
    recovery.close();
  });
});

describe("migrations", () => {
  it("rolls back a failed migration without recording it", () => {
    const database = new DatabaseSync(":memory:");

    expect(() =>
      migrateDatabase(database, [
        {
          version: "broken",
          sql: "CREATE TABLE rollback_probe(id TEXT); INVALID SQL;",
        },
      ]),
    ).toThrow();
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rollback_probe'",
        )
        .get(),
    ).toBeUndefined();
    expect(
      database
        .prepare("SELECT version FROM schema_migrations WHERE version = ?")
        .get("broken"),
    ).toBeUndefined();
    database.close();
  });
});

describe("provider checkpoints", () => {
  it("upserts a bounded checkpoint and consumes it once", () => {
    const store = PersistenceStore.open(":memory:");
    store.persistPreview(preview);
    store.createRun(run);
    const checkpoint = {
      id: "80000000-0000-4000-8000-000000000001",
      runId: run.id,
      planId: run.planId,
      stepId: "step-1",
      capabilityId: "system.diagnostics.read",
      adapterId: "trivergence.reference-provider",
      providerId: "reference",
      requestDigest: "c".repeat(64),
      checkpoint: {
        schemaVersion: "1" as const,
        requestDigest: "c".repeat(64),
        nextChunkIndex: 1,
        emittedBytes: 12,
        recoveryCursor: "chunk:1",
        checkpointDigest: "d".repeat(64),
      },
      status: "active" as const,
      observedAt: NOW,
    };

    const first = store.saveProviderCheckpoint(checkpoint);
    const updated = store.saveProviderCheckpoint({
      ...checkpoint,
      id: "80000000-0000-4000-8000-000000000002",
      checkpoint: {
        ...checkpoint.checkpoint,
        nextChunkIndex: 2,
        emittedBytes: 24,
        recoveryCursor: "chunk:2",
        checkpointDigest: "e".repeat(64),
      },
    });

    expect(updated.id).toBe(first.id);
    expect(updated.checkpoint.nextChunkIndex).toBe(2);
    expect(store.consumeProviderCheckpoint(first.id, NOW).status).toBe(
      "consumed",
    );
    expect(() => store.consumeProviderCheckpoint(first.id, NOW)).toThrow(
      /not active/u,
    );
    expect(store.verifyAuditChain().valid).toBe(true);
    store.close();
  });
});

describe("backup and restore", () => {
  it("creates a manifest, validates the backup and restores to a new path", async () => {
    const path = databasePath();
    const directory = join(path, "..");
    const backupPath = join(directory, "backup.db");
    const restoredPath = join(directory, "restored.db");
    const store = PersistenceStore.open(path);
    store.persistPreview(preview);
    store.createRun(run);

    const manifest = await createBackup(store, backupPath, () => new Date(NOW));
    expect(manifest).toMatchObject({
      formatVersion: "1",
      algorithm: "sha256",
      databaseFile: "backup.db",
    });
    expect(await validateBackup(backupPath)).toMatchObject({ valid: true });
    expect(await restoreBackup(backupPath, restoredPath)).toMatchObject({
      valid: true,
    });

    const restored = PersistenceStore.open(restoredPath);
    expect(restored.findRun(run.id)).toEqual(run);
    restored.close();
    store.close();
  });

  it("activates a validated backup and preserves the displaced database", async () => {
    const path = databasePath();
    const directory = join(path, "..");
    const backupPath = join(directory, "rollback-source.db");
    const recoveryRoot = join(directory, "recovery");
    const store = PersistenceStore.open(path);
    store.persistPreview(preview);
    await createBackup(store, backupPath, () => new Date(NOW));
    store.createRun(run);
    store.close();

    const activation = await activateBackup(backupPath, path, recoveryRoot);
    expect(activation.validation.valid).toBe(true);
    expect(
      existsSync(
        join(activation.rollbackDirectory, path.split(/[\\/]/u).at(-1)!),
      ),
    ).toBe(true);
    const restored = PersistenceStore.open(path);
    expect(restored.findRun(run.id)).toBeUndefined();
    expect(restored.verifyAuditChain().valid).toBe(true);
    restored.close();
  });
});
