import { createHash, randomUUID } from "node:crypto";

import {
  executionDescriptorSchema,
  executionRequestSchema,
  sha256DigestSchema,
  type ExecutionDescriptor,
  type PlannedStep,
  type SubsystemKind,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";

import type {
  DispatchContext,
  DispatchResult,
  StepDispatcher,
} from "./dispatcher-registry.js";
import {
  createExecutionRequestDigest,
  createLocalSupervisedBackendManifest,
  ExecutionGateway,
  LocalSupervisedBackend,
} from "./execution-gateway.js";
import type { ProcessSpec, ProcessSupervisor } from "./process-supervisor.js";

export interface ProcessStepDispatcherOptions {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly subsystem: SubsystemKind;
  readonly supervisor: ProcessSupervisor;
  readonly resolveSpec: (step: PlannedStep) => ProcessSpec;
}

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export class ProcessStepDispatcher implements StepDispatcher {
  readonly capabilityId: string;
  readonly subsystem: SubsystemKind;
  readonly #capabilityVersion: string;
  readonly #supervisor: ProcessSupervisor;
  readonly #resolveSpec: ProcessStepDispatcherOptions["resolveSpec"];
  readonly #gateway: ExecutionGateway;
  readonly #backendId = "trivergence.local-supervised";
  readonly #backendVersion = "1";

  constructor(options: ProcessStepDispatcherOptions) {
    this.capabilityId = options.capabilityId;
    this.subsystem = options.subsystem;
    this.#capabilityVersion = options.capabilityVersion;
    this.#supervisor = options.supervisor;
    this.#resolveSpec = options.resolveSpec;
    const manifest = createLocalSupervisedBackendManifest({
      id: this.#backendId,
      version: this.#backendVersion,
      buildDigest: sha256("@trivergence/runtime/local-supervised-backend-v1"),
    });
    this.#gateway = new ExecutionGateway(
      [new LocalSupervisedBackend(options.supervisor, manifest)],
      sha256,
    );
  }

  describe(step: PlannedStep): ExecutionDescriptor {
    const spec = this.#resolveSpec(step);
    this.#supervisor.validate(spec);
    const environmentNames = Object.keys(spec.environment).sort();
    return executionDescriptorSchema.parse({
      version: "1",
      kind: "process",
      capabilityId: this.capabilityId,
      capabilityVersion: this.#capabilityVersion,
      subsystem: this.subsystem,
      summary: step.action.summary,
      executable: spec.executable,
      argv: [...spec.argv],
      cwd: spec.cwd,
      environmentNames,
      environmentDigest: sha256DigestSchema.parse(
        sha256(canonicalizeJson(spec.environment)),
      ),
      networkDestinations: [...(spec.networkDestinations ?? [])],
      targets: [...(step.action.targets ?? [])],
    });
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    const currentDescriptor = this.describe(context.step);
    if (
      canonicalizeJson(currentDescriptor) !==
      canonicalizeJson(context.descriptor)
    ) {
      throw new Error("Process descriptor changed before spawn");
    }
    const spec = this.#resolveSpec(context.step);
    const effectClass = context.step.action.effectClass;
    if (!effectClass) {
      throw new Error("Process execution requires a Planner effect assessment");
    }
    const descriptorDigest = sha256(canonicalizeJson(context.descriptor));
    const actionDigest = sha256(canonicalizeJson(context.step.action));
    const policyDigest = sha256(canonicalizeJson(context.policy));
    const requestWithoutDigest = {
      schemaVersion: "1" as const,
      id: randomUUID(),
      backend: { id: this.#backendId, version: this.#backendVersion },
      requiredCapabilities: [
        "process_execution" as const,
        "filesystem_access" as const,
        "cancellation" as const,
        "timeout" as const,
        ...(context.descriptor.networkDestinations.length > 0
          ? (["network_access"] as const)
          : []),
      ],
      binding: {
        objectiveRequestId: context.request.id,
        workspaceId: context.projectContext.workspaceId,
        runId: context.runId,
        planId: context.planId,
        stepId: context.step.id,
        capabilityId: context.step.capabilityId,
        planDigest: context.planDigest,
        registrySnapshotId: context.registrySnapshotId,
      },
      projectContext: context.projectContext,
      descriptorDigest,
      effectAssessment: {
        version: "planned-action-v1" as const,
        severity: effectClass,
        actionDigest,
      },
      authorization: {
        policy: context.policy,
        policyDigest,
        ...(context.expectedApprovalDigest
          ? { expectedApprovalDigest: context.expectedApprovalDigest }
          : {}),
        ...(context.approval
          ? {
              approval: {
                id: context.approval.id,
                status: "consumed" as const,
                actionDigest: context.approval.actionDigest,
                planDigest: context.approval.planDigest,
                rulesetVersion: context.approval.rulesetVersion,
                descriptorDigest: sha256(
                  canonicalizeJson(context.approval.descriptor),
                ),
              },
            }
          : {}),
      },
      requirements: {
        processExecution: true as const,
        filesystemAccess: "host_process" as const,
        networkRequired: context.descriptor.networkDestinations.length > 0,
        networkAuthorized:
          context.descriptor.networkDestinations.length === 0 ||
          context.policy.decision !== "deny",
        cancellationRequired: true,
        timeoutMs: spec.timeoutMs,
        maxOutputBytes: spec.maxOutputBytes,
      },
      privacyMode: context.request.privacyMode ?? "standard",
      budget: {
        timeoutMs: spec.timeoutMs,
        maxOutputBytes: spec.maxOutputBytes,
        consumptionAuthority: "runtime" as const,
      },
      provenance: { source: "runtime" as const },
    };
    const executionRequest = executionRequestSchema.parse({
      ...requestWithoutDigest,
      provenance: {
        source: "runtime",
        requestDigest: createExecutionRequestDigest(
          requestWithoutDigest,
          sha256,
        ),
      },
    });
    const result = await this.#gateway.execute({
      request: executionRequest,
      descriptor: context.descriptor,
      action: context.step.action,
      operation: { kind: "process", spec },
      signal: context.signal,
    });
    return {
      outcome: result.lifecycle,
      summary: result.summary,
      outputDigest: result.outputDigest,
      treeTerminationConfirmed: result.treeTerminationConfirmed,
    };
  }
}
