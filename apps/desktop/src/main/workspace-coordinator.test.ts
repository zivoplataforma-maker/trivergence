import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PersistenceStore } from "@trivergence/persistence";
import { afterEach, describe, expect, it } from "vitest";

import { DesktopWorkspaceCoordinator } from "./workspace-coordinator.js";

const temporaryDirectories: string[] = [];
const stores: PersistenceStore[] = [];

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "trivergence-desktop-workspace-"));
  temporaryDirectories.push(root);
  writeFileSync(join(root, "README.md"), "desktop vertical slice", "utf8");
  const store = PersistenceStore.open(":memory:");
  stores.push(store);
  return {
    root,
    store,
    coordinator: new DesktopWorkspaceCoordinator(store, 2),
  };
};

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("DesktopWorkspaceCoordinator", () => {
  it("owns workspace, persisted preview, run and bounded UI output", async () => {
    const { root, store, coordinator } = fixture();
    const workspace = coordinator.openWorkspace(root);
    const preview = coordinator.preview({
      workspaceId: workspace.id,
      requestId: "10000000-0000-4000-8000-000000000001",
      goal: "Leer el README seleccionado",
      profile: "observer",
      detail: "README.md",
    });

    expect(workspace.recoveredRuns).toBe(2);
    expect(preview.plan.steps[0]?.action.input).toEqual({ path: "README.md" });
    const started = coordinator.startExecution({
      workspaceId: workspace.id,
      planId: preview.plan.id,
    });
    expect(() =>
      coordinator.startExecution({
        workspaceId: workspace.id,
        planId: preview.plan.id,
      }),
    ).toThrow(/already has an active execution/u);

    let state = coordinator.executionState({ runId: started.runId });
    for (
      let attempt = 0;
      attempt < 20 && state.status === "running";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      state = coordinator.executionState({ runId: started.runId });
    }

    expect(state).toMatchObject({
      status: "completed",
      evidenceCount: 1,
      outcomeEvaluation: { phase: "postflight", status: "accepted" },
      output: { kind: "file", content: "desktop vertical slice" },
    });
    expect(
      coordinator.history({ workspaceId: workspace.id }).entries,
    ).toMatchObject([
      {
        runId: started.runId,
        goal: "[Objetivo privado no conservado]",
        evidenceCount: 1,
      },
    ]);
    expect(coordinator.openWorkspace(root).id).toBe(workspace.id);
    expect(
      coordinator.history({ workspaceId: workspace.id }).entries,
    ).toHaveLength(1);
    expect(store.listEvidence(started.runId)).toHaveLength(1);
    expect(
      store
        .listAuditEvents()
        .some((event) => event.eventType === "execution.outcome_evaluated"),
    ).toBe(true);
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(
      "desktop vertical slice",
    );
    expect(coordinator.persistenceStatus()).toMatchObject({
      mode: "readwrite",
      recoveredRuns: 2,
      auditValid: true,
    });
    expect(
      coordinator.audit({ workspaceId: workspace.id }).events.length,
    ).toBeGreaterThan(0);
    expect(coordinator.retention({ workspaceId: workspace.id }).days).toBe(30);
    expect(
      coordinator.saveRetention({ workspaceId: workspace.id, days: 7 }),
    ).toMatchObject({ days: 7, deletedRequests: 0 });
    expect(
      coordinator.exportWorkspaceData({ workspaceId: workspace.id })
        .workspaceId,
    ).toBe(workspace.id);
    expect(
      coordinator.deleteWorkspaceData({ workspaceId: workspace.id }),
    ).toMatchObject({ status: "deleted", deletedRequests: 1 });
    expect(coordinator.history({ workspaceId: workspace.id }).entries).toEqual(
      [],
    );
    expect(coordinator.audit({ workspaceId: workspace.id }).valid).toBe(true);
  });

  it("rejects traversal and plan references from another session", () => {
    const { root, coordinator } = fixture();
    const first = coordinator.openWorkspace(root);

    expect(() =>
      coordinator.preview({
        workspaceId: first.id,
        requestId: "10000000-0000-4000-8000-000000000003",
        goal: "Leer un archivo local",
        profile: "observer",
        detail: "",
      }),
    ).toThrow(/ruta relativa/u);

    expect(() =>
      coordinator.preview({
        workspaceId: first.id,
        requestId: "10000000-0000-4000-8000-000000000002",
        goal: "Leer una ruta inválida",
        profile: "observer",
        detail: "../outside.txt",
      }),
    ).toThrow(/relative path|parent segments/u);

    expect(() =>
      coordinator.startExecution({
        workspaceId: first.id,
        planId: "20000000-0000-4000-8000-000000000001",
      }),
    ).toThrow(/does not belong/u);
  });

  it("runs the local Reference Provider through preview and one-use approval", async () => {
    const { root, coordinator } = fixture();
    const workspace = coordinator.openWorkspace(root);
    const preview = coordinator.preview({
      workspaceId: workspace.id,
      requestId: "10000000-0000-4000-8000-000000000010",
      goal: "Pedir una respuesta al Reference Provider local",
      profile: "assistant",
      detail: "Contexto local de prueba",
    });

    expect(preview.evaluation.status).toBe("approval_required");
    const approval = coordinator.requestApproval({
      workspaceId: workspace.id,
      planId: preview.plan.id,
      stepId: "step-1",
    });
    expect(approval.descriptor).toMatchObject({
      kind: "provider",
      networkDestinations: [],
      providerRequest: {
        providerId: "reference",
        context: { networkRequired: false },
      },
    });
    coordinator.decideApproval({
      workspaceId: workspace.id,
      approvalId: approval.approvalId,
      decision: "grant",
    });
    const started = coordinator.startExecution({
      workspaceId: workspace.id,
      planId: preview.plan.id,
      approvalIds: { "step-1": approval.approvalId },
    });
    let state = coordinator.executionState({ runId: started.runId });
    for (
      let attempt = 0;
      attempt < 50 && state.status === "running";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      state = coordinator.executionState({ runId: started.runId });
    }

    expect(state).toMatchObject({
      status: "completed",
      evidenceCount: 1,
      output: {
        kind: "provider",
        result: {
          outcome: "succeeded",
          provenance: { localOnly: true },
        },
      },
    });
    expect(state.stream?.some((event) => event.event.type === "delta")).toBe(
      true,
    );
  });

  it("runs the complete M6 workflow and persists auditable memory", async () => {
    const { root, coordinator, store } = fixture();
    const workspace = coordinator.openWorkspace(root);
    const preview = coordinator.preview({
      workspaceId: workspace.id,
      requestId: "10000000-0000-4000-8000-000000000020",
      goal: "Coordinar agentes, workflow, memoria y evaluación local",
      profile: "assistant",
      privacyMode: "standard",
      detail: "",
      maxAgents: 3,
      maxProviderCalls: 4,
      maxOutputBytes: 65_536,
      maxMemoryItems: 4,
      maxMemoryBytes: 16_384,
      timeoutMs: 10_000,
      maxReplans: 1,
      retentionDays: 30,
    });
    expect(preview.plan.steps).toHaveLength(5);
    const approvalIds: Record<string, string> = {};
    for (const step of preview.plan.steps.filter(
      (candidate) => candidate.policy.decision === "require_approval",
    )) {
      const approval = coordinator.requestApproval({
        workspaceId: workspace.id,
        planId: preview.plan.id,
        stepId: step.id,
      });
      coordinator.decideApproval({
        workspaceId: workspace.id,
        approvalId: approval.approvalId,
        decision: "grant",
      });
      approvalIds[step.id] = approval.approvalId;
    }
    const started = coordinator.startExecution({
      workspaceId: workspace.id,
      planId: preview.plan.id,
      approvalIds,
    });
    let state = coordinator.executionState({ runId: started.runId });
    for (
      let attempt = 0;
      attempt < 100 && state.status === "running";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      state = coordinator.executionState({ runId: started.runId });
    }

    expect(state).toMatchObject({
      status: "completed",
      evidenceCount: 5,
      output: {
        kind: "workflow",
        result: { outcome: "accepted" },
      },
    });
    expect(
      store.listMemoryEntries(workspace.id, new Date().toISOString(), 4),
    ).toHaveLength(1);
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(
      "Coordinar agentes, workflow, memoria y evaluación local",
    );
  });
});
