import type {
  ProviderAdapterError,
  ProviderExecutionPreview,
  ProviderExecutionResult,
  ProviderRecoveryCheckpoint,
  ProviderRequestInput,
  ProviderStreamEvent,
  ProviderTransport,
} from "@trivergence/contracts";

export interface PreparedProviderRequest {
  readonly requestId: string;
  readonly input: ProviderRequestInput;
  readonly preview: ProviderExecutionPreview;
}

export interface ProviderAdapterExecutionOptions {
  readonly signal: AbortSignal;
  readonly onEvent: (event: ProviderStreamEvent) => void;
}

export interface ProviderAdapterManifest {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly adapterBuildDigest: string;
  readonly providerId: string;
  readonly transport: ProviderTransport;
  readonly localOnly: boolean;
  readonly recoveryPolicy: "none" | "single_checkpoint_retry";
}

export interface ProviderAdapter {
  readonly manifest: ProviderAdapterManifest;
  prepare(requestId: string, input: unknown): PreparedProviderRequest;
  execute(
    request: PreparedProviderRequest,
    options: ProviderAdapterExecutionOptions,
  ): Promise<ProviderExecutionResult>;
  recover(
    request: PreparedProviderRequest,
    checkpoint: ProviderRecoveryCheckpoint,
    options: ProviderAdapterExecutionOptions,
  ): Promise<ProviderExecutionResult>;
}

export class ProviderAdapterContractError extends Error {
  constructor(readonly detail: ProviderAdapterError) {
    super(detail.message);
    this.name = "ProviderAdapterContractError";
  }
}
