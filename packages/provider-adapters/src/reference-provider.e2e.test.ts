import { createHash, randomUUID } from "node:crypto";

import {
  providerExecutionResultSchema,
  type ProviderRequestInput,
  type RuntimeStreamEvent,
} from "@trivergence/contracts";
import {
  CapabilityRegistry,
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import { RuntimeEngine } from "@trivergence/runtime";
import { describe, expect, it } from "vitest";

import {
  createReferenceProviderCapability,
  ProviderStepDispatcher,
  ReferenceProviderAdapter,
  ReferenceProviderTransport,
  referenceProviderCapabilityId,
} from "./index.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const requestInput = (
  overrides: Partial<ProviderRequestInput> = {},
): ProviderRequestInput => ({
  prompt: "Exercise the provider-independent execution path",
  context: ["local reference context"],
  maxInputBytes: 4_096,
  maxOutputBytes: 4_096,
  maxChunks: 128,
  timeoutMs: 2_000,
  maxCostMicrounits: 0,
  scenario: "normal",
  ...overrides,
});

const fixture = (input: ProviderRequestInput) => {
  const capability = createReferenceProviderCapability();
  const registry = new CapabilityRegistry("reference-e2e-1", [capability]);
  const engine = new OrchestrationEngine(registry, randomUUID, sha256);
  const preview = engine.preview({
    id: randomUUID(),
    goal: "Validate the local provider adapter contract",
    profile: "assistant",
    requestedCapabilities: [referenceProviderCapabilityId],
    capabilityInputs: { [referenceProviderCapabilityId]: input },
  });
  const store = PersistenceStore.open(":memory:");
  store.persistPreview(preview);
  const adapter = new ReferenceProviderAdapter({
    transport: new ReferenceProviderTransport(6, 1, 30),
  });
  const createRuntime = () =>
    new RuntimeEngine({
      persistence: store,
      dispatchers: [
        new ProviderStepDispatcher({
          capabilityId: referenceProviderCapabilityId,
          capabilityVersion: capability.version,
          adapter,
        }),
      ],
      revalidate: (candidate) => engine.revalidate(candidate),
      evaluatePolicy,
      sha256,
    });
  const runtime = createRuntime();
  const approve = () => {
    const approval = runtime.requestApproval(preview, "step-1");
    runtime.decideApproval(approval.id, "grant", "reference-e2e-user");
    return approval;
  };
  return { adapter, approve, createRuntime, engine, preview, runtime, store };
};

describe("Reference Provider orchestration E2E", () => {
  it("plans without Orchestration Engine changes, previews context, approves, streams and records evidence", async () => {
    const { approve, preview, runtime, store } = fixture(requestInput());
    expect(preview.evaluation.status).toBe("approval_required");
    expect(await runtime.execute(preview)).toMatchObject({
      status: "approval_required",
    });

    const approval = approve();
    expect(approval.descriptor).toMatchObject({
      kind: "provider",
      networkDestinations: [],
      providerRequest: {
        providerId: "reference",
        transport: "in_memory_stream",
        context: {
          destination: "local://reference-provider",
          networkRequired: false,
        },
      },
    });
    expect(JSON.stringify(approval.descriptor)).not.toContain(
      "Exercise the provider-independent execution path",
    );

    const events: RuntimeStreamEvent[] = [];
    const result = await runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
      onEvent: (event) => events.push(event),
    });
    const output = providerExecutionResultSchema.parse(
      result.outputs?.["step-1"],
    );

    expect(result).toMatchObject({ status: "completed", evidenceCount: 1 });
    expect(output.outcome).toBe("succeeded");
    expect(output.provenance.localOnly).toBe(true);
    expect(events.some((event) => event.event.type === "delta")).toBe(true);
    expect(events.at(-1)?.event.type).toBe("completed");
    expect(store.listEvidence(result.runId!)).toHaveLength(1);
    expect(store.findApproval(approval.id)?.status).toBe("consumed");
    store.close();
  });

  it("cancels and resumes a streaming run from a persisted checkpoint", async () => {
    const { approve, createRuntime, preview, runtime, store } = fixture(
      requestInput({ scenario: "slow" }),
    );
    const approval = approve();
    const runId = randomUUID();
    const events: RuntimeStreamEvent[] = [];
    const execution = runtime.execute(preview, {
      runId,
      approvalIds: { "step-1": approval.id },
      onEvent: (event) => events.push(event),
    });
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(runtime.cancel(runId)).toBe(true);
    const cancelled = await execution;
    expect(cancelled).toMatchObject({
      status: "cancelled",
      evidenceCount: 1,
    });
    const cancelledOutput = providerExecutionResultSchema.parse(
      cancelled.outputs?.["step-1"],
    );
    expect(cancelledOutput.usage.chunks).toBeGreaterThan(0);
    expect(cancelledOutput.finalCheckpoint).toBeDefined();
    const checkpointId = [...events]
      .reverse()
      .find(
        (event) => event.checkpointRecordId !== undefined,
      )?.checkpointRecordId;
    expect(checkpointId).toBeDefined();
    expect(store.findProviderCheckpoint(checkpointId!)?.status).toBe("active");

    const restartedRuntime = createRuntime();
    const recoveryApproval = restartedRuntime.requestApproval(
      preview,
      "step-1",
    );
    restartedRuntime.decideApproval(
      recoveryApproval.id,
      "grant",
      "reference-recovery-user",
    );
    const recovered = await restartedRuntime.execute(preview, {
      approvalIds: { "step-1": recoveryApproval.id },
      recoveryCheckpointIds: { "step-1": checkpointId! },
    });
    expect(recovered.status).toBe("completed");
    expect(store.findProviderCheckpoint(checkpointId!)?.status).toBe(
      "consumed",
    );
    store.close();
  });

  it("recovers a retryable stream without replanning", async () => {
    const { approve, preview, runtime, store } = fixture(
      requestInput({ scenario: "recoverable_error" }),
    );
    const approval = approve();
    const result = await runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
    });
    const output = providerExecutionResultSchema.parse(
      result.outputs?.["step-1"],
    );

    expect(result.status).toBe("completed");
    expect(output.provenance.recoveredFromCheckpoint).toBe(true);
    store.close();
  });

  it("records a typed provider failure as terminal evidence", async () => {
    const { approve, preview, runtime, store } = fixture(
      requestInput({ scenario: "error" }),
    );
    const approval = approve();
    const result = await runtime.execute(preview, {
      approvalIds: { "step-1": approval.id },
    });
    const output = providerExecutionResultSchema.parse(
      result.outputs?.["step-1"],
    );

    expect(result).toMatchObject({ status: "failed", evidenceCount: 1 });
    expect(output.error?.code).toBe("transport_error");
    expect(store.listEvidence(result.runId!)[0]?.outcome).toBe("failed");
    store.close();
  });
});
