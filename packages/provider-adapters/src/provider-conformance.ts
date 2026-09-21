import { randomUUID } from "node:crypto";

import {
  capabilityDescriptorSchema,
  providerExecutionPreviewSchema,
  providerExecutionResultSchema,
  providerIdSchema,
  providerStreamEventSchema,
  type CapabilityDescriptor,
  type ProviderAdapterErrorCode,
  type ProviderRequestInput,
  type ProviderStreamEvent,
} from "@trivergence/contracts";

import { AdapterHost } from "./adapter-host.js";
import {
  ProviderAdapterContractError,
  type ProviderAdapter,
} from "./provider-adapter.js";

export const providerConformanceCheckIds = [
  "capability_declaration",
  "prepare_context_preview",
  "execute_and_stream",
  "cancellation",
  "recovery",
  "interrupted_recovery",
  "timeout",
  "typed_failure",
  "input_budget",
  "output_budget",
  "provenance",
  "approval_boundary",
  "malformed_response",
  "unavailable_provider",
] as const;

export type ProviderConformanceCheckId =
  (typeof providerConformanceCheckIds)[number];

export interface ProviderConformanceFixtures {
  readonly normal: ProviderRequestInput;
  readonly slow: ProviderRequestInput;
  readonly timeout: ProviderRequestInput;
  readonly typedFailure: ProviderRequestInput;
  readonly recoverable: ProviderRequestInput;
  readonly inputBudgetExceeded: ProviderRequestInput;
  readonly outputBudgetExceeded: ProviderRequestInput;
  readonly sensitiveValues: readonly string[];
  readonly expectedFailureCode: ProviderAdapterErrorCode;
  readonly cancelAfterMs: number;
}

export interface ProviderConformanceSubject {
  readonly capability: CapabilityDescriptor;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly createAdapter: () => ProviderAdapter;
  /** Runtime-owned check: execution must stop before dispatch without approval. */
  readonly verifyApprovalBoundary: () => Promise<void>;
  /** Runtime-owned behavior for adapters that cannot recover the exact operation. */
  readonly verifyInterruptedRecoveryBoundary?: () => Promise<void>;
  readonly fixtures: ProviderConformanceFixtures;
}

export interface ProviderConformanceCheck {
  readonly id: ProviderConformanceCheckId;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ProviderConformanceReport {
  readonly passed: boolean;
  readonly checks: readonly ProviderConformanceCheck[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const execution = async (
  adapter: ProviderAdapter,
  input: ProviderRequestInput,
  options: { readonly abortAfterMs?: number } = {},
) => {
  const host = new AdapterHost([
    {
      capabilityId: "provider.conformance.prompt.structured",
      capabilityVersion: "1",
      adapter,
    },
  ]);
  const prepared = host.prepare(
    "provider.conformance.prompt.structured",
    randomUUID(),
    input,
  );
  const events: ProviderStreamEvent[] = [];
  const controller = new AbortController();
  const timer =
    options.abortAfterMs === undefined
      ? undefined
      : setTimeout(() => controller.abort(), options.abortAfterMs);
  try {
    const result = await host.execute(
      "provider.conformance.prompt.structured",
      prepared,
      {
        signal: controller.signal,
        onEvent: (event) => events.push(providerStreamEventSchema.parse(event)),
      },
    );
    return { host, prepared, result, events };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/**
 * Framework-neutral executable contract. Future provider packages can run the
 * same checks without importing Vitest or changing the Orchestration Engine.
 */
export async function runProviderConformanceSuite(
  subject: ProviderConformanceSubject,
): Promise<ProviderConformanceReport> {
  const checks: ProviderConformanceCheck[] = [];
  const check = async (
    id: ProviderConformanceCheckId,
    action: () => void | Promise<void>,
  ) => {
    try {
      await action();
      checks.push({ id, passed: true, detail: "verified" });
    } catch (error) {
      checks.push({
        id,
        passed: false,
        detail: error instanceof Error ? error.message : "unknown failure",
      });
    }
  };

  await check("capability_declaration", () => {
    const capability = capabilityDescriptorSchema.parse(subject.capability);
    const adapter = subject.createAdapter();
    providerIdSchema.parse(adapter.manifest.providerId);
    assert(capability.id === subject.capabilityId, "Capability ID mismatch");
    assert(
      capability.version === subject.capabilityVersion,
      "Capability version mismatch",
    );
    assert(
      capability.subsystem === "provider",
      "Capability is not provider-owned",
    );
    assert(
      capability.mode === "structured",
      "Provider capability is not structured",
    );
  });

  await check("prepare_context_preview", () => {
    const adapter = subject.createAdapter();
    const prepared = adapter.prepare(randomUUID(), subject.fixtures.normal);
    providerExecutionPreviewSchema.parse(prepared.preview);
    const preview = JSON.stringify(prepared.preview);
    for (const sensitive of subject.fixtures.sensitiveValues) {
      assert(!preview.includes(sensitive), "Context preview exposed raw input");
    }
    assert(
      prepared.preview.providerId === adapter.manifest.providerId,
      "Preview provider identity mismatch",
    );
  });

  let normal: Awaited<ReturnType<typeof execution>> | undefined;
  await check("execute_and_stream", async () => {
    normal = await execution(subject.createAdapter(), subject.fixtures.normal);
    providerExecutionResultSchema.parse(normal.result);
    assert(normal.result.outcome === "succeeded", "Normal execution failed");
    assert(normal.events[0]?.type === "started", "Stream did not start");
    assert(
      normal.events.some((event) => event.type === "delta"),
      "No stream delta",
    );
    assert(
      normal.events.at(-1)?.type === "completed",
      "Stream did not complete",
    );
    normal.events.forEach((event, sequence) =>
      assert(event.sequence === sequence, "Stream sequence is not contiguous"),
    );
  });

  let interrupted: Awaited<ReturnType<typeof execution>> | undefined;
  await check("cancellation", async () => {
    interrupted = await execution(
      subject.createAdapter(),
      subject.fixtures.slow,
      {
        abortAfterMs: subject.fixtures.cancelAfterMs,
      },
    );
    assert(
      interrupted.result.outcome === "cancelled",
      "Abort was not cancelled",
    );
    assert(
      interrupted.result.error?.code === "cancelled",
      "Cancellation was not typed",
    );
  });

  await check("recovery", async () => {
    const capabilities = subject.createAdapter().manifest.recoveryCapabilities;
    if (capabilities.length === 0) {
      assert(
        subject.createAdapter().recover === undefined,
        "Adapter without recovery capabilities exposes recover",
      );
      return;
    }
    const recovered = await execution(
      subject.createAdapter(),
      subject.fixtures.recoverable,
    );
    assert(recovered.result.outcome === "succeeded", "Bounded recovery failed");
    assert(
      recovered.result.provenance.recoveredFromCheckpoint,
      "Bounded recovery provenance missing",
    );
  });

  await check("interrupted_recovery", async () => {
    const capabilities = subject.createAdapter().manifest.recoveryCapabilities;
    if (!capabilities.includes("exact_recovery")) {
      assert(
        subject.verifyInterruptedRecoveryBoundary,
        "Runtime UNKNOWN boundary fixture is required",
      );
      await subject.verifyInterruptedRecoveryBoundary();
      return;
    }
    const cancelledRun = interrupted;
    assert(
      cancelledRun?.result.finalCheckpoint,
      "Interrupted run has no checkpoint",
    );
    const recovered = await cancelledRun.host.recover(
      "provider.conformance.prompt.structured",
      cancelledRun.prepared,
      cancelledRun.result.finalCheckpoint,
      { signal: new AbortController().signal, onEvent: () => undefined },
    );
    assert(recovered.outcome === "succeeded", "Checkpoint recovery failed");
    assert(
      recovered.provenance.recoveredFromCheckpoint,
      "Recovery provenance missing",
    );
  });

  await check("timeout", async () => {
    const timed = await execution(
      subject.createAdapter(),
      subject.fixtures.timeout,
    );
    assert(timed.result.outcome === "timed_out", "Timeout was not enforced");
    assert(timed.result.error?.code === "timed_out", "Timeout was not typed");
  });

  await check("typed_failure", async () => {
    const failed = await execution(
      subject.createAdapter(),
      subject.fixtures.typedFailure,
    );
    assert(failed.result.outcome === "failed", "Failure fixture did not fail");
    assert(
      failed.result.error?.code === subject.fixtures.expectedFailureCode,
      "Failure code mismatch",
    );
  });

  await check("input_budget", () => {
    try {
      subject
        .createAdapter()
        .prepare(randomUUID(), subject.fixtures.inputBudgetExceeded);
    } catch (error) {
      assert(
        error instanceof ProviderAdapterContractError,
        "Input budget failure is untyped",
      );
      assert(
        error.detail.code === "input_budget_exceeded",
        "Wrong input budget code",
      );
      return;
    }
    throw new Error("Input budget was not enforced");
  });

  await check("output_budget", async () => {
    const limited = await execution(
      subject.createAdapter(),
      subject.fixtures.outputBudgetExceeded,
    );
    assert(
      limited.result.outcome === "failed",
      "Output budget did not fail closed",
    );
    assert(
      [
        "output_budget_exceeded",
        "chunk_budget_exceeded",
        "cost_budget_exceeded",
      ].includes(limited.result.error?.code ?? ""),
      "Output budget failure is untyped",
    );
  });

  await check("provenance", () => {
    const successfulRun = normal;
    assert(successfulRun, "Normal execution was unavailable");
    const manifest = subject.createAdapter().manifest;
    assert(
      successfulRun.result.provenance.adapterId === manifest.adapterId,
      "Adapter provenance mismatch",
    );
    assert(
      successfulRun.result.provenance.providerId === manifest.providerId,
      "Provider provenance mismatch",
    );
    assert(
      successfulRun.result.provenance.requestDigest ===
        successfulRun.prepared.preview.requestDigest,
      "Request provenance mismatch",
    );
  });

  await check("approval_boundary", subject.verifyApprovalBoundary);

  await check("malformed_response", async () => {
    const delegate = subject.createAdapter();
    const malformed: ProviderAdapter = {
      manifest: delegate.manifest,
      prepare: delegate.prepare.bind(delegate),
      execute: async (request, options) => ({
        ...(await delegate.execute(request, options)),
        requestId: randomUUID(),
      }),
      ...(delegate.recover ? { recover: delegate.recover.bind(delegate) } : {}),
    };
    try {
      await execution(malformed, subject.fixtures.normal);
    } catch {
      return;
    }
    throw new Error("AdapterHost accepted a malformed response");
  });

  await check("unavailable_provider", () => {
    const host = new AdapterHost([
      {
        capabilityId: subject.capabilityId,
        capabilityVersion: subject.capabilityVersion,
        adapter: subject.createAdapter(),
      },
    ]);
    try {
      host.prepare("provider.unavailable.prompt.structured", randomUUID(), {});
    } catch {
      return;
    }
    throw new Error("AdapterHost accepted an unavailable provider");
  });

  return { passed: checks.every((item) => item.passed), checks };
}
