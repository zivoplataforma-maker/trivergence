import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  branchGroupSchema,
  type ActionRequest,
  type BranchGroup,
  type ContextSliceManifest,
  type ExecutionDescriptor,
  type OrchestrationPreview,
  type PlannedStep,
  type ProjectContextSnapshot,
} from "@trivergence/contracts";
import {
  canonicalizeJson,
  ContextSliceBuilder,
} from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import { describe, expect, it } from "vitest";

import {
  RuntimeEngine,
  type DispatchContext,
  type DispatchResult,
  type StepDispatcher,
} from "./index.js";

const NOW = "2026-09-25T14:00:00.000Z";
const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const REQUEST = "20000000-0000-4000-8000-000000000001";
const PLAN = "30000000-0000-4000-8000-000000000001";
const CONTEXT = "40000000-0000-4000-8000-000000000001";
const PLAN_DIGEST = "a".repeat(64);
const REGISTRY_DIGEST = "b".repeat(64);
const ENV_DIGEST = "c".repeat(64);
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const action = (
  id: string,
  overrides: Partial<ActionRequest> = {},
): ActionRequest => ({
  id,
  tool: `runtime.${id}.read`,
  toolVersion: "1",
  kinds: ["read"],
  risk: "safe",
  effectClass: "read_only",
  summary: `Read ${id}`,
  ...overrides,
});

const makePreview = (
  count = 2,
  privacyMode: "standard" | "private" = "standard",
) => {
  const steps: PlannedStep[] = Array.from({ length: count }, (_, index) => {
    const stepAction = action(
      `00000000-0000-4000-8000-0000000000${index + 10}`,
    );
    return {
      id: `step-${index + 1}`,
      capabilityId: `runtime.branch.${index + 1}`,
      subsystem: "runtime",
      dependsOn: [],
      action: stepAction,
      policy: evaluatePolicy("observer", stepAction),
    };
  });
  const projectContext: ProjectContextSnapshot = {
    schemaVersion: "1",
    id: CONTEXT,
    revision: 1,
    createdAt: NOW,
    workspace: { id: WORKSPACE, fingerprint: sha256("workspace") },
    objective: {
      requestId: REQUEST,
      goalDigest: sha256("goal"),
      restrictionReferences: [],
    },
    governance: {
      profile: "observer",
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
        id: REGISTRY_DIGEST,
        version: "test",
        capabilityCount: count,
      },
      references: steps.map((step) => ({
        id: step.capabilityId,
        version: "1",
        status: "available" as const,
        descriptorDigest: sha256(step.capabilityId),
      })),
    },
    budget: {
      limits: {
        maxAgents: 3,
        maxProviderCalls: 4,
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
        sourceId: `workspace:${WORKSPACE}`,
        workspaceId: WORKSPACE,
        version: "1",
        digest: sha256("workspace"),
        trust: "trusted_metadata",
        provenance: {
          origin: "workspace",
          observedAt: NOW,
          digest: sha256("source"),
        },
      },
    ],
    provenance: {
      builderVersion: "1",
      canonicalizationVersion: "1",
      inputDigest: sha256("context-input"),
      sourceDigests: [sha256("workspace")],
    },
    digest: sha256("context"),
  };
  const strategy = {
    kind: "parallel" as const,
    reason: "Independent safe reads",
    capabilityIds: steps.map((step) => step.capabilityId),
    evidence: ["bounded"],
    strategyVersion: "2" as const,
  };
  return {
    request: {
      id: REQUEST,
      goal: "Run bounded independent reads",
      profile: "observer" as const,
      privacyMode,
      workspaceId: WORKSPACE,
      requestedCapabilities: steps.map((step) => step.capabilityId),
    },
    projectContext,
    registryVersion: "test",
    registrySnapshot: projectContext.capabilities.registrySnapshot,
    strategy,
    plan: {
      id: PLAN,
      requestId: REQUEST,
      strategy,
      steps,
      issues: [],
      plannerVersion: "1" as const,
    },
    evaluation: {
      phase: "preflight" as const,
      status: "ready" as const,
      reason: "Ready",
      checks: [
        {
          id: "strategy_resolved" as const,
          passed: true,
          evidence: "resolved",
        },
        { id: "plan_valid" as const, passed: true, evidence: "valid" },
        { id: "steps_present" as const, passed: true, evidence: "present" },
        { id: "policy_satisfied" as const, passed: true, evidence: "allowed" },
      ],
      evaluatorVersion: "2" as const,
    },
    planIntegrity: {
      algorithm: "sha256" as const,
      digest: PLAN_DIGEST,
      canonicalizationVersion: "1" as const,
    },
  } satisfies OrchestrationPreview;
};

class BranchDispatcher implements StepDispatcher {
  readonly capabilityId = "runtime.branch.1";
  readonly capabilityIds = [
    "runtime.branch.1",
    "runtime.branch.2",
    "runtime.branch.3",
  ];
  readonly subsystem = "runtime" as const;
  active = 0;
  maximumActive = 0;
  calls: string[] = [];

  constructor(
    private readonly handler: (
      context: DispatchContext,
    ) => Promise<DispatchResult> | DispatchResult = (context) => {
      const output = { stepId: context.step.id };
      return {
        outcome: "succeeded",
        summary: `Completed ${context.step.id}`,
        output,
        outputDigest: sha256(canonicalizeJson(output)),
      };
    },
  ) {}

  describe(step: PlannedStep): ExecutionDescriptor {
    return {
      version: "1",
      kind: "internal",
      capabilityId: step.capabilityId,
      capabilityVersion: "1",
      subsystem: "runtime",
      summary: "Bounded branch test",
      argv: [],
      environmentNames: [],
      environmentDigest: ENV_DIGEST,
      networkDestinations: [],
      targets: [],
    };
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    this.calls.push(context.step.id);
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    try {
      return await this.handler(context);
    } finally {
      this.active -= 1;
    }
  }
}

const makeGroup = (preview: OrchestrationPreview, maxConcurrency = 2) => {
  const sliceBuilder = new ContextSliceBuilder(sha256, () => new Date(NOW));
  const groupId = "group-main";
  const branchSteps = preview.plan.steps.filter(
    (step) => step.dependsOn.length === 0,
  );
  const slices = branchSteps.map((step, index) =>
    sliceBuilder.build(preview.projectContext, {
      id: `50000000-0000-4000-8000-0000000000${index + 10}`,
      groupId,
      branchId: `branch-${index + 1}`,
      sourceIds: [],
      capabilityIds: [step.capabilityId],
      createdAt: NOW,
    }),
  );
  const branches = branchSteps.map((step, index) => ({
    schemaVersion: "1" as const,
    branchId: `branch-${index + 1}`,
    groupId,
    stepId: step.id,
    parentStepId: "confirmed-parent",
    dependencies: [],
    depth: 1 as const,
    agentProfiles: step.agentProfiles ?? [],
    projectContext: {
      id: preview.projectContext.id,
      revision: preview.projectContext.revision,
      digest: preview.projectContext.digest,
    },
    contextSlice: {
      id: slices[index]!.id,
      revision: 1,
      digest: slices[index]!.digest,
    },
    requiredCapabilities: [step.capabilityId],
    budget: { maxProviderCalls: 0, maxOutputBytes: 8_192, timeoutMs: 5_000 },
    policyBinding: {
      rulesetVersion: step.policy.rulesetVersion,
      decision: "allow" as const,
      actionDigest: sha256(canonicalizeJson(step.action)),
    },
    executionTarget: {
      subsystem: step.subsystem,
      capabilityId: step.capabilityId,
    },
    expectedResult: { evidenceRequired: true as const, outputRequired: false },
    provenance: {
      plannerVersion: "1",
      planDigest: PLAN_DIGEST,
      descriptorDigest: sha256(
        canonicalizeJson({
          version: "1",
          kind: "internal",
          capabilityId: step.capabilityId,
          capabilityVersion: "1",
          subsystem: "runtime",
          summary: "Bounded branch test",
          argv: [],
          environmentNames: [],
          environmentDigest: ENV_DIGEST,
          networkDestinations: [],
          targets: [],
        }),
      ),
    },
  }));
  const unsigned = {
    schemaVersion: "1" as const,
    groupId,
    planId: PLAN,
    planDigest: PLAN_DIGEST,
    workspaceId: WORKSPACE,
    objectiveRequestId: REQUEST,
    parentStepId: "confirmed-parent",
    maxConcurrency,
    maxDepth: 1 as const,
    fanInPolicy: {
      mode: "all_succeeded" as const,
      minimumSucceeded: branches.length,
    },
    budget: { maxProviderCalls: 0, maxOutputBytes: 32_768, timeoutMs: 10_000 },
    branches,
  };
  return {
    group: branchGroupSchema.parse({
      ...unsigned,
      digest: sha256(canonicalizeJson(unsigned)),
    }),
    slices,
  };
};

const fixture = (
  preview: OrchestrationPreview,
  dispatcher = new BranchDispatcher(),
) => {
  const store = PersistenceStore.open(":memory:", {
    clock: () => new Date(NOW),
  });
  store.persistPreview(preview);
  const runtime = new RuntimeEngine({
    persistence: store,
    dispatchers: [dispatcher],
    revalidate: () => ({
      valid: true,
      checks: [
        { id: "registry_snapshot_matches", passed: true, evidence: "same" },
        { id: "plan_integrity_matches", passed: true, evidence: "same" },
      ],
      revalidationVersion: "1",
    }),
    evaluatePolicy,
    sha256,
    clock: () => new Date(NOW),
    idFactory: randomUUID,
  });
  return { runtime, store, dispatcher };
};

const run = async (
  preview: OrchestrationPreview = makePreview(),
  dispatcher = new BranchDispatcher(),
  mutate?: (
    group: BranchGroup,
    slices: ContextSliceManifest[],
  ) => [BranchGroup, ContextSliceManifest[]],
) => {
  const { runtime, store } = fixture(preview, dispatcher);
  const created = makeGroup(preview);
  const [group, slices] = mutate
    ? mutate(structuredClone(created.group), structuredClone(created.slices))
    : [created.group, created.slices];
  const result = await runtime.executeBranchGroup(preview, group, {
    contextSlices: slices,
  });
  return { result, runtime, store, dispatcher, group, slices };
};

describe("RuntimeEngine bounded fan-out/fan-in", () => {
  it("runs two safe branches and produces deterministic verified fan-in", async () => {
    const { result, store } = await run();
    expect(result.status).toBe("completed");
    expect(result.fanIn).toMatchObject({
      status: "confirmed",
      succeededBranches: 2,
    });
    expect(result.fanIn?.branchResults.map((entry) => entry.branchId)).toEqual([
      "branch-1",
      "branch-2",
    ]);
    expect(store.listEvidence(result.runId!)).toHaveLength(2);
    store.close();
  });

  it("runs N branches", async () => {
    const preview = makePreview(3);
    const { result, store } = await run(preview);
    expect(result.fanIn?.expectedBranches).toBe(3);
    store.close();
  });

  it("executes a dependent step only after verified fan-in", async () => {
    const base = makePreview(3);
    const continuationAction = base.plan.steps[2]!.action;
    const continuation = {
      ...base.plan.steps[2]!,
      dependsOn: ["step-1", "step-2"],
      policy: evaluatePolicy("observer", continuationAction),
    };
    const preview: OrchestrationPreview = {
      ...base,
      plan: {
        ...base.plan,
        steps: [base.plan.steps[0]!, base.plan.steps[1]!, continuation],
      },
    };
    const observedInputs: string[][] = [];
    const dispatcher = new BranchDispatcher((context) => {
      observedInputs.push(Object.keys(context.outputs).sort());
      const output = { id: context.step.id };
      return {
        outcome: "succeeded",
        summary: "ok",
        output,
        outputDigest: sha256(canonicalizeJson(output)),
      };
    });
    const { result, store } = await run(preview, dispatcher);
    expect(dispatcher.calls).toEqual(["step-1", "step-2", "step-3"]);
    expect(observedInputs.at(-1)).toEqual(["step-1", "step-2"]);
    expect(result.status).toBe("completed");
    expect(result.evidenceCount).toBe(3);
    store.close();
  });

  it.each([1, 2])("never exceeds maxConcurrency=%i", async (limit) => {
    const preview = makePreview(3);
    const dispatcher = new BranchDispatcher(async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const output = { id: context.step.id };
      return {
        outcome: "succeeded",
        summary: "ok",
        output,
        outputDigest: sha256(canonicalizeJson(output)),
      };
    });
    const { runtime, store } = fixture(preview, dispatcher);
    const { group, slices } = makeGroup(preview, limit);
    await runtime.executeBranchGroup(preview, group, { contextSlices: slices });
    expect(dispatcher.maximumActive).toBeLessThanOrEqual(limit);
    store.close();
  });

  it("schedules equivalent branches by stable branch ID", async () => {
    const preview = makePreview(3);
    const { result, dispatcher, store } = await run(preview);
    expect(dispatcher.calls.slice(0, 2)).toEqual(["step-1", "step-2"]);
    expect(result.fanIn?.branchResults.map((entry) => entry.branchId)).toEqual([
      "branch-1",
      "branch-2",
      "branch-3",
    ]);
    store.close();
  });

  it("does not double dispatch a branch", async () => {
    const { dispatcher, store } = await run();
    expect(dispatcher.calls).toEqual(["step-1", "step-2"]);
    store.close();
  });

  it("preserves a distinct governed context slice per branch", async () => {
    const dispatcher = new BranchDispatcher((context) => {
      expect(context.contextSlice?.branchId).toBe(
        `branch-${context.step.id.at(-1)}`,
      );
      return { outcome: "succeeded", summary: "ok" };
    });
    const { store } = await run(makePreview(), dispatcher);
    store.close();
  });

  it("makes failure explicit and never confirms fan-in", async () => {
    const dispatcher = new BranchDispatcher((context) =>
      context.step.id === "step-2"
        ? { outcome: "failed", summary: "failed" }
        : { outcome: "succeeded", summary: "ok" },
    );
    const { result, store } = await run(makePreview(), dispatcher);
    expect(result.status).toBe("failed");
    expect(result.fanIn?.status).toBe("failed");
    store.close();
  });

  it("records a confirmed timeout without converting it to success", async () => {
    const dispatcher = new BranchDispatcher(
      (context) =>
        new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => resolve({ outcome: "cancelled", summary: "cancelled" }),
            { once: true },
          );
        }),
    );
    const { result, store } = await run(
      makePreview(),
      dispatcher,
      (group, slices) => {
        const branches = group.branches.map((branch) => ({
          ...branch,
          budget: { ...branch.budget, timeoutMs: 100 },
        }));
        const unsigned = { ...group, branches };
        const payload = { ...unsigned };
        Reflect.deleteProperty(payload, "digest");
        return [
          { ...unsigned, digest: sha256(canonicalizeJson(payload)) },
          slices,
        ];
      },
    );
    expect(result.status).toBe("failed");
    expect(
      store
        .listBranchExecutions(result.runId!, "group-main")
        .every((branch) => branch.lifecycle === "failed"),
    ).toBe(true);
    store.close();
  });

  it("preserves UNKNOWN and blocks fan-in after an uncertain dispatch", async () => {
    const dispatcher = new BranchDispatcher((context) => {
      if (context.step.id === "step-2") throw new Error("lost terminal result");
      return { outcome: "succeeded", summary: "ok" };
    });
    const { result, store } = await run(makePreview(), dispatcher);
    expect(result.status).toBe("remote_state_unknown");
    expect(result.fanIn?.status).toBe("blocked");
    expect(
      store.listBranchExecutions(result.runId!, "group-main"),
    ).toContainEqual(
      expect.objectContaining({ branchId: "branch-2", lifecycle: "unknown" }),
    );
    store.close();
  });

  it("recovers a confirmed branch and converts only interrupted RUNNING to UNKNOWN", async () => {
    const directory = mkdtempSync(
      join(tmpdir(), "trivergence-fanout-restart-"),
    );
    const databasePath = join(directory, "state.sqlite");
    try {
      const preview = makePreview();
      const dispatcher = new BranchDispatcher((context) =>
        context.step.id === "step-1"
          ? { outcome: "succeeded", summary: "confirmed" }
          : new Promise<DispatchResult>(() => undefined),
      );
      const first = PersistenceStore.open(databasePath, {
        clock: () => new Date(NOW),
      });
      first.persistPreview(preview);
      const runtime = new RuntimeEngine({
        persistence: first,
        dispatchers: [dispatcher],
        revalidate: () => ({
          valid: true,
          checks: [
            { id: "registry_snapshot_matches", passed: true, evidence: "same" },
            { id: "plan_integrity_matches", passed: true, evidence: "same" },
          ],
          revalidationVersion: "1",
        }),
        evaluatePolicy,
        sha256,
        clock: () => new Date(NOW),
        idFactory: randomUUID,
      });
      const { group, slices } = makeGroup(preview, 1);
      const runId = randomUUID();
      void runtime.executeBranchGroup(preview, group, {
        contextSlices: slices,
        runId,
      });
      while (dispatcher.calls.length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      first.close();

      const reopened = PersistenceStore.open(databasePath, {
        clock: () => new Date(NOW),
      });
      expect(reopened.recoverRunningRuns(NOW)).toEqual([runId]);
      expect(reopened.listBranchExecutions(runId, group.groupId)).toEqual([
        expect.objectContaining({
          branchId: "branch-1",
          lifecycle: "succeeded",
        }),
        expect.objectContaining({ branchId: "branch-2", lifecycle: "unknown" }),
      ]);
      expect(reopened.findBranchGroup(runId, group.groupId)?.lifecycle).toBe(
        "blocked",
      );
      expect(dispatcher.calls).toEqual(["step-1", "step-2"]);
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("supports explicit partial degradation without reporting success", async () => {
    const dispatcher = new BranchDispatcher((context) =>
      context.step.id === "step-2"
        ? { outcome: "failed", summary: "failed" }
        : { outcome: "succeeded", summary: "ok" },
    );
    const { result, store } = await run(
      makePreview(),
      dispatcher,
      (group, slices) => {
        const unsigned = {
          ...group,
          fanInPolicy: { mode: "allow_partial" as const, minimumSucceeded: 1 },
        };
        const payload = { ...unsigned };
        Reflect.deleteProperty(payload, "digest");
        return [
          { ...unsigned, digest: sha256(canonicalizeJson(payload)) },
          slices,
        ];
      },
    );
    expect(result.status).toBe("failed");
    expect(result.fanIn?.status).toBe("degraded");
    store.close();
  });

  it("cancels a group idempotently and prevents later dispatches", async () => {
    const preview = makePreview(3);
    const dispatcher = new BranchDispatcher(
      (context) =>
        new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => resolve({ outcome: "cancelled", summary: "cancelled" }),
            { once: true },
          );
        }),
    );
    const { runtime, store } = fixture(preview, dispatcher);
    const { group, slices } = makeGroup(preview, 1);
    const runId = randomUUID();
    const execution = runtime.executeBranchGroup(preview, group, {
      contextSlices: slices,
      runId,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runtime.cancelBranchGroup(runId, group.groupId)).toBe(true);
    expect(runtime.cancelBranchGroup(runId, group.groupId)).toBe(true);
    const result = await execution;
    expect(dispatcher.calls).toHaveLength(1);
    expect(result.fanIn?.status).toBe("cancelled");
    store.close();
  });

  it("cancels one running branch without granting authority to siblings", async () => {
    const preview = makePreview(2);
    const dispatcher = new BranchDispatcher(
      (context) =>
        new Promise((resolve) => {
          if (context.step.id === "step-2")
            return resolve({ outcome: "succeeded", summary: "ok" });
          context.signal.addEventListener(
            "abort",
            () => resolve({ outcome: "cancelled", summary: "cancelled" }),
            { once: true },
          );
        }),
    );
    const { runtime, store } = fixture(preview, dispatcher);
    const { group, slices } = makeGroup(preview, 2);
    const runId = randomUUID();
    const execution = runtime.executeBranchGroup(preview, group, {
      contextSlices: slices,
      runId,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runtime.cancelBranch(runId, group.groupId, "branch-1")).toBe(true);
    const result = await execution;
    expect(result.fanIn?.succeededBranches).toBe(1);
    store.close();
  });

  it("does not persist branch state or slices in private mode", async () => {
    const preview = makePreview(2, "private");
    const { result, store } = await run(preview);
    expect(store.findDurableWorkflow(result.runId!)).toBeUndefined();
    expect(store.findBranchGroup(result.runId!, "group-main")).toBeUndefined();
    store.close();
  });

  it.each([
    [
      "plan digest",
      (group: BranchGroup) => ({ ...group, planDigest: "d".repeat(64) }),
    ],
    [
      "workspace",
      (group: BranchGroup) => ({ ...group, workspaceId: randomUUID() }),
    ],
    [
      "objective",
      (group: BranchGroup) => ({ ...group, objectiveRequestId: randomUUID() }),
    ],
    [
      "group digest",
      (group: BranchGroup) => ({ ...group, digest: "e".repeat(64) }),
    ],
    ["concurrency", (group: BranchGroup) => ({ ...group, maxConcurrency: 0 })],
    ["depth", (group: BranchGroup) => ({ ...group, maxDepth: 2 })],
  ])("fails closed for invalid %s binding", async (_name, change) => {
    const { result, store } = await run(
      makePreview(),
      new BranchDispatcher(),
      (group, slices) => [change(group) as BranchGroup, slices],
    );
    expect(result.status).toBe("blocked");
    store.close();
  });

  it.each([
    [
      "execution target",
      (group: BranchGroup) => ({
        ...group.branches[0]!,
        executionTarget: {
          ...group.branches[0]!.executionTarget,
          capabilityId: "runtime.branch.2",
        },
      }),
    ],
    [
      "required capability",
      (group: BranchGroup) => ({
        ...group.branches[0],
        requiredCapabilities: ["runtime.branch.2"],
      }),
    ],
    [
      "project context",
      (group: BranchGroup) => ({
        ...group.branches[0]!,
        projectContext: { ...group.branches[0]!.projectContext, revision: 9 },
      }),
    ],
    [
      "profile",
      (group: BranchGroup) => ({
        ...group.branches[0],
        agentProfiles: [
          { profileId: "agent.fake", revision: 1, digest: "f".repeat(64) },
        ],
      }),
    ],
    [
      "policy",
      (group: BranchGroup) => ({
        ...group.branches[0]!,
        policyBinding: {
          ...group.branches[0]!.policyBinding,
          rulesetVersion: "stale",
        },
      }),
    ],
  ])("fails closed for branch %s substitution", async (_name, change) => {
    const { result, store } = await run(
      makePreview(),
      new BranchDispatcher(),
      (group, slices) => {
        const branches = [change(group), ...group.branches.slice(1)];
        const unsigned = { ...group, branches };
        const payload = { ...unsigned };
        Reflect.deleteProperty(payload, "digest");
        return [
          {
            ...unsigned,
            digest: sha256(canonicalizeJson(payload)),
          } as BranchGroup,
          slices,
        ];
      },
    );
    expect(result.status).toBe("blocked");
    store.close();
  });

  it.each([
    [
      "slice digest",
      (slices: ContextSliceManifest[]) => [
        { ...slices[0], digest: "f".repeat(64) },
        ...slices.slice(1),
      ],
    ],
    [
      "cross branch",
      (slices: ContextSliceManifest[]) => [
        { ...slices[0], branchId: "branch-2" },
        ...slices.slice(1),
      ],
    ],
    [
      "cross objective",
      (slices: ContextSliceManifest[]) => [
        { ...slices[0], objectiveRequestId: randomUUID() },
        ...slices.slice(1),
      ],
    ],
    [
      "cross workspace",
      (slices: ContextSliceManifest[]) => [
        { ...slices[0], workspaceId: randomUUID() },
        ...slices.slice(1),
      ],
    ],
  ])("fails closed for %s context-slice tampering", async (_name, change) => {
    const { result, store } = await run(
      makePreview(),
      new BranchDispatcher(),
      (group, slices) => [group, change(slices) as ContextSliceManifest[]],
    );
    expect(result.status).toBe("blocked");
    store.close();
  });

  it("rejects nested fan-out at the schema boundary", async () => {
    const { result, store } = await run(
      makePreview(),
      new BranchDispatcher(),
      (group, slices) => [
        {
          ...group,
          branches: group.branches.map((branch) => ({ ...branch, depth: 2 })),
        } as unknown as BranchGroup,
        slices,
      ],
    );
    expect(result.status).toBe("blocked");
    store.close();
  });

  it("rejects unsafe side-effectful branches even if declared pure", async () => {
    const preview = makePreview();
    const changed = preview.plan.steps.map((step, index) =>
      index === 0
        ? {
            ...step,
            action: {
              ...step.action,
              kinds: ["execute"] as ActionRequest["kinds"],
              effectClass: "pure" as const,
            },
          }
        : step,
    );
    const unsafe = { ...preview, plan: { ...preview.plan, steps: changed } };
    const { result, store } = await run(unsafe);
    expect(result.status).toBe("blocked");
    store.close();
  });

  it("preserves monotonic branch and group budget counters", async () => {
    const { result, store } = await run();
    const group = store.findBranchGroup(result.runId!, "group-main")!;
    const branches = store.listBranchExecutions(result.runId!, "group-main");
    expect(group.outputBytesObserved).toBeGreaterThan(0);
    expect(branches.every((branch) => branch.outputBytesObserved > 0)).toBe(
      true,
    );
    store.close();
  });

  it("rejects aggregate branch budget oversubscription before dispatch", async () => {
    const { result, dispatcher, store } = await run(
      makePreview(),
      new BranchDispatcher(),
      (group, slices) => {
        const branches = group.branches.map((branch) => ({
          ...branch,
          budget: { ...branch.budget, maxOutputBytes: 20_000 },
        }));
        const unsigned = {
          ...group,
          branches,
          budget: { ...group.budget, maxOutputBytes: 30_000 },
        };
        const payload = { ...unsigned };
        Reflect.deleteProperty(payload, "digest");
        return [
          { ...unsigned, digest: sha256(canonicalizeJson(payload)) },
          slices,
        ];
      },
    );
    expect(result.status).toBe("blocked");
    expect(dispatcher.calls).toHaveLength(0);
    store.close();
  });
});
