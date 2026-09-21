import { createHash } from "node:crypto";

import {
  capabilityDescriptorSchema,
  providerAdapterErrorSchema,
  providerBudgetSchema,
  providerContextPreviewSchema,
  providerExecutionPreviewSchema,
  providerExecutionResultSchema,
  providerRecoveryCheckpointSchema,
  providerRequestInputSchema,
  providerStreamEventSchema,
  type CapabilityDescriptor,
  type ProviderAdapterError,
  type ProviderExecutionResult,
  type ProviderRecoveryCheckpoint,
  type ProviderStreamEvent,
  type ProviderUsage,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";

import {
  ProviderAdapterContractError,
  type PreparedProviderRequest,
  type ProviderAdapter,
  type ProviderAdapterExecutionOptions,
  type ProviderAdapterManifest,
} from "./provider-adapter.js";

const ADAPTER_ID = "trivergence.reference-provider";
const ADAPTER_VERSION = "1";
const CAPABILITY_ID = "provider.reference.prompt.structured";
const DESTINATION = "local://reference-provider";
const ADAPTER_BUILD_DIGEST = createHash("sha256")
  .update("trivergence.reference-provider@1", "utf8")
  .digest("hex");

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const utf8Bytes = (value: string) => Buffer.byteLength(value, "utf8");
const estimatedTokens = (bytes: number) => Math.ceil(bytes / 4);

const abortableDelay = (milliseconds: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

class ReferenceTransportError extends Error {
  constructor(readonly retryable: boolean) {
    super("Reference transport failure");
  }
}

interface ReferenceTransportChunk {
  readonly index: number;
  readonly text: string;
}

export class ReferenceProviderTransport {
  readonly kind = "in_memory_stream" as const;

  constructor(
    private readonly chunkSize = 12,
    private readonly normalDelayMs = 1,
    private readonly slowDelayMs = 40,
  ) {}

  responseFor(request: PreparedProviderRequest): string {
    return `Reference response: ${request.input.prompt} [context:${request.input.context.length}]`;
  }

  chunksFor(request: PreparedProviderRequest): readonly string[] {
    const response = this.responseFor(request);
    const chunks: string[] = [];
    for (let index = 0; index < response.length; index += this.chunkSize) {
      chunks.push(response.slice(index, index + this.chunkSize));
    }
    return chunks;
  }

  async *stream(
    request: PreparedProviderRequest,
    signal: AbortSignal,
    startChunkIndex = 0,
    recovering = false,
  ): AsyncIterable<ReferenceTransportChunk> {
    const chunks = this.chunksFor(request);
    for (let index = startChunkIndex; index < chunks.length; index += 1) {
      await abortableDelay(
        request.input.scenario === "slow"
          ? this.slowDelayMs
          : this.normalDelayMs,
        signal,
      );
      if (request.input.scenario === "error" && index === 0) {
        throw new ReferenceTransportError(false);
      }
      if (
        request.input.scenario === "recoverable_error" &&
        !recovering &&
        index === Math.min(1, chunks.length - 1)
      ) {
        throw new ReferenceTransportError(true);
      }
      yield { index, text: chunks[index]! };
    }
  }
}

type RelayedProviderEvent = ProviderStreamEvent extends infer Event
  ? Event extends ProviderStreamEvent
    ? Omit<Event, "requestId" | "sequence" | "observedAt">
    : never
  : never;

interface EventRelay {
  next(event: RelayedProviderEvent): void;
}

interface ConsumeState {
  output: string;
  chunks: number;
  checkpoint?: ProviderRecoveryCheckpoint;
}

export interface ReferenceProviderOptions {
  readonly clock?: () => Date;
  readonly transport?: ReferenceProviderTransport;
}

export class ReferenceProviderAdapter implements ProviderAdapter {
  readonly manifest: ProviderAdapterManifest = {
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    adapterBuildDigest: ADAPTER_BUILD_DIGEST,
    providerId: "reference",
    transport: "in_memory_stream",
    localOnly: true,
    recoveryCapabilities: ["local_checkpoint", "exact_recovery"],
  };

  readonly #clock: () => Date;
  readonly #transport: ReferenceProviderTransport;

  constructor(options: ReferenceProviderOptions = {}) {
    this.#clock = options.clock ?? (() => new Date());
    this.#transport = options.transport ?? new ReferenceProviderTransport();
  }

  prepare(requestId: string, input: unknown): PreparedProviderRequest {
    const parsed = providerRequestInputSchema.parse(input);
    const promptBytes = utf8Bytes(parsed.prompt);
    const items = parsed.context.map((value, index) => ({
      id: `context-${index + 1}`,
      label: `Context item ${index + 1}`,
      bytes: utf8Bytes(value),
      digest: sha256(value),
      dataClass: "user_context" as const,
    }));
    const totalBytes =
      promptBytes + items.reduce((sum, item) => sum + item.bytes, 0);
    if (totalBytes > parsed.maxInputBytes) {
      throw new ProviderAdapterContractError(
        providerAdapterErrorSchema.parse({
          code: "input_budget_exceeded",
          message: `Prepared context requires ${totalBytes} bytes; budget allows ${parsed.maxInputBytes}.`,
          retryable: false,
        }),
      );
    }
    const context = providerContextPreviewSchema.parse({
      destination: DESTINATION,
      networkRequired: false,
      promptBytes,
      promptDigest: sha256(parsed.prompt),
      items,
      totalBytes,
      redactionApplied: false,
    });
    const budget = providerBudgetSchema.parse({
      maxInputBytes: parsed.maxInputBytes,
      maxOutputBytes: parsed.maxOutputBytes,
      maxChunks: parsed.maxChunks,
      timeoutMs: parsed.timeoutMs,
      maxCostMicrounits: parsed.maxCostMicrounits,
    });
    const contextDigest = sha256(canonicalizeJson(context));
    const requestDigest = sha256(
      canonicalizeJson({ requestId, input: parsed, contextDigest }),
    );
    const preview = providerExecutionPreviewSchema.parse({
      schemaVersion: "2",
      adapterId: ADAPTER_ID,
      providerId: "reference",
      operation: "prompt_structured",
      transport: "in_memory_stream",
      context,
      budget,
      adapterVersion: ADAPTER_VERSION,
      adapterBuildDigest: ADAPTER_BUILD_DIGEST,
      requestDigest,
      contextDigest,
      recoveryCapabilities: ["local_checkpoint", "exact_recovery"],
    });
    return { requestId, input: parsed, preview };
  }

  async execute(
    request: PreparedProviderRequest,
    options: ProviderAdapterExecutionOptions,
  ): Promise<ProviderExecutionResult> {
    return await this.#executeFrom(request, options, undefined, false);
  }

  async recover(
    request: PreparedProviderRequest,
    checkpoint: ProviderRecoveryCheckpoint,
    options: ProviderAdapterExecutionOptions,
  ): Promise<ProviderExecutionResult> {
    this.#validateCheckpoint(request, checkpoint);
    return await this.#executeFrom(request, options, checkpoint, true);
  }

  async #executeFrom(
    request: PreparedProviderRequest,
    options: ProviderAdapterExecutionOptions,
    checkpoint: ProviderRecoveryCheckpoint | undefined,
    recovering: boolean,
  ): Promise<ProviderExecutionResult> {
    const startedAt = this.#clock();
    const controller = new AbortController();
    let timeoutTriggered = false;
    const abort = () => controller.abort();
    options.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort();
    }, request.preview.budget.timeoutMs);
    let sequence = 0;
    const relay: EventRelay = {
      next: (event) => {
        options.onEvent(
          providerStreamEventSchema.parse({
            ...event,
            requestId: request.requestId,
            sequence: sequence++,
            observedAt: this.#clock().toISOString(),
          }),
        );
      },
    };
    relay.next({ type: "started" });
    const state: ConsumeState = checkpoint
      ? this.#stateFromCheckpoint(request, checkpoint)
      : { output: "", chunks: 0 };
    let recoveredFromCheckpoint = recovering;

    try {
      try {
        const consumed = await this.#consume(
          request,
          controller.signal,
          relay,
          state,
          recovering,
        );
        return this.#success(
          request,
          startedAt,
          relay,
          consumed,
          recoveredFromCheckpoint,
        );
      } catch (error) {
        if (
          error instanceof ReferenceTransportError &&
          error.retryable &&
          !recovering
        ) {
          const current =
            state.checkpoint ??
            this.#checkpoint(request, state.chunks, utf8Bytes(state.output));
          const recoveredState = this.#stateFromCheckpoint(request, current);
          state.output = recoveredState.output;
          state.chunks = recoveredState.chunks;
          state.checkpoint = current;
          recoveredFromCheckpoint = true;
          const recovered = await this.#consume(
            request,
            controller.signal,
            relay,
            state,
            true,
          );
          return this.#success(request, startedAt, relay, recovered, true);
        }
        throw error;
      }
    } catch (error) {
      const detail = this.#errorFrom(
        error,
        controller.signal,
        timeoutTriggered,
      );
      relay.next({ type: "error", error: detail });
      return this.#result(request, startedAt, {
        outcome:
          detail.code === "cancelled"
            ? "cancelled"
            : detail.code === "timed_out"
              ? "timed_out"
              : "failed",
        usage: this.#usage(request, state.output, state.chunks, startedAt),
        recoveredFromCheckpoint,
        error: detail,
        ...(state.checkpoint ? { finalCheckpoint: state.checkpoint } : {}),
      });
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener("abort", abort);
    }
  }

  async #consume(
    request: PreparedProviderRequest,
    signal: AbortSignal,
    relay: EventRelay,
    initial: ConsumeState,
    recovering: boolean,
  ): Promise<ConsumeState> {
    for await (const chunk of this.#transport.stream(
      request,
      signal,
      initial.chunks,
      recovering,
    )) {
      const nextBytes = utf8Bytes(initial.output + chunk.text);
      if (initial.chunks + 1 > request.preview.budget.maxChunks) {
        throw new ProviderAdapterContractError(
          this.#detail("chunk_budget_exceeded", "Chunk budget exceeded."),
        );
      }
      if (nextBytes > request.preview.budget.maxOutputBytes) {
        throw new ProviderAdapterContractError(
          this.#detail("output_budget_exceeded", "Output budget exceeded."),
        );
      }
      initial.output += chunk.text;
      initial.chunks += 1;
      relay.next({ type: "delta", text: chunk.text });
      initial.checkpoint = this.#checkpoint(
        request,
        chunk.index + 1,
        utf8Bytes(initial.output),
      );
      relay.next({ type: "checkpoint", checkpoint: initial.checkpoint });
    }
    return initial;
  }

  #success(
    request: PreparedProviderRequest,
    startedAt: Date,
    relay: EventRelay,
    state: ConsumeState,
    recoveredFromCheckpoint: boolean,
  ): ProviderExecutionResult {
    const usage = this.#usage(request, state.output, state.chunks, startedAt);
    relay.next({
      type: "usage",
      inputBytes: usage.inputBytes,
      outputBytes: usage.outputBytes,
      chunks: usage.chunks,
      costMicrounits: usage.costMicrounits,
    });
    relay.next({ type: "completed", finishReason: "stop" });
    return this.#result(request, startedAt, {
      outcome: "succeeded",
      response: state.output,
      usage,
      recoveredFromCheckpoint,
      ...(state.checkpoint ? { finalCheckpoint: state.checkpoint } : {}),
    });
  }

  #result(
    request: PreparedProviderRequest,
    startedAt: Date,
    value: {
      outcome: ProviderExecutionResult["outcome"];
      response?: string;
      usage: ProviderUsage;
      recoveredFromCheckpoint: boolean;
      error?: ProviderAdapterError;
      finalCheckpoint?: ProviderRecoveryCheckpoint;
    },
  ): ProviderExecutionResult {
    return providerExecutionResultSchema.parse({
      schemaVersion: "2",
      requestId: request.requestId,
      outcome: value.outcome,
      remoteState:
        value.outcome === "succeeded"
          ? "succeeded"
          : value.outcome === "cancelled" || value.outcome === "timed_out"
            ? "cancelled"
            : "failed",
      ...(value.response !== undefined ? { response: value.response } : {}),
      usage: value.usage,
      provenance: {
        adapterId: ADAPTER_ID,
        adapterVersion: ADAPTER_VERSION,
        adapterBuildDigest: ADAPTER_BUILD_DIGEST,
        providerId: "reference",
        transport: "in_memory_stream",
        requestDigest: request.preview.requestDigest,
        contextDigest: request.preview.contextDigest,
        localOnly: true,
        recoveredFromCheckpoint: value.recoveredFromCheckpoint,
        startedAt: startedAt.toISOString(),
        completedAt: this.#clock().toISOString(),
      },
      ...(value.error ? { error: value.error } : {}),
      ...(value.finalCheckpoint
        ? { finalCheckpoint: value.finalCheckpoint }
        : {}),
    });
  }

  #usage(
    request: PreparedProviderRequest,
    output: string,
    chunks: number,
    startedAt: Date,
  ): ProviderUsage {
    const outputBytes = utf8Bytes(output);
    return {
      inputBytes: request.preview.context.totalBytes,
      outputBytes,
      chunks,
      elapsedMs: Math.max(0, this.#clock().getTime() - startedAt.getTime()),
      estimatedInputTokens: estimatedTokens(request.preview.context.totalBytes),
      estimatedOutputTokens: estimatedTokens(outputBytes),
      costMicrounits: 0,
    };
  }

  #checkpoint(
    request: PreparedProviderRequest,
    nextChunkIndex: number,
    emittedBytes: number,
  ): ProviderRecoveryCheckpoint {
    const recoveryCursor = `chunk:${nextChunkIndex}`;
    return providerRecoveryCheckpointSchema.parse({
      schemaVersion: "1",
      requestDigest: request.preview.requestDigest,
      nextChunkIndex,
      emittedBytes,
      recoveryCursor,
      checkpointDigest: sha256(
        canonicalizeJson({
          requestDigest: request.preview.requestDigest,
          nextChunkIndex,
          emittedBytes,
          recoveryCursor,
        }),
      ),
    });
  }

  #validateCheckpoint(
    request: PreparedProviderRequest,
    checkpoint: ProviderRecoveryCheckpoint,
  ): void {
    const expected = this.#checkpoint(
      request,
      checkpoint.nextChunkIndex,
      checkpoint.emittedBytes,
    );
    if (
      checkpoint.requestDigest !== request.preview.requestDigest ||
      checkpoint.checkpointDigest !== expected.checkpointDigest ||
      checkpoint.recoveryCursor !== expected.recoveryCursor
    ) {
      throw new ProviderAdapterContractError(
        this.#detail("recovery_unavailable", "Recovery checkpoint is invalid."),
      );
    }
  }

  #stateFromCheckpoint(
    request: PreparedProviderRequest,
    checkpoint: ProviderRecoveryCheckpoint,
  ): ConsumeState {
    this.#validateCheckpoint(request, checkpoint);
    const chunks = this.#transport.chunksFor(request);
    const output = chunks.slice(0, checkpoint.nextChunkIndex).join("");
    if (utf8Bytes(output) !== checkpoint.emittedBytes) {
      throw new ProviderAdapterContractError(
        this.#detail(
          "recovery_unavailable",
          "Recovery state no longer matches.",
        ),
      );
    }
    return {
      output,
      chunks: checkpoint.nextChunkIndex,
      checkpoint,
    };
  }

  #errorFrom(
    error: unknown,
    signal: AbortSignal,
    timeoutTriggered: boolean,
  ): ProviderAdapterError {
    if (timeoutTriggered) {
      return this.#detail("timed_out", "Provider budget timeout reached.");
    }
    if (signal.aborted) {
      return this.#detail("cancelled", "Provider execution was cancelled.");
    }
    if (error instanceof ProviderAdapterContractError) return error.detail;
    if (error instanceof ReferenceTransportError) {
      return this.#detail(
        "transport_error",
        "Reference transport failed safely.",
        error.retryable,
      );
    }
    return this.#detail("protocol_error", "Provider protocol failed safely.");
  }

  #detail(
    code: ProviderAdapterError["code"],
    message: string,
    retryable = false,
  ): ProviderAdapterError {
    return providerAdapterErrorSchema.parse({ code, message, retryable });
  }
}

export function createReferenceProviderCapability(): CapabilityDescriptor {
  return capabilityDescriptorSchema.parse({
    id: CAPABILITY_ID,
    version: ADAPTER_VERSION,
    displayName: "Reference Provider local",
    subsystem: "provider",
    status: "available",
    mode: "structured",
    action: {
      tool: "referenceProvider.promptStructured",
      toolVersion: ADAPTER_VERSION,
      kinds: ["execute"],
      risk: "guarded",
      effectClass: "pure",
      summary:
        "Procesar una solicitud estructurada en el proveedor local de referencia",
    },
    dependencies: [],
    routing: {
      objectiveTerms: [
        "reference provider",
        "proveedor local",
        "prompt local",
        "respuesta de referencia",
      ],
      priority: 20,
    },
    provenance: {
      publisher: "@trivergence/provider-adapters",
      observedAt: "2026-08-07T00:00:00.000Z",
      observationDigest: ADAPTER_BUILD_DIGEST,
      attestationDigest: ADAPTER_BUILD_DIGEST,
      reason:
        "Implementación local de referencia; no representa un proveedor externo.",
    },
  });
}

export const referenceProviderCapabilityId = CAPABILITY_ID;
export const referenceProviderAdapterBuildDigest = ADAPTER_BUILD_DIGEST;
