import { createHash } from "node:crypto";

import {
  executionDescriptorSchema,
  type ExecutionDescriptor,
  type PlannedStep,
  type ProviderExecutionResult,
  type ProviderRecoveryCheckpoint,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type {
  DispatchContext,
  DispatchResult,
  StepDispatcher,
} from "@trivergence/runtime";

import { AdapterHost } from "./adapter-host.js";
import type { ProviderAdapter } from "./provider-adapter.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export interface ProviderStepDispatcherOptions {
  readonly host?: AdapterHost;
  readonly capabilityId?: string;
  readonly capabilityVersion?: string;
  readonly adapter?: ProviderAdapter;
}

export class ProviderStepDispatcher implements StepDispatcher {
  readonly subsystem = "provider" as const;
  readonly capabilityId: string;
  readonly capabilityIds: readonly string[];
  readonly #host: AdapterHost;

  constructor(options: ProviderStepDispatcherOptions) {
    if (options.host) {
      this.#host = options.host;
    } else if (
      options.capabilityId &&
      options.capabilityVersion &&
      options.adapter
    ) {
      this.#host = new AdapterHost([
        {
          capabilityId: options.capabilityId,
          capabilityVersion: options.capabilityVersion,
          adapter: options.adapter,
        },
      ]);
    } else {
      throw new Error("ProviderStepDispatcher requires one AdapterHost");
    }
    this.capabilityIds = this.#host.capabilityIds();
    this.capabilityId = this.capabilityIds[0]!;
  }

  describe(step: PlannedStep): ExecutionDescriptor {
    const prepared = this.#host.prepare(
      step.capabilityId,
      step.action.id,
      step.action.input,
    );
    return executionDescriptorSchema.parse({
      version: "1",
      kind: "provider",
      capabilityId: step.capabilityId,
      capabilityVersion: this.#host.capabilityVersion(step.capabilityId),
      subsystem: this.subsystem,
      summary: step.action.summary,
      argv: [],
      environmentNames: [],
      environmentDigest: sha256(canonicalizeJson({})),
      networkDestinations: prepared.preview.context.networkRequired
        ? [prepared.preview.context.destination]
        : [],
      targets: prepared.preview.context.items.map((item) => item.label),
      providerRequest: prepared.preview,
    });
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const descriptor = this.describe(context.step);
    if (canonicalizeJson(descriptor) !== canonicalizeJson(context.descriptor)) {
      throw new Error("Provider descriptor changed before execution");
    }
    const prepared = this.#host.prepare(
      context.step.capabilityId,
      context.step.action.id,
      context.step.action.input,
    );
    const result = await this.#host.execute(
      context.step.capabilityId,
      prepared,
      {
        signal: context.signal,
        onEvent: context.emit,
      },
    );
    return this.#dispatchResult(result);
  }

  async recover(
    context: DispatchContext,
    checkpoint: ProviderRecoveryCheckpoint,
  ): Promise<DispatchResult> {
    const descriptor = this.describe(context.step);
    if (canonicalizeJson(descriptor) !== canonicalizeJson(context.descriptor)) {
      throw new Error("Provider descriptor changed before recovery");
    }
    const prepared = this.#host.prepare(
      context.step.capabilityId,
      context.step.action.id,
      context.step.action.input,
    );
    const result = await this.#host.recover(
      context.step.capabilityId,
      prepared,
      checkpoint,
      {
        signal: context.signal,
        onEvent: context.emit,
      },
    );
    return this.#dispatchResult(result);
  }

  #dispatchResult(result: ProviderExecutionResult): DispatchResult {
    return {
      outcome: result.outcome,
      summary: result.error?.message ?? `Provider ${result.outcome}`,
      output: result,
      outputDigest: sha256(canonicalizeJson(result)),
      treeTerminationConfirmed: true,
    };
  }
}
