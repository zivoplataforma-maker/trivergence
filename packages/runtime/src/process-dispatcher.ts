import { createHash } from "node:crypto";

import {
  executionDescriptorSchema,
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

  constructor(options: ProcessStepDispatcherOptions) {
    this.capabilityId = options.capabilityId;
    this.subsystem = options.subsystem;
    this.#capabilityVersion = options.capabilityVersion;
    this.#supervisor = options.supervisor;
    this.#resolveSpec = options.resolveSpec;
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
    const result = await this.#supervisor.run(
      this.#resolveSpec(context.step),
      context.signal,
    );
    const combinedOutput = Buffer.from(
      `${result.stdout}\u0000${result.stderr}`,
    );
    return {
      outcome: result.outcome,
      summary: result.outputTruncated
        ? `Process ${result.outcome}; output truncated`
        : `Process ${result.outcome}`,
      outputDigest: sha256(combinedOutput),
      treeTerminationConfirmed: result.treeTerminationConfirmed,
    };
  }
}
