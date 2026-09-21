import {
  capabilityIdSchema,
  providerExecutionPreviewSchema,
  providerExecutionResultSchema,
  providerIdSchema,
  providerRecoveryCapabilitiesSchema,
  providerStreamEventSchema,
  type ProviderExecutionResult,
  type ProviderRecoveryCheckpoint,
} from "@trivergence/contracts";

import type {
  PreparedProviderRequest,
  ProviderAdapter,
  ProviderAdapterExecutionOptions,
  ProviderAdapterManifest,
} from "./provider-adapter.js";

export interface AdapterHostRegistration {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly adapter: ProviderAdapter;
}

interface ValidatedRegistration extends AdapterHostRegistration {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
}

export class AdapterHost {
  readonly #registrations = new Map<string, ValidatedRegistration>();

  constructor(registrations: readonly AdapterHostRegistration[]) {
    for (const registration of registrations) {
      const capabilityId = capabilityIdSchema.parse(registration.capabilityId);
      const capabilityVersion = registration.capabilityVersion.trim();
      if (capabilityVersion.length < 1 || capabilityVersion.length > 40) {
        throw new Error("Adapter capability version is invalid");
      }
      providerIdSchema.parse(registration.adapter.manifest.providerId);
      const recoveryCapabilities = providerRecoveryCapabilitiesSchema.parse(
        registration.adapter.manifest.recoveryCapabilities,
      );
      if (
        recoveryCapabilities.includes("exact_recovery") &&
        !recoveryCapabilities.some((capability) =>
          [
            "local_checkpoint",
            "stream_reconnect",
            "operation_query",
            "operation_resume",
            "idempotent_retry",
          ].includes(capability),
        )
      ) {
        throw new Error(
          "Exact recovery requires an identity or continuation primitive",
        );
      }
      if (recoveryCapabilities.length > 0 && !registration.adapter.recover) {
        throw new Error(
          "Declared recovery capabilities require a recover implementation",
        );
      }
      if (this.#registrations.has(capabilityId)) {
        throw new Error(
          `Duplicate hosted provider capability: ${capabilityId}`,
        );
      }
      this.#registrations.set(capabilityId, {
        ...registration,
        capabilityId,
        capabilityVersion,
      });
    }
    if (this.#registrations.size === 0) {
      throw new Error("AdapterHost requires at least one provider capability");
    }
  }

  capabilityIds(): string[] {
    return [...this.#registrations.keys()].sort();
  }

  capabilityVersion(capabilityId: string): string {
    return this.#registration(capabilityId).capabilityVersion;
  }

  manifestFor(capabilityId: string): ProviderAdapterManifest {
    return this.#registration(capabilityId).adapter.manifest;
  }

  prepare(
    capabilityId: string,
    requestId: string,
    input: unknown,
  ): PreparedProviderRequest {
    const registration = this.#registration(capabilityId);
    const prepared = registration.adapter.prepare(requestId, input);
    const preview = providerExecutionPreviewSchema.parse(prepared.preview);
    const manifest = registration.adapter.manifest;
    if (
      prepared.requestId !== requestId ||
      preview.adapterId !== manifest.adapterId ||
      preview.adapterVersion !== manifest.adapterVersion ||
      preview.adapterBuildDigest !== manifest.adapterBuildDigest ||
      preview.providerId !== manifest.providerId ||
      preview.transport !== manifest.transport ||
      JSON.stringify([...preview.recoveryCapabilities].sort()) !==
        JSON.stringify([...manifest.recoveryCapabilities].sort()) ||
      (manifest.localOnly && preview.context.networkRequired)
    ) {
      throw new Error("Provider adapter preview does not match its manifest");
    }
    return prepared;
  }

  async execute(
    capabilityId: string,
    request: PreparedProviderRequest,
    options: ProviderAdapterExecutionOptions,
  ): Promise<ProviderExecutionResult> {
    const registration = this.#registration(capabilityId);
    const result = await registration.adapter.execute(request, {
      ...options,
      onEvent: (event) => {
        const parsed = providerStreamEventSchema.parse(event);
        if (parsed.requestId !== request.requestId) {
          throw new Error("Provider stream event belongs to another request");
        }
        options.onEvent(parsed);
      },
    });
    return this.#validateResult(registration, request, result);
  }

  async recover(
    capabilityId: string,
    request: PreparedProviderRequest,
    checkpoint: ProviderRecoveryCheckpoint,
    options: ProviderAdapterExecutionOptions,
  ): Promise<ProviderExecutionResult> {
    const registration = this.#registration(capabilityId);
    if (
      request.preview.recoveryCapabilities.length === 0 ||
      checkpoint.requestDigest !== request.preview.requestDigest
    ) {
      throw new Error("Provider checkpoint is not valid for this request");
    }
    if (!registration.adapter.recover) {
      throw new Error(
        "Provider does not implement declared recovery capabilities",
      );
    }
    const result = await registration.adapter.recover(request, checkpoint, {
      ...options,
      onEvent: (event) => {
        const parsed = providerStreamEventSchema.parse(event);
        if (parsed.requestId !== request.requestId) {
          throw new Error("Provider stream event belongs to another request");
        }
        options.onEvent(parsed);
      },
    });
    return this.#validateResult(registration, request, result);
  }

  #validateResult(
    registration: ValidatedRegistration,
    request: PreparedProviderRequest,
    value: ProviderExecutionResult,
  ): ProviderExecutionResult {
    const result = providerExecutionResultSchema.parse(value);
    const manifest = registration.adapter.manifest;
    const provenance = result.provenance;
    if (
      result.requestId !== request.requestId ||
      provenance.adapterId !== manifest.adapterId ||
      provenance.adapterVersion !== manifest.adapterVersion ||
      provenance.adapterBuildDigest !== manifest.adapterBuildDigest ||
      provenance.providerId !== manifest.providerId ||
      provenance.transport !== manifest.transport ||
      provenance.localOnly !== manifest.localOnly ||
      provenance.requestDigest !== request.preview.requestDigest ||
      provenance.contextDigest !== request.preview.contextDigest
    ) {
      throw new Error("Provider result provenance does not match its request");
    }
    if (!result.remoteState) {
      throw new Error("Provider result omitted remote execution state");
    }
    if (
      (result.outcome === "succeeded" && result.remoteState !== "succeeded") ||
      (result.outcome === "failed" && result.remoteState !== "failed") ||
      (result.outcome === "cancelled" && result.remoteState !== "cancelled") ||
      (result.outcome === "timed_out" &&
        !["failed", "cancelled"].includes(result.remoteState)) ||
      (result.outcome === "remote_state_unknown" &&
        result.remoteState !== "remote_state_unknown")
    ) {
      throw new Error("Provider outcome contradicts remote execution state");
    }
    return result;
  }

  #registration(capabilityId: string): ValidatedRegistration {
    const parsed = capabilityIdSchema.parse(capabilityId);
    const registration = this.#registrations.get(parsed);
    if (!registration) {
      throw new Error(`Provider capability is not hosted: ${parsed}`);
    }
    return registration;
  }
}
