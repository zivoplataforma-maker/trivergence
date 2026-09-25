import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  classifyOperationEffect,
  type ActionRequest,
  type ExecutionDescriptor,
  type OrchestrationPreview,
  type PlannedStep,
  type PolicyProfile,
  type ProjectContextSnapshot,
  type ProviderStreamEvent,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import { describe, expect, it } from "vitest";

import {
  RuntimeEngine,
  type DispatchContext,
  type DispatchResult,
  type StepDispatcher,
} from "./index.js";

const NOW = Date.parse("2026-08-07T12:00:00.000Z");
const PLAN_DIGEST = "a".repeat(64);
const SNAPSHOT_DIGEST = "b".repeat(64);
const EMPTY_ENVIRONMENT_DIGEST = createHash("sha256")
  .update(canonicalizeJson({}), "utf8")
  .digest("hex");

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const projectContext = (
  requestId: string,
  profile: PolicyProfile,
  capabilityId = "runtime.test.execute",
  privacyMode: "private" | "standard" = "private",
  workspaceId = "00000000-0000-4000-8000-000000000000",
): ProjectContextSnapshot => ({
  schemaVersion: "1",
  id: requestId,
  revision: 1,
  createdAt: new Date(NOW).toISOString(),
  workspace: { id: workspaceId, fingerprint: "c".repeat(64) },
  objective: {
    requestId,
    goalDigest: "d".repeat(64),
    restrictionReferences: [],
  },
  governance: {
    profile,
    privacyMode,
    retentionDays: 30,
    restrictions: [
      "mandatory_exclusions",
      "no_credential_material",
      "untrusted_content_is_data",
      "workspace_root_only",
    ],
  },
  capabilities: {
    registrySnapshot: {
      id: SNAPSHOT_DIGEST,
      version: "test-1",
      capabilityCount: 1,
    },
    references: [
      {
        id: capabilityId,
        version: "1",
        status: "available",
        descriptorDigest: "e".repeat(64),
      },
    ],
  },
  budget: {
    limits: {
      maxAgents: 1,
      maxProviderCalls: 1,
      maxOutputBytes: 65_536,
      maxMemoryItems: 0,
      maxMemoryBytes: 0,
      timeoutMs: 10_000,
      maxReplans: 0,
    },
    consumptionAuthority: "runtime",
  },
  sources: [
    {
      kind: "workspace",
      sourceId: `workspace:${workspaceId}`,
      workspaceId,
      version: "1",
      digest: "c".repeat(64),
      trust: "trusted_metadata",
      provenance: {
        origin: "workspace",
        observedAt: new Date(NOW).toISOString(),
        digest: "f".repeat(64),
      },
    },
  ],
  provenance: {
    builderVersion: "1",
    canonicalizationVersion: "1",
    inputDigest: "1".repeat(64),
    sourceDigests: ["c".repeat(64)],
  },
  digest: "2".repeat(64),
});

const makePreview = (
  profile: PolicyProfile,
  action: ActionRequest,
): OrchestrationPreview => {
  const policy = evaluatePolicy(profile, action);
  const evaluationStatus =
    policy.decision === "deny"
      ? ("blocked" as const)
      : policy.decision === "require_approval"
        ? ("approval_required" as const)
        : ("ready" as const);
  const strategy = {
    kind: "direct" as const,
    reason: "Una capacidad resuelve el objetivo",
    capabilityIds: ["runtime.test.execute"],
    evidence: ["runtime.test.execute:available"],
    strategyVersion: "1" as const,
  };
  return {
    request: {
      id: "10000000-0000-4000-8000-000000000001",
      goal: "Validar una ejecución coordinada",
      profile,
      requestedCapabilities: ["runtime.test.execute"],
    },
    projectContext: projectContext(
      "10000000-0000-4000-8000-000000000001",
      profile,
    ),
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
          capabilityId: "runtime.test.execute",
          subsystem: "runtime",
          dependsOn: [],
          action,
          policy,
        },
      ],
      issues: [],
      plannerVersion: "1",
    },
    evaluation: {
      status: evaluationStatus,
      reason:
        evaluationStatus === "blocked"
          ? "Policy blocked the plan"
          : "Plan evaluated",
      checks: [
        { id: "strategy_resolved", passed: true, evidence: "Directa" },
        { id: "plan_valid", passed: true, evidence: "Sin issues" },
        { id: "steps_present", passed: true, evidence: "Un paso" },
        {
          id: "policy_satisfied",
          passed: policy.decision !== "deny",
          evidence: policy.reason,
        },
      ],
      evaluatorVersion: "1",
    },
    planIntegrity: {
      algorithm: "sha256",
      digest: PLAN_DIGEST,
      canonicalizationVersion: "1",
    },
  };
};

const action = (
  risk: ActionRequest["risk"],
  kinds: ActionRequest["kinds"],
): ActionRequest => ({
  id: "30000000-0000-4000-8000-000000000001",
  tool: "runtime.test.execute",
  toolVersion: "1",
  kinds,
  risk,
  summary: "Ejecutar el dispatcher de prueba",
});

class FakeDispatcher implements StepDispatcher {
  readonly capabilityId = "runtime.test.execute";
  readonly subsystem = "runtime" as const;
  calls = 0;

  readonly #execute: (
    signal: AbortSignal,
    emit: (event: ProviderStreamEvent) => void,
  ) => Promise<DispatchResult> | DispatchResult;

  constructor(
    execute:
      | DispatchResult
      | ((
          signal: AbortSignal,
          emit: (event: ProviderStreamEvent) => void,
        ) => Promise<DispatchResult> | DispatchResult),
  ) {
    this.#execute = typeof execute === "function" ? execute : () => execute;
  }

  describe(): ExecutionDescriptor {
    return {
      version: "1",
      kind: "internal",
      capabilityId: this.capabilityId,
      capabilityVersion: "1",
      subsystem: this.subsystem,
      summary: "Efecto interno de prueba",
      argv: [],
      environmentNames: [],
      environmentDigest: EMPTY_ENVIRONMENT_DIGEST,
      networkDestinations: [],
      targets: [],
    };
  }

  async dispatch({
    signal,
    emit,
  }: {
    signal: AbortSignal;
    emit: (event: ProviderStreamEvent) => void;
  }) {
    this.calls += 1;
    return await this.#execute(signal, emit);
  }
}

const validRevalidation = () => ({
  valid: true,
  checks: [
    {
      id: "registry_snapshot_matches" as const,
      passed: true,
      evidence: "Snapshot vigente",
    },
    {
      id: "plan_integrity_matches" as const,
      passed: true,
      evidence: "Digest vigente",
    },
  ],
  revalidationVersion: "1" as const,
});

const runtimeFixture = (
  preview: OrchestrationPreview,
  dispatcher: StepDispatcher | readonly StepDispatcher[],
  validateAgentProfiles?: (
    step: PlannedStep,
    context: ProjectContextSnapshot,
  ) => void,
) => {
  let time = NOW;
  const ids = [
    "40000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000001",
    "60000000-0000-4000-8000-000000000001",
    "70000000-0000-4000-8000-000000000001",
  ];
  const store = PersistenceStore.open(":memory:", {
    clock: () => new Date(time),
  });
  store.persistPreview(preview);
  const runtime = new RuntimeEngine({
    persistence: store,
    dispatchers: Array.isArray(dispatcher) ? dispatcher : [dispatcher],
    revalidate: validRevalidation,
    evaluatePolicy,
    ...(validateAgentProfiles ? { validateAgentProfiles } : {}),
    sha256,
    clock: () => new Date(time),
    idFactory: () => ids.shift()!,
  });
  return {
    runtime,
    store,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
  };
};

class ContextDispatcher implements StepDispatcher {
  readonly subsystem = "runtime" as const;

  constructor(
    readonly capabilityId: string,
    private readonly execute: (context: DispatchContext) => DispatchResult,
  ) {}

  describe(): ExecutionDescriptor {
    return {
      version: "1",
      kind: "internal",
      capabilityId: this.capabilityId,
      capabilityVersion: "1",
      subsystem: this.subsystem,
      summary: "Dispatcher de aislamiento",
      argv: [],
      environmentNames: [],
      environmentDigest: EMPTY_ENVIRONMENT_DIGEST,
      networkDestinations: [],
      targets: [],
    };
  }

  async dispatch(context: DispatchContext) {
    return this.execute(context);
  }
}

class RemoteProviderDispatcher implements StepDispatcher {
  readonly capabilityId = "provider.test.prompt.structured";
  readonly subsystem = "provider" as const;
  calls = 0;

  constructor(
    private readonly execute: (
      context: DispatchContext,
    ) => Promise<DispatchResult> | DispatchResult,
    private readonly recoveryCapabilities: readonly (
      | "local_checkpoint"
      | "stream_reconnect"
      | "operation_query"
      | "operation_resume"
      | "idempotent_retry"
      | "remote_cancel"
      | "exact_recovery"
    )[] = [],
  ) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return {
      version: "1",
      kind: "provider",
      capabilityId: this.capabilityId,
      capabilityVersion: "1",
      subsystem: this.subsystem,
      summary: "Proveedor remoto de prueba",
      argv: [],
      environmentNames: [],
      environmentDigest: EMPTY_ENVIRONMENT_DIGEST,
      networkDestinations: ["https://provider.test"],
      targets: [],
      providerRequest: {
        schemaVersion: "2",
        adapterId: "trivergence.test-provider",
        providerId: "test-provider",
        operation: "prompt_structured",
        transport: "http_stream",
        context: {
          destination: "https://provider.test",
          networkRequired: true,
          promptBytes: 12,
          promptDigest: "c".repeat(64),
          items: [],
          totalBytes: 12,
          redactionApplied: false,
        },
        budget: {
          maxInputBytes: 4_096,
          maxOutputBytes: 8_192,
          maxChunks: 64,
          timeoutMs: 30_000,
          maxCostMicrounits: 50_000,
        },
        adapterVersion: "1",
        adapterBuildDigest: "d".repeat(64),
        requestDigest: sha256(`request:${step.action.id}`),
        contextDigest: "e".repeat(64),
        recoveryCapabilities: [...this.recoveryCapabilities],
      },
    };
  }

  async dispatch(context: DispatchContext) {
    this.calls += 1;
    return await this.execute(context);
  }
}

const makeProviderPreview = (
  effectClass: ActionRequest["effectClass"] = "side_effectful",
): OrchestrationPreview => {
  const providerAction = {
    ...action("guarded", ["execute", "network"]),
    tool: "testProvider.promptStructured",
    effectClass,
  };
  const base = makePreview("assistant", providerAction);
  const strategy = {
    ...base.strategy,
    capabilityIds: ["provider.test.prompt.structured"],
  };
  return {
    ...base,
    request: {
      ...base.request,
      requestedCapabilities: ["provider.test.prompt.structured"],
      privacyMode: "standard",
    },
    projectContext: projectContext(
      base.request.id,
      "assistant",
      "provider.test.prompt.structured",
      "standard",
    ),
    strategy,
    plan: {
      ...base.plan,
      strategy,
      steps: [
        {
          ...base.plan.steps[0]!,
          capabilityId: "provider.test.prompt.structured",
          subsystem: "provider",
          action: providerAction,
        },
      ],
    },
  };
};

const makeStandardPreview = (): OrchestrationPreview => {
  const base = makePreview("observer", action("safe", ["read"]));
  const workspaceId = "90000000-0000-4000-8000-000000000009";
  return {
    ...base,
    request: { ...base.request, workspaceId, privacyMode: "standard" },
    projectContext: projectContext(
      base.request.id,
      "observer",
      "runtime.test.execute",
      "standard",
      workspaceId,
    ),
  };
};

const seedDurableRun = (
  store: PersistenceStore,
  preview: OrchestrationPreview,
  runId: string,
) => {
  const now = new Date(NOW).toISOString();
  store.createRun({
    id: runId,
    requestId: preview.request.id,
    planId: preview.plan.id,
    registrySnapshotId: preview.registrySnapshot.id,
    planDigest: preview.planIntegrity.digest,
    status: "planned",
    createdAt: now,
    updatedAt: now,
  });
  store.createDurableWorkflow(
    {
      schemaVersion: "1",
      runId,
      workflowId: preview.plan.id,
      workflowDefinitionVersion: preview.plan.plannerVersion,
      planDigest: preview.planIntegrity.digest,
      projectContextId: preview.projectContext.id,
      projectContextRevision: preview.projectContext.revision,
      projectContextDigest: preview.projectContext.digest,
      workspaceId: preview.projectContext.workspace.id,
      lifecycle: "prepared",
      revision: 1,
      budget: {
        limitsDigest: sha256(
          canonicalizeJson(preview.projectContext.budget.limits),
        ),
        dispatchedStepIds: [],
        providerCallsUsed: 0,
        outputBytesObserved: 0,
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: "2026-09-07T12:00:00.000Z",
    },
    preview.plan.steps.map((step) => ({
      runId,
      planId: preview.plan.id,
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
    })),
  );
  store.updateRunStatus(runId, "running", now);
  store.updateDurableWorkflowLifecycle(runId, "running", now);
};

describe("RuntimeEngine", () => {
  const profiledPreview = (
    privacyMode: "standard" | "private" = "standard",
  ) => {
    const source =
      privacyMode === "standard"
        ? makeStandardPreview()
        : makePreview("observer", action("safe", ["read"]));
    return {
      ...source,
      plan: {
        ...source.plan,
        steps: source.plan.steps.map((step) => ({
          ...step,
          agentProfiles: [
            {
              profileId: "agent.profile.review",
              revision: 1,
              digest: "7".repeat(64),
            },
          ],
        })),
      },
    };
  };

  it("fails closed when a planned profile has no runtime catalog", async () => {
    const preview = profiledPreview();
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "succeeded",
        summary: "Should not dispatch",
      }),
    );
    const result = await fixture.runtime.execute(preview);
    expect(result.status).toBe("blocked");
    expect(result.runId).toBeUndefined();
    fixture.store.close();
  });

  it("rejects a stale profile revision before dispatch", async () => {
    const preview = profiledPreview();
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "succeeded",
        summary: "Should not dispatch",
      }),
      () => {
        throw new Error("Agent profile binding changed");
      },
    );
    const result = await fixture.runtime.execute(preview);
    expect(result.status).toBe("blocked");
    expect(result.reason).toMatch(/profile binding changed/u);
    fixture.store.close();
  });

  it("preserves the validated profile reference in durable workflow state", async () => {
    const preview = profiledPreview();
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "succeeded", summary: "Confirmed" }),
      () => undefined,
    );
    const result = await fixture.runtime.execute(preview);
    expect(result.status).toBe("completed");
    expect(
      fixture.store.listDurableWorkflowSteps(result.runId!)[0]?.agentProfiles,
    ).toEqual(preview.plan.steps[0]?.agentProfiles);
    fixture.store.close();
  });

  it("keeps profile references non-durable in private mode", async () => {
    const preview = profiledPreview("private");
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "succeeded", summary: "Private" }),
      () => undefined,
    );
    const result = await fixture.runtime.execute(preview);
    expect(result.status).toBe("completed");
    expect(fixture.store.findDurableWorkflow(result.runId!)).toBeUndefined();
    fixture.store.close();
  });

  it("persists a standard workflow lifecycle and confirmed evidence atomically", async () => {
    const preview = makeStandardPreview();
    const output = { durable: true };
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "succeeded",
        summary: "Durable step completed",
        output,
        outputDigest: sha256(canonicalizeJson(output)),
      }),
    );

    const result = await fixture.runtime.execute(preview);
    expect(fixture.store.findDurableWorkflow(result.runId!)).toMatchObject({
      lifecycle: "succeeded",
      budget: { outputBytesObserved: canonicalizeJson(output).length },
      projectContextDigest: preview.projectContext.digest,
    });
    expect(fixture.store.listDurableWorkflowSteps(result.runId!)).toEqual([
      expect.objectContaining({
        lifecycle: "succeeded",
        evidenceId: expect.any(String),
        outputDigest: sha256(canonicalizeJson(output)),
      }),
    ]);
    fixture.store.close();
  });

  it("counts observed bytes even when a dispatcher exceeds the workflow budget", async () => {
    const preview = makeStandardPreview();
    const output = { text: "x".repeat(65_536) };
    const observedBytes = Buffer.byteLength(canonicalizeJson(output), "utf8");
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "succeeded",
        summary: "Oversized result",
        output,
        outputDigest: sha256(canonicalizeJson(output)),
      }),
    );
    const result = await fixture.runtime.execute(preview);
    expect(result.status).toBe("failed");
    expect(
      fixture.store.findDurableWorkflow(result.runId!)?.budget
        .outputBytesObserved,
    ).toBe(observedBytes);
    expect(
      fixture.store.listDurableWorkflowSteps(result.runId!)[0]?.lifecycle,
    ).toBe("failed");
    fixture.store.close();
  });

  it("does not create durable workflow state in private mode", async () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "succeeded", summary: "Private step" }),
    );
    const result = await fixture.runtime.execute(preview);
    expect(fixture.store.findDurableWorkflow(result.runId!)).toBeUndefined();
    fixture.store.close();
  });

  it("resumes a never-dispatched durable step after restart", async () => {
    const preview = makeStandardPreview();
    const dispatcher = new FakeDispatcher({
      outcome: "succeeded",
      summary: "Resumed safely",
    });
    const fixture = runtimeFixture(preview, dispatcher);
    const runId = "91000000-0000-4000-8000-000000000001";
    seedDurableRun(fixture.store, preview, runId);
    expect(fixture.runtime.recoverOrphans()).toEqual([runId]);

    const result = await fixture.runtime.execute(preview, {
      resumeRunId: runId,
    });
    expect(result).toMatchObject({ status: "completed", runId });
    expect(dispatcher.calls).toBe(1);
    expect(fixture.store.findDurableWorkflow(runId)?.lifecycle).toBe(
      "succeeded",
    );
    fixture.store.close();
  });

  it("reopens SQLite and a new Runtime instance before safe resume", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "trivergence-durable-runtime-"),
    );
    try {
      const path = join(directory, "workflow.db");
      const preview = makeStandardPreview();
      const first = PersistenceStore.open(path, { clock: () => new Date(NOW) });
      first.persistPreview(preview);
      const runId = "93000000-0000-4000-8000-000000000001";
      seedDurableRun(first, preview, runId);
      first.close();

      const reopened = PersistenceStore.open(path, {
        clock: () => new Date(NOW),
      });
      const dispatcher = new FakeDispatcher({
        outcome: "succeeded",
        summary: "Confirmed after restart",
      });
      const restartedRuntime = new RuntimeEngine({
        persistence: reopened,
        dispatchers: [dispatcher],
        revalidate: validRevalidation,
        evaluatePolicy,
        sha256,
        clock: () => new Date(NOW),
        idFactory: () => "94000000-0000-4000-8000-000000000001",
      });
      expect(restartedRuntime.recoverOrphans()).toEqual([runId]);
      expect(
        await restartedRuntime.execute(preview, { resumeRunId: runId }),
      ).toMatchObject({ status: "completed", runId });
      expect(dispatcher.calls).toBe(1);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not substitute a stale profile after SQLite reopen and Runtime restart", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "trivergence-profile-restart-"),
    );
    try {
      const path = join(directory, "workflow.db");
      const preview = profiledPreview();
      const first = PersistenceStore.open(path, { clock: () => new Date(NOW) });
      first.persistPreview(preview);
      const runId = "95000000-0000-4000-8000-000000000001";
      seedDurableRun(first, preview, runId);
      first.close();
      const reopened = PersistenceStore.open(path, {
        clock: () => new Date(NOW),
      });
      const dispatcher = new FakeDispatcher({
        outcome: "succeeded",
        summary: "Must not run",
      });
      const restarted = new RuntimeEngine({
        persistence: reopened,
        dispatchers: [dispatcher],
        revalidate: validRevalidation,
        evaluatePolicy,
        validateAgentProfiles: () => {
          throw new Error("Historical profile revision unavailable");
        },
        sha256,
        clock: () => new Date(NOW),
      });
      restarted.recoverOrphans();
      const result = await restarted.execute(preview, { resumeRunId: runId });
      expect(result.status).toBe("blocked");
      expect(dispatcher.calls).toBe(0);
      expect(
        reopened.listDurableWorkflowSteps(runId)[0]?.agentProfiles,
      ).toEqual(preview.plan.steps[0]?.agentProfiles);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never retries a step whose dispatch became uncertain", async () => {
    const preview = makeStandardPreview();
    const dispatcher = new FakeDispatcher({
      outcome: "succeeded",
      summary: "Must not run",
    });
    const fixture = runtimeFixture(preview, dispatcher);
    const runId = "92000000-0000-4000-8000-000000000001";
    seedDurableRun(fixture.store, preview, runId);
    fixture.store.startDurableWorkflowStep(
      runId,
      "step-1",
      new Date(NOW).toISOString(),
      false,
    );
    fixture.runtime.recoverOrphans();

    expect(
      await fixture.runtime.execute(preview, { resumeRunId: runId }),
    ).toMatchObject({
      status: "blocked",
    });
    expect(dispatcher.calls).toBe(0);
    expect(fixture.store.listDurableWorkflowSteps(runId)[0]?.lifecycle).toBe(
      "unknown",
    );
    fixture.store.close();
  });

  it("keeps a thrown durable dispatch UNKNOWN instead of inventing failure", async () => {
    const preview = makeStandardPreview();
    const dispatcher = new ContextDispatcher("runtime.test.execute", () => {
      throw new Error("Result channel lost");
    });
    const fixture = runtimeFixture(preview, dispatcher);
    const result = await fixture.runtime.execute(preview);
    expect(result).toMatchObject({ status: "orphaned", evidenceCount: 0 });
    expect(fixture.store.findDurableWorkflow(result.runId!)?.lifecycle).toBe(
      "blocked",
    );
    expect(
      fixture.store.listDurableWorkflowSteps(result.runId!)[0]?.lifecycle,
    ).toBe("unknown");
    expect(fixture.store.listEvidence(result.runId!)).toEqual([]);
    fixture.store.close();
  });

  it("persists confirmed timeout and cancellation as terminal durable states", async () => {
    const preview = makeStandardPreview();
    const timeout = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "timed_out", summary: "Timed out" }),
    );
    const timeoutResult = await timeout.runtime.execute(preview);
    expect(
      timeout.store.listDurableWorkflowSteps(timeoutResult.runId!)[0]
        ?.lifecycle,
    ).toBe("timed_out");
    timeout.store.close();

    const cancelled = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "cancelled", summary: "Cancelled" }),
    );
    const cancelledResult = await cancelled.runtime.execute(preview);
    expect(
      cancelled.store.listDurableWorkflowSteps(cancelledResult.runId!)[0]
        ?.lifecycle,
    ).toBe("cancelled");
    cancelled.store.close();
  });

  it("keeps unconfirmed process-tree termination uncertain without terminal evidence", async () => {
    const preview = makeStandardPreview();
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "cancelled",
        summary: "Termination request sent",
        treeTerminationConfirmed: false,
      }),
    );
    const result = await fixture.runtime.execute(preview);
    expect(result).toMatchObject({ status: "orphaned", evidenceCount: 0 });
    expect(
      fixture.store.listDurableWorkflowSteps(result.runId!)[0]?.lifecycle,
    ).toBe("unknown");
    expect(fixture.store.listEvidence(result.runId!)).toEqual([]);
    fixture.store.close();
  });

  it("preserves provider-call budgets and approval references", async () => {
    const preview = makeProviderPreview("side_effectful");
    const fixture = runtimeFixture(
      preview,
      new RemoteProviderDispatcher(() => ({
        outcome: "succeeded",
        remoteState: "succeeded",
        summary: "Provider completed",
      })),
    );
    const approval = fixture.runtime.requestApproval(preview, "step-1");
    fixture.runtime.decideApproval(approval.id, "grant", "durability-test");
    const result = await fixture.runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
    });
    expect(fixture.store.findDurableWorkflow(result.runId!)).toMatchObject({
      budget: { providerCallsUsed: 1, dispatchedStepIds: ["step-1"] },
    });
    expect(
      fixture.store.listDurableWorkflowSteps(result.runId!)[0],
    ).toMatchObject({
      approvalId: approval.id,
      attemptId: expect.any(String),
    });
    fixture.store.close();
  });
  it("executes an allowed persisted step and records evidence", async () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const dispatcher = new FakeDispatcher({
      outcome: "succeeded",
      summary: "Lectura completada",
      outputDigest: "c".repeat(64),
    });
    const { runtime, store } = runtimeFixture(preview, dispatcher);

    const result = await runtime.execute(preview);

    expect(result).toMatchObject({ status: "completed", evidenceCount: 1 });
    expect(dispatcher.calls).toBe(1);
    expect(store.findRun(result.runId!)?.status).toBe("completed");
    expect(store.listEvidence(result.runId!)).toHaveLength(1);
    store.close();
  });

  it("validates stream events without giving observers control", async () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const dispatcher = new FakeDispatcher((_signal, emit) => {
      emit({
        type: "started",
        requestId: "30000000-0000-4000-8000-000000000010",
        sequence: 0,
        observedAt: "2026-08-07T12:00:00.000Z",
      });
      return { outcome: "succeeded", summary: "Stream completed" };
    });
    const { runtime, store } = runtimeFixture(preview, dispatcher);
    let observed = 0;

    const result = await runtime.execute(preview, {
      onEvent: () => {
        observed += 1;
        throw new Error("Observer failure must be isolated");
      },
    });

    expect(result.status).toBe("completed");
    expect(observed).toBe(1);
    store.close();
  });

  it("blocks deny without invoking a dispatcher", async () => {
    const preview = makePreview("observer", action("guarded", ["execute"]));
    const dispatcher = new FakeDispatcher({
      outcome: "succeeded",
      summary: "No debe ejecutarse",
    });
    const { runtime, store } = runtimeFixture(preview, dispatcher);

    expect(await runtime.execute(preview)).toMatchObject({ status: "blocked" });
    expect(dispatcher.calls).toBe(0);
    expect(
      store
        .listAuditEvents()
        .some((event) => event.eventType === "execution.blocked"),
    ).toBe(true);
    store.close();
  });

  it("requires, grants and consumes an approval exactly once", async () => {
    const preview = makePreview("assistant", action("guarded", ["execute"]));
    const dispatcher = new FakeDispatcher({
      outcome: "succeeded",
      summary: "Ejecución aprobada",
    });
    const { runtime, store } = runtimeFixture(preview, dispatcher);

    expect(await runtime.execute(preview)).toMatchObject({
      status: "approval_required",
    });
    const approval = runtime.requestApproval(preview, "step-1");
    runtime.decideApproval(approval.id, "grant", "local-user");
    expect(
      await runtime.execute(preview, {
        approvalIds: { "step-1": approval.id },
      }),
    ).toMatchObject({ status: "completed" });
    expect(store.findApproval(approval.id)?.status).toBe("consumed");
    expect(
      await runtime.execute(preview, {
        approvalIds: { "step-1": approval.id },
      }),
    ).toMatchObject({ status: "approval_required" });
    expect(dispatcher.calls).toBe(1);
    store.close();
  });

  it("blocks denied and expires stale approvals", async () => {
    const preview = makePreview("assistant", action("guarded", ["execute"]));
    const dispatcher = new FakeDispatcher({
      outcome: "succeeded",
      summary: "No debe ejecutarse",
    });
    const deniedFixture = runtimeFixture(preview, dispatcher);
    const denied = deniedFixture.runtime.requestApproval(preview, "step-1");
    deniedFixture.runtime.decideApproval(denied.id, "deny", "local-user");
    expect(
      await deniedFixture.runtime.execute(preview, {
        approvalIds: { "step-1": denied.id },
      }),
    ).toMatchObject({ status: "blocked" });
    deniedFixture.store.close();

    const expiredFixture = runtimeFixture(preview, dispatcher);
    const expired = expiredFixture.runtime.requestApproval(
      preview,
      "step-1",
      1_000,
    );
    expiredFixture.runtime.decideApproval(expired.id, "grant", "local-user");
    expiredFixture.advance(1_001);
    expect(
      await expiredFixture.runtime.execute(preview, {
        approvalIds: { "step-1": expired.id },
      }),
    ).toMatchObject({ status: "approval_required" });
    expect(expiredFixture.store.findApproval(expired.id)?.status).toBe(
      "expired",
    );
    expect(dispatcher.calls).toBe(0);
    expiredFixture.store.close();
  });

  it("maps timeout and unconfirmed tree termination to terminal states", async () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const timeout = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "timed_out", summary: "Timeout" }),
    );
    expect(await timeout.runtime.execute(preview)).toMatchObject({
      status: "timed_out",
    });
    timeout.store.close();

    const orphan = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "cancelled",
        summary: "Cancelación no confirmada",
        treeTerminationConfirmed: false,
      }),
    );
    expect(await orphan.runtime.execute(preview)).toMatchObject({
      status: "orphaned",
    });
    orphan.store.close();
  });

  it("rejects an ephemeral output whose digest is missing or mismatched", async () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "succeeded",
        summary: "Salida no confiable",
        output: { value: "sensitive" },
        outputDigest: "f".repeat(64),
      }),
    );

    expect(await fixture.runtime.execute(preview)).toMatchObject({
      status: "failed",
      evidenceCount: 0,
      reason: "Private execution failed safely",
    });
    fixture.store.close();
  });

  it("isolates direct dependency outputs with detached deep-frozen snapshots", async () => {
    const base = makePreview("observer", action("safe", ["read"]));
    const capabilities = [
      "runtime.test.first",
      "runtime.test.second",
      "runtime.test.third",
    ];
    const steps = capabilities.map((capabilityId, index) => ({
      id: `step-${index + 1}`,
      capabilityId,
      subsystem: "runtime" as const,
      dependsOn: index === 0 ? [] : [`step-${index}`],
      action: {
        ...action("safe", ["read"]),
        id: `30000000-0000-4000-8000-00000000000${index + 1}`,
        tool: capabilityId,
      },
      policy: evaluatePolicy("observer", action("safe", ["read"])),
    }));
    const preview: OrchestrationPreview = {
      ...base,
      request: { ...base.request, requestedCapabilities: [capabilities[2]!] },
      registrySnapshot: { ...base.registrySnapshot, capabilityCount: 3 },
      strategy: {
        ...base.strategy,
        kind: "sequential",
        capabilityIds: capabilities,
      },
      plan: {
        ...base.plan,
        strategy: {
          ...base.strategy,
          kind: "sequential",
          capabilityIds: capabilities,
        },
        steps,
      },
    };
    const firstOutput = { nested: { value: "original" } };
    const first = new ContextDispatcher(capabilities[0]!, () => ({
      outcome: "succeeded",
      summary: "Primero",
      output: firstOutput,
      outputDigest: sha256(canonicalizeJson(firstOutput)),
    }));
    const secondOutput = { observed: "original" };
    const second = new ContextDispatcher(capabilities[1]!, (context) => {
      const dependency = context.outputs["step-1"] as typeof firstOutput;
      expect(Object.isFrozen(dependency)).toBe(true);
      expect(Object.isFrozen(dependency.nested)).toBe(true);
      expect(() => {
        dependency.nested.value = "tampered";
      }).toThrow();
      expect(dependency.nested.value).toBe("original");
      return {
        outcome: "succeeded",
        summary: "Segundo",
        output: secondOutput,
        outputDigest: sha256(canonicalizeJson(secondOutput)),
      };
    });
    const third = new ContextDispatcher(capabilities[2]!, (context) => {
      expect(Object.keys(context.outputs)).toEqual(["step-2"]);
      expect(context.outputs["step-1"]).toBeUndefined();
      return { outcome: "succeeded", summary: "Tercero" };
    });
    const fixture = runtimeFixture(preview, [first, second, third]);

    expect(await fixture.runtime.execute(preview)).toMatchObject({
      status: "completed",
      evidenceCount: 3,
    });
    expect(firstOutput.nested.value).toBe("original");
    fixture.store.close();
  });

  it("cancels an active run through AbortSignal", async () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const dispatcher = new FakeDispatcher(
      (signal) =>
        new Promise<DispatchResult>((resolve) => {
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                outcome: "cancelled",
                summary: "Cancelado por usuario",
              }),
            { once: true },
          );
        }),
    );
    const { runtime, store } = runtimeFixture(preview, dispatcher);

    const completion = runtime.execute(preview);
    expect(runtime.cancel("40000000-0000-4000-8000-000000000001")).toBe(true);
    expect(await completion).toMatchObject({ status: "cancelled" });
    store.close();
  });

  it("stops with explicit unknown state after a possibly dispatched request loses its response", async () => {
    const preview = makeProviderPreview("irreversible");
    const dispatcher = new RemoteProviderDispatcher(() => {
      throw new Error("Connection lost after request bytes were sent");
    }, ["idempotent_retry"]);
    const { runtime, store } = runtimeFixture(preview, dispatcher);
    const approval = runtime.requestApproval(preview, "step-1");
    runtime.decideApproval(approval.id, "grant", "recovery-test-user");

    const result = await runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
    });
    const attempt = store.findProviderExecutionAttemptForRun(
      result.runId!,
      "step-1",
    );

    expect(result).toMatchObject({
      status: "remote_state_unknown",
      evidenceCount: 0,
    });
    expect(dispatcher.calls).toBe(1);
    expect(attempt).toMatchObject({
      adapterId: "trivergence.test-provider",
      adapterVersion: "1",
      adapterBuildDigest: "d".repeat(64),
      providerId: "test-provider",
      transport: "http_stream",
      contextDigest: "e".repeat(64),
      effectClass: "irreversible",
      remoteState: "remote_state_unknown",
      recoveryCapabilities: ["idempotent_retry"],
      budget: { maxCostMicrounits: 50_000 },
    });
    expect(store.findRun(result.runId!)?.status).toBe("orphaned");
    expect(
      store
        .listAuditEvents()
        .some(
          (event) =>
            event.eventType === "provider.remote_state_changed" &&
            event.subjectId === attempt?.id &&
            event.payload["to"] === "remote_state_unknown",
        ),
    ).toBe(true);
    store.close();
  });

  it("does not turn an unconfirmed remote cancellation into cancelled", async () => {
    const preview = makeProviderPreview("side_effectful");
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const dispatcher = new RemoteProviderDispatcher(
      (context) =>
        new Promise<DispatchResult>((resolve) => {
          markStarted();
          context.signal.addEventListener(
            "abort",
            () =>
              resolve({
                outcome: "remote_state_unknown",
                remoteState: "remote_state_unknown",
                summary: "Cancel request was sent but not acknowledged",
              }),
            { once: true },
          );
        }),
      ["remote_cancel"],
    );
    const { runtime, store } = runtimeFixture(preview, dispatcher);
    const approval = runtime.requestApproval(preview, "step-1");
    runtime.decideApproval(approval.id, "grant", "recovery-test-user");

    const completion = runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
    });
    await started;
    expect(runtime.cancel("50000000-0000-4000-8000-000000000001")).toBe(true);
    const result = await completion;
    const attempt = store.findProviderExecutionAttemptForRun(
      result.runId!,
      "step-1",
    );

    expect(result.status).toBe("remote_state_unknown");
    expect(dispatcher.calls).toBe(1);
    expect(attempt?.remoteState).toBe("remote_state_unknown");
    store.close();
  });

  it("requires an attributed human decision to resolve unknown remote state", async () => {
    const preview = makeProviderPreview("side_effectful");
    const { runtime, store } = runtimeFixture(
      preview,
      new RemoteProviderDispatcher(() => {
        throw new Error("Response lost");
      }),
    );
    const approval = runtime.requestApproval(preview, "step-1");
    runtime.decideApproval(approval.id, "grant", "recovery-test-user");
    const result = await runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
    });
    const attempt = store.findProviderExecutionAttemptForRun(
      result.runId!,
      "step-1",
    )!;

    expect(() =>
      store.updateProviderExecutionState(
        attempt.id,
        "failed",
        new Date(NOW).toISOString(),
      ),
    ).toThrow(/requires an actor/u);
    expect(
      runtime.resolveUnknownProviderExecution(
        attempt.id,
        "failed",
        "local-reviewer",
      ),
    ).toMatchObject({
      remoteState: "failed",
      resolutionActor: "local-reviewer",
    });
    expect(() =>
      runtime.resolveUnknownProviderExecution(
        attempt.id,
        "succeeded",
        "local-reviewer",
      ),
    ).toThrow(/Invalid provider state transition/u);
    expect(
      store
        .listAuditEvents()
        .some(
          (event) =>
            event.eventType === "provider.remote_state_resolved" &&
            event.payload["actor"] === "local-reviewer",
        ),
    ).toBe(true);
    store.close();
  });

  it("does not persist private goals, arguments or dispatcher errors", async () => {
    const secret = "PRIVATE_RUNTIME_SECRET_9f6a";
    const privateAction = {
      ...action("safe", ["read"]),
      input: { query: secret },
    };
    const base = makePreview("observer", privateAction);
    const preview: OrchestrationPreview = {
      ...base,
      request: {
        ...base.request,
        goal: secret,
        privacyMode: "private",
        workspaceId: "90000000-0000-4000-8000-000000000001",
      },
      projectContext: projectContext(
        base.request.id,
        "observer",
        "runtime.test.execute",
        "private",
        "90000000-0000-4000-8000-000000000001",
      ),
    };
    const { runtime, store } = runtimeFixture(
      preview,
      new FakeDispatcher({
        outcome: "failed",
        summary: `Transport echoed ${secret}`,
      }),
    );

    const result = await runtime.execute(preview);
    const persisted = JSON.stringify(
      store.exportWorkspaceData(preview.request.workspaceId!),
    );
    expect(result.reason).toBe("Private runtime step failed");
    expect(persisted).not.toContain(secret);
    expect(persisted).toContain("Private runtime step failed");
    store.close();
  });

  it("marks running records orphaned during restart recovery", () => {
    const preview = makePreview("observer", action("safe", ["read"]));
    const fixture = runtimeFixture(
      preview,
      new FakeDispatcher({ outcome: "succeeded", summary: "unused" }),
    );
    fixture.store.createRun({
      id: "80000000-0000-4000-8000-000000000001",
      requestId: preview.request.id,
      planId: preview.plan.id,
      registrySnapshotId: preview.registrySnapshot.id,
      planDigest: preview.planIntegrity.digest,
      status: "planned",
      createdAt: new Date(NOW).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    });
    fixture.store.updateRunStatus(
      "80000000-0000-4000-8000-000000000001",
      "running",
      new Date(NOW).toISOString(),
    );

    expect(fixture.runtime.recoverOrphans()).toEqual([
      "80000000-0000-4000-8000-000000000001",
    ]);
    expect(
      fixture.store.findRun("80000000-0000-4000-8000-000000000001")?.status,
    ).toBe("orphaned");
    fixture.store.close();
  });

  it("distinguishes a crash before dispatch from one after possible dispatch", () => {
    const preview = makeProviderPreview("side_effectful");
    const fixture = runtimeFixture(
      preview,
      new RemoteProviderDispatcher(() => ({
        outcome: "succeeded",
        remoteState: "succeeded",
        summary: "unused",
      })),
    );
    const seed = (
      runId: string,
      attemptId: string,
      remoteState: "not_dispatched" | "dispatching",
    ) => {
      fixture.store.createRun({
        id: runId,
        requestId: preview.request.id,
        planId: preview.plan.id,
        registrySnapshotId: preview.registrySnapshot.id,
        planDigest: preview.planIntegrity.digest,
        status: "planned",
        createdAt: new Date(NOW).toISOString(),
        updatedAt: new Date(NOW).toISOString(),
      });
      fixture.store.updateRunStatus(
        runId,
        "running",
        new Date(NOW).toISOString(),
      );
      fixture.store.saveProviderExecutionAttempt({
        id: attemptId,
        runId,
        planId: preview.plan.id,
        stepId: "step-1",
        capabilityId: "provider.test.prompt.structured",
        adapterId: "trivergence.test-provider",
        adapterVersion: "1",
        adapterBuildDigest: "d".repeat(64),
        providerId: "test-provider",
        transport: "http_stream",
        requestDigest: sha256(runId),
        contextDigest: "e".repeat(64),
        effectClass: "side_effectful",
        recoveryCapabilities: [],
        remoteState: "not_dispatched",
        budget: {
          maxInputBytes: 4_096,
          maxOutputBytes: 8_192,
          maxChunks: 64,
          timeoutMs: 30_000,
          maxCostMicrounits: 50_000,
        },
        createdAt: new Date(NOW).toISOString(),
        updatedAt: new Date(NOW).toISOString(),
      });
      if (remoteState === "dispatching") {
        fixture.store.updateProviderExecutionState(
          attemptId,
          "dispatching",
          new Date(NOW).toISOString(),
        );
      }
    };
    const beforeRun = "81000000-0000-4000-8000-000000000001";
    const afterRun = "82000000-0000-4000-8000-000000000001";
    const beforeAttempt = "83000000-0000-4000-8000-000000000001";
    const afterAttempt = "84000000-0000-4000-8000-000000000001";
    seed(beforeRun, beforeAttempt, "not_dispatched");
    seed(afterRun, afterAttempt, "dispatching");

    expect(fixture.runtime.recoverOrphans()).toEqual([beforeRun, afterRun]);
    expect(
      fixture.store.findProviderExecutionAttempt(beforeAttempt)?.remoteState,
    ).toBe("not_dispatched");
    expect(
      fixture.store.findProviderExecutionAttempt(afterAttempt)?.remoteState,
    ).toBe("remote_state_unknown");
    fixture.store.close();
  });
});
