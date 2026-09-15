import { createHash } from "node:crypto";

import type {
  ActionRequest,
  ExecutionDescriptor,
  OrchestrationPreview,
  PolicyProfile,
  ProviderStreamEvent,
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

describe("RuntimeEngine", () => {
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
});
