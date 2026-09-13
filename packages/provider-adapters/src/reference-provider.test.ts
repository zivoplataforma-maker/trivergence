import { randomUUID } from "node:crypto";

import { providerExecutionResultSchema } from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import {
  ProviderAdapterContractError,
  ReferenceProviderAdapter,
  ReferenceProviderTransport,
} from "./index.js";

const input = (overrides: Record<string, unknown> = {}) => ({
  prompt: "Explain the local reference contract",
  context: ["context one", "context two"],
  maxInputBytes: 4_096,
  maxOutputBytes: 4_096,
  maxChunks: 128,
  timeoutMs: 2_000,
  maxCostMicrounits: 0,
  scenario: "normal",
  ...overrides,
});

describe("ReferenceProviderAdapter", () => {
  it("prepares a local-only context preview without raw prompt or context", () => {
    const adapter = new ReferenceProviderAdapter();
    const prepared = adapter.prepare(randomUUID(), input());
    const serialized = JSON.stringify(prepared.preview);

    expect(prepared.preview).toMatchObject({
      providerId: "reference",
      transport: "in_memory_stream",
      context: {
        destination: "local://reference-provider",
        networkRequired: false,
      },
    });
    expect(serialized).not.toContain("Explain the local reference contract");
    expect(serialized).not.toContain("context one");
  });

  it("streams ordered events and returns bounded provenance", async () => {
    const adapter = new ReferenceProviderAdapter();
    const prepared = adapter.prepare(randomUUID(), input());
    const events: string[] = [];
    const result = await adapter.execute(prepared, {
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event.type),
    });

    expect(providerExecutionResultSchema.parse(result).outcome).toBe(
      "succeeded",
    );
    expect(events[0]).toBe("started");
    expect(events).toContain("delta");
    expect(events).toContain("usage");
    expect(events.at(-1)).toBe("completed");
    expect(result.provenance).toMatchObject({
      localOnly: true,
      transport: "in_memory_stream",
      recoveredFromCheckpoint: false,
    });
    expect(result.usage.costMicrounits).toBe(0);
  });

  it("rejects an input before approval when its byte budget is exceeded", () => {
    const adapter = new ReferenceProviderAdapter();

    expect(() =>
      adapter.prepare(randomUUID(), input({ maxInputBytes: 4 })),
    ).toThrow(ProviderAdapterContractError);
  });

  it("fails closed when output or chunk budgets are exceeded", async () => {
    const adapter = new ReferenceProviderAdapter();
    const outputLimited = adapter.prepare(
      randomUUID(),
      input({ maxOutputBytes: 8 }),
    );
    const chunkLimited = adapter.prepare(randomUUID(), input({ maxChunks: 1 }));

    const outputResult = await adapter.execute(outputLimited, {
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    const chunkResult = await adapter.execute(chunkLimited, {
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(outputResult.error?.code).toBe("output_budget_exceeded");
    expect(chunkResult.error?.code).toBe("chunk_budget_exceeded");
    expect(chunkResult.usage.chunks).toBe(1);
    expect(chunkResult.usage.outputBytes).toBeGreaterThan(0);
    expect(chunkResult.finalCheckpoint?.nextChunkIndex).toBe(1);
  });

  it("maps a caller abort and an internal timeout separately", async () => {
    const adapter = new ReferenceProviderAdapter({
      transport: new ReferenceProviderTransport(4, 1, 30),
    });
    const cancelledRequest = adapter.prepare(
      randomUUID(),
      input({ scenario: "slow" }),
    );
    const timedRequest = adapter.prepare(
      randomUUID(),
      input({ scenario: "slow", timeoutMs: 10 }),
    );
    const controller = new AbortController();
    const cancellation = adapter.execute(cancelledRequest, {
      signal: controller.signal,
      onEvent: () => undefined,
    });
    setTimeout(() => controller.abort(), 5);

    expect((await cancellation).outcome).toBe("cancelled");
    expect(
      (
        await adapter.execute(timedRequest, {
          signal: new AbortController().signal,
          onEvent: () => undefined,
        })
      ).outcome,
    ).toBe("timed_out");
  });

  it("returns a typed non-retryable transport error", async () => {
    const adapter = new ReferenceProviderAdapter();
    const prepared = adapter.prepare(
      randomUUID(),
      input({ scenario: "error" }),
    );
    const result = await adapter.execute(prepared, {
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(result).toMatchObject({
      outcome: "failed",
      error: { code: "transport_error", retryable: false },
    });
  });

  it("recovers once from a validated checkpoint", async () => {
    const adapter = new ReferenceProviderAdapter();
    const prepared = adapter.prepare(
      randomUUID(),
      input({ scenario: "recoverable_error" }),
    );
    const result = await adapter.execute(prepared, {
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(result.outcome).toBe("succeeded");
    expect(result.provenance.recoveredFromCheckpoint).toBe(true);
    expect(result.response).toContain("Reference response:");
  });

  it("preserves usage and checkpoint when the bounded recovery also fails", async () => {
    class FailingRecoveryTransport extends ReferenceProviderTransport {
      override async *stream(
        request: Parameters<ReferenceProviderTransport["stream"]>[0],
        signal: AbortSignal,
        startChunkIndex = 0,
        recovering = false,
      ): AsyncIterable<{ index: number; text: string }> {
        for await (const chunk of super.stream(
          request,
          signal,
          startChunkIndex,
          recovering,
        )) {
          yield chunk;
          if (recovering) {
            throw new Error("second transport failure");
          }
        }
      }
    }

    const adapter = new ReferenceProviderAdapter({
      transport: new FailingRecoveryTransport(),
    });
    const prepared = adapter.prepare(
      randomUUID(),
      input({ scenario: "recoverable_error" }),
    );
    const result = await adapter.execute(prepared, {
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    expect(result.outcome).toBe("failed");
    expect(result.provenance.recoveredFromCheckpoint).toBe(true);
    expect(result.usage.chunks).toBe(2);
    expect(result.finalCheckpoint?.nextChunkIndex).toBe(2);
  });

  it("refuses a tampered recovery checkpoint", async () => {
    const adapter = new ReferenceProviderAdapter();
    const prepared = adapter.prepare(randomUUID(), input());
    const result = await adapter.execute(prepared, {
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });
    const checkpoint = result.finalCheckpoint!;

    await expect(
      adapter.recover(
        prepared,
        { ...checkpoint, checkpointDigest: "f".repeat(64) },
        {
          signal: new AbortController().signal,
          onEvent: () => undefined,
        },
      ),
    ).rejects.toThrow(ProviderAdapterContractError);
  });
});
