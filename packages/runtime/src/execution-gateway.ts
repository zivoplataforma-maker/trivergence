import {
  executionBackendManifestSchema,
  executionDescriptorSchema,
  executionPreparationSchema,
  executionRequestSchema,
  executionResultSchema,
  type ActionRequest,
  type ExecutionBackendManifest,
  type ExecutionCapability,
  type ExecutionDescriptor,
  type ExecutionPreparation,
  type ExecutionRequest,
  type ExecutionResult,
} from "@trivergence/contracts";
import {
  canonicalizeJson,
  type DigestFunction,
} from "@trivergence/orchestration-engine";

import type {
  ProcessRunResult,
  ProcessSpec,
  ProcessSupervisor,
} from "./process-supervisor.js";

export interface ProcessRunner {
  validate(spec: ProcessSpec): void;
  run(spec: ProcessSpec, signal: AbortSignal): Promise<ProcessRunResult>;
}

export interface ProcessExecutionOperation {
  readonly kind: "process";
  readonly spec: ProcessSpec;
}

export interface ExecutionBackend {
  readonly manifest: ExecutionBackendManifest;
  execute(
    request: ExecutionRequest,
    operation: ProcessExecutionOperation,
    signal: AbortSignal,
  ): Promise<ProcessRunResult>;
}

export interface ExecutionGatewayInput {
  readonly request: ExecutionRequest;
  readonly descriptor: ExecutionDescriptor;
  readonly action: ActionRequest;
  readonly operation: ProcessExecutionOperation;
  readonly signal: AbortSignal;
}

export const createExecutionRequestDigest = (
  request: Omit<ExecutionRequest, "provenance"> & {
    readonly provenance: Pick<ExecutionRequest["provenance"], "source">;
  },
  sha256: DigestFunction,
) => sha256(canonicalizeJson(request));

export const createLocalSupervisedBackendManifest = (input: {
  readonly id: string;
  readonly version: string;
  readonly buildDigest: string;
}): ExecutionBackendManifest =>
  executionBackendManifestSchema.parse({
    schemaVersion: "1",
    id: input.id,
    version: input.version,
    mode: "local_supervised",
    capabilities: [
      "process_execution",
      "filesystem_access",
      "network_access",
      "cancellation",
      "timeout",
    ],
    filesystem: {
      access: "host_process",
      cwdAllowlistEnforced: true,
      childAccessConfined: false,
    },
    network: {
      access: "host_process",
      destinationEnforcement: false,
    },
    process: {
      supervised: true,
      executableAllowlistEnforced: true,
      environmentAllowlistEnforced: true,
    },
    cancellation: {
      requestSupported: true,
      treeTerminationAttempted: true,
      confirmationObservable: true,
    },
    timeout: { supported: true, maxMs: 300_000 },
    persistence: { gatewayState: "ephemeral" },
    isolation: { level: "none", sandboxed: false },
    limits: {
      maxArguments: 128,
      maxArgumentBytes: 8_192,
      maxEnvironmentEntries: 64,
      maxOutputBytes: 1_048_576,
    },
    provenance: {
      implementation: "@trivergence/runtime/LocalSupervisedBackend",
      buildDigest: input.buildDigest,
    },
  });

export class LocalSupervisedBackend implements ExecutionBackend {
  readonly manifest: ExecutionBackendManifest;
  readonly #supervisor: ProcessRunner;

  constructor(
    supervisor: ProcessSupervisor | ProcessRunner,
    manifest: ExecutionBackendManifest,
  ) {
    this.#supervisor = supervisor;
    this.manifest = executionBackendManifestSchema.parse(manifest);
  }

  async execute(
    _request: ExecutionRequest,
    operation: ProcessExecutionOperation,
    signal: AbortSignal,
  ): Promise<ProcessRunResult> {
    this.#supervisor.validate(operation.spec);
    return await this.#supervisor.run(operation.spec, signal);
  }
}

export class ExecutionGateway {
  readonly #backends = new Map<string, ExecutionBackend>();
  readonly #sha256: DigestFunction;

  constructor(backends: readonly ExecutionBackend[], sha256: DigestFunction) {
    this.#sha256 = sha256;
    for (const candidate of backends) {
      const manifest = executionBackendManifestSchema.parse(candidate.manifest);
      if (this.#backends.has(manifest.id)) {
        throw new Error(`Duplicate execution backend: ${manifest.id}`);
      }
      this.#backends.set(manifest.id, candidate);
    }
  }

  manifest(backendId: string): ExecutionBackendManifest | undefined {
    const manifest = this.#backends.get(backendId)?.manifest;
    return manifest ? structuredClone(manifest) : undefined;
  }

  prepare(input: Omit<ExecutionGatewayInput, "signal">): ExecutionPreparation {
    const request = executionRequestSchema.parse(input.request);
    const descriptor = executionDescriptorSchema.parse(input.descriptor);
    const backend = this.#backends.get(request.backend.id);
    if (!backend) {
      throw new Error(`Execution backend not found: ${request.backend.id}`);
    }
    const manifest = executionBackendManifestSchema.parse(backend.manifest);
    if (manifest.version !== request.backend.version) {
      throw new Error("Execution backend version changed");
    }
    this.#validateRequest(
      request,
      descriptor,
      input.action,
      input.operation,
      manifest,
    );
    return executionPreparationSchema.parse({
      schemaVersion: "1",
      requestId: request.id,
      backendId: manifest.id,
      backendVersion: manifest.version,
      lifecycle: "prepared",
      requestDigest: request.provenance.requestDigest,
      descriptorDigest: request.descriptorDigest,
    });
  }

  async execute(input: ExecutionGatewayInput): Promise<ExecutionResult> {
    this.prepare(input);
    const request = executionRequestSchema.parse(input.request);
    const backend = this.#backends.get(request.backend.id);
    if (!backend) throw new Error("Prepared execution backend disappeared");
    const manifest = executionBackendManifestSchema.parse(backend.manifest);
    const raw = await backend.execute(request, input.operation, input.signal);
    if (
      !["succeeded", "failed", "cancelled", "timed_out"].includes(
        raw.outcome,
      ) ||
      typeof raw.stdout !== "string" ||
      typeof raw.stderr !== "string" ||
      typeof raw.outputTruncated !== "boolean" ||
      typeof raw.treeTerminationConfirmed !== "boolean"
    ) {
      throw new Error("Execution backend returned an invalid result");
    }

    return executionResultSchema.parse({
      schemaVersion: "1",
      requestId: request.id,
      backendId: manifest.id,
      backendVersion: manifest.version,
      lifecycle: raw.outcome,
      summary: raw.outputTruncated
        ? `Process ${raw.outcome}; output truncated`
        : `Process ${raw.outcome}`,
      outputDigest: this.#sha256(canonicalizeJson([raw.stdout, raw.stderr])),
      treeTerminationConfirmed: raw.treeTerminationConfirmed,
      appliedLimits: {
        timeoutMs: input.operation.spec.timeoutMs,
        maxOutputBytes: input.operation.spec.maxOutputBytes,
      },
      provenance: {
        requestDigest: request.provenance.requestDigest,
        descriptorDigest: request.descriptorDigest,
        backendBuildDigest: manifest.provenance.buildDigest,
      },
    });
  }

  #validateRequest(
    request: ExecutionRequest,
    descriptor: ExecutionDescriptor,
    action: ActionRequest,
    operation: ProcessExecutionOperation,
    manifest: ExecutionBackendManifest,
  ): void {
    const uniqueCapabilities = new Set(request.requiredCapabilities);
    if (uniqueCapabilities.size !== request.requiredCapabilities.length) {
      throw new Error("Required execution capabilities must be unique");
    }
    for (const capability of uniqueCapabilities) {
      if (!manifest.capabilities.includes(capability)) {
        throw new Error(`Execution backend lacks capability: ${capability}`);
      }
    }
    const requiredCapabilityBindings: ExecutionCapability[] = [
      "process_execution",
      "filesystem_access",
      "timeout",
    ];
    if (request.requirements.cancellationRequired) {
      requiredCapabilityBindings.push("cancellation");
    }
    if (request.requirements.networkRequired) {
      requiredCapabilityBindings.push("network_access");
    }
    for (const capability of requiredCapabilityBindings) {
      if (!uniqueCapabilities.has(capability)) {
        throw new Error(`Execution request omitted capability: ${capability}`);
      }
    }
    if (descriptor.kind !== "process" || operation.kind !== "process") {
      throw new Error(
        "Local supervised execution requires a process descriptor",
      );
    }
    if (descriptor.capabilityId !== request.binding.capabilityId) {
      throw new Error("Execution descriptor does not match the planned action");
    }
    if (
      request.binding.objectiveRequestId !==
        request.projectContext.objectiveRequestId ||
      request.binding.workspaceId !== request.projectContext.workspaceId ||
      (action.workspaceId !== undefined &&
        action.workspaceId !== request.projectContext.workspaceId)
    ) {
      throw new Error("Project Context does not match the execution binding");
    }
    if (request.authorization.policy.decision === "deny") {
      throw new Error("Policy denied execution");
    }
    const policyDigest = this.#sha256(
      canonicalizeJson(request.authorization.policy),
    );
    if (request.authorization.policyDigest !== policyDigest) {
      throw new Error("Policy decision digest mismatch");
    }
    const approval = request.authorization.approval;
    if (request.authorization.policy.decision === "require_approval") {
      if (!approval || !request.authorization.expectedApprovalDigest) {
        throw new Error("A consumed approval is required before execution");
      }
      if (
        approval.actionDigest !==
          request.authorization.expectedApprovalDigest ||
        approval.planDigest !== request.binding.planDigest ||
        approval.rulesetVersion !==
          request.authorization.policy.rulesetVersion ||
        approval.descriptorDigest !== request.descriptorDigest
      ) {
        throw new Error("Approval does not match the execution request");
      }
    } else if (approval || request.authorization.expectedApprovalDigest) {
      throw new Error("Execution request contains an unexpected approval");
    }
    const descriptorDigest = this.#sha256(canonicalizeJson(descriptor));
    if (request.descriptorDigest !== descriptorDigest) {
      throw new Error("Execution descriptor digest mismatch");
    }
    const actionDigest = this.#sha256(canonicalizeJson(action));
    if (request.effectAssessment.actionDigest !== actionDigest) {
      throw new Error("Effect assessment does not match the planned action");
    }
    if (
      !action.effectClass ||
      action.effectClass !== request.effectAssessment.severity
    ) {
      throw new Error(
        "Execution Gateway requires the Planner effect assessment",
      );
    }
    const spec = operation.spec;
    if (
      descriptor.executable !== spec.executable ||
      descriptor.cwd !== spec.cwd ||
      canonicalizeJson(descriptor.argv) !== canonicalizeJson(spec.argv) ||
      descriptor.environmentDigest !==
        this.#sha256(canonicalizeJson(spec.environment)) ||
      canonicalizeJson(descriptor.networkDestinations) !==
        canonicalizeJson(spec.networkDestinations ?? []) ||
      request.requirements.timeoutMs !== spec.timeoutMs ||
      request.requirements.maxOutputBytes !== spec.maxOutputBytes
    ) {
      throw new Error("Process operation does not match its execution request");
    }
    if (
      request.requirements.filesystemAccess === "workspace_confined" &&
      !manifest.filesystem.childAccessConfined
    ) {
      throw new Error(
        "Execution backend cannot guarantee workspace confinement",
      );
    }
    const descriptorRequiresNetwork = descriptor.networkDestinations.length > 0;
    if (descriptorRequiresNetwork !== request.requirements.networkRequired) {
      throw new Error("Network requirements do not match the descriptor");
    }
    if (
      request.requirements.networkRequired &&
      (!request.requirements.networkAuthorized ||
        request.privacyMode === "private")
    ) {
      throw new Error("Network execution is not authorized");
    }
    if (
      request.requirements.timeoutMs !== request.budget.timeoutMs ||
      request.requirements.maxOutputBytes !== request.budget.maxOutputBytes ||
      request.requirements.timeoutMs > manifest.timeout.maxMs ||
      request.requirements.maxOutputBytes > manifest.limits.maxOutputBytes
    ) {
      throw new Error("Execution resource limits are inconsistent");
    }
    const expectedRequestDigest = createExecutionRequestDigest(
      { ...request, provenance: { source: request.provenance.source } },
      this.#sha256,
    );
    if (request.provenance.requestDigest !== expectedRequestDigest) {
      throw new Error("Execution request digest mismatch");
    }
  }
}
