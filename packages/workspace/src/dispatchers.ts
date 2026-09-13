import { createHash } from "node:crypto";

import {
  executionDescriptorSchema,
  type ExecutionDescriptor,
  type PlannedStep,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type {
  DispatchContext,
  DispatchResult,
  StepDispatcher,
} from "@trivergence/runtime";
import type { z } from "zod";

import {
  createWorkspaceCapabilities,
  workspaceCapabilityIds,
} from "./capabilities.js";
import { GitOperationError } from "./git-read-client.js";
import type { GitReadClient } from "./git-read-client.js";
import {
  workspaceGitDiffInputSchema,
  workspaceGitStatusInputSchema,
  workspaceReadInputSchema,
  workspaceSearchInputSchema,
} from "./schemas.js";
import type { WorkspaceService } from "./workspace-service.js";

const emptyEnvironmentDigest = createHash("sha256")
  .update(canonicalizeJson({}))
  .digest("hex");

const outputDigest = (output: unknown) =>
  createHash("sha256").update(canonicalizeJson(output)).digest("hex");

const capabilityById = (id: string) => {
  const capability = createWorkspaceCapabilities(true).find(
    (candidate) => candidate.id === id,
  );
  if (!capability) throw new Error(`Unknown workspace capability: ${id}`);
  return capability;
};

const parseStepInput = <T extends z.ZodType>(
  step: PlannedStep,
  workspace: WorkspaceService,
  capabilityId: string,
  schema: T,
): z.infer<T> => {
  const capability = capabilityById(capabilityId);
  if (
    step.capabilityId !== capabilityId ||
    step.subsystem !== "workspace" ||
    step.action.workspaceId !== workspace.root.id ||
    step.action.tool !== capability.action.tool ||
    step.action.toolVersion !== capability.action.toolVersion
  ) {
    throw new Error("Planned step does not match the workspace dispatcher");
  }
  return schema.parse(step.action.input ?? {});
};

const internalDescriptor = (
  step: PlannedStep,
  targets: readonly string[],
): ExecutionDescriptor =>
  executionDescriptorSchema.parse({
    version: "1",
    kind: "internal",
    capabilityId: step.capabilityId,
    capabilityVersion: "1.0.0",
    subsystem: "workspace",
    summary: step.action.summary,
    argv: [],
    environmentNames: [],
    environmentDigest: emptyEnvironmentDigest,
    networkDestinations: [],
    targets,
  });

abstract class WorkspaceDispatcher implements StepDispatcher {
  readonly subsystem = "workspace" as const;
  abstract readonly capabilityId: string;

  constructor(protected readonly workspace: WorkspaceService) {}

  abstract describe(step: PlannedStep): ExecutionDescriptor;
  abstract dispatch(context: DispatchContext): Promise<DispatchResult>;

  protected succeeded(summary: string, output: unknown): DispatchResult {
    return {
      outcome: "succeeded",
      summary,
      output,
      outputDigest: outputDigest(output),
    };
  }
}

export class WorkspaceReadDispatcher extends WorkspaceDispatcher {
  readonly capabilityId = workspaceCapabilityIds.read;

  describe(step: PlannedStep): ExecutionDescriptor {
    const input = parseStepInput(
      step,
      this.workspace,
      this.capabilityId,
      workspaceReadInputSchema,
    );
    const target = this.workspace.root.resolveExisting(input.path, "file");
    return internalDescriptor(step, [target]);
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    if (context.signal.aborted) {
      return { outcome: "cancelled", summary: "Workspace read cancelled" };
    }
    const input = parseStepInput(
      context.step,
      this.workspace,
      this.capabilityId,
      workspaceReadInputSchema,
    );
    const output = this.workspace.readText(input.path);
    return this.succeeded(
      `Read ${output.path} (${output.bytes} bytes)`,
      output,
    );
  }
}

export class WorkspaceSearchDispatcher extends WorkspaceDispatcher {
  readonly capabilityId = workspaceCapabilityIds.search;

  describe(step: PlannedStep): ExecutionDescriptor {
    parseStepInput(
      step,
      this.workspace,
      this.capabilityId,
      workspaceSearchInputSchema,
    );
    this.workspace.root.assertIdentity();
    return internalDescriptor(step, [this.workspace.root.path]);
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    if (context.signal.aborted) {
      return { outcome: "cancelled", summary: "Workspace search cancelled" };
    }
    const input = parseStepInput(
      context.step,
      this.workspace,
      this.capabilityId,
      workspaceSearchInputSchema,
    );
    try {
      const output = await this.workspace.searchLiteral(
        input.query,
        context.signal,
      );
      return this.succeeded(
        `Found ${output.matches.length} matches in ${output.filesScanned} files`,
        output,
      );
    } catch (error) {
      if (context.signal.aborted) {
        return { outcome: "cancelled", summary: "Workspace search cancelled" };
      }
      throw error;
    }
  }
}

abstract class GitDispatcher implements StepDispatcher {
  readonly subsystem = "workspace" as const;
  abstract readonly capabilityId: string;

  constructor(
    protected readonly workspace: WorkspaceService,
    protected readonly git: GitReadClient,
  ) {}

  abstract describe(step: PlannedStep): ExecutionDescriptor;
  abstract dispatch(context: DispatchContext): Promise<DispatchResult>;

  protected descriptor(
    step: PlannedStep,
    spec: ReturnType<GitReadClient["statusSpec"]>,
    targets: readonly string[],
  ): ExecutionDescriptor {
    return executionDescriptorSchema.parse({
      version: "1",
      kind: "process",
      capabilityId: step.capabilityId,
      capabilityVersion: "1.0.0",
      subsystem: "workspace",
      summary: step.action.summary,
      executable: spec.executable,
      argv: spec.argv,
      cwd: spec.cwd,
      environmentNames: this.git.environmentNames(),
      environmentDigest: this.git.environmentDigest(),
      networkDestinations: [],
      targets,
    });
  }

  protected failed(error: unknown): DispatchResult {
    if (error instanceof GitOperationError) {
      return {
        outcome: error.process.outcome,
        summary: error.message,
        treeTerminationConfirmed: error.process.treeTerminationConfirmed,
      };
    }
    return {
      outcome: "failed",
      summary: error instanceof Error ? error.message : "Git operation failed",
    };
  }
}

export class WorkspaceGitStatusDispatcher extends GitDispatcher {
  readonly capabilityId = workspaceCapabilityIds.gitStatus;

  describe(step: PlannedStep): ExecutionDescriptor {
    parseStepInput(
      step,
      this.workspace,
      this.capabilityId,
      workspaceGitStatusInputSchema,
    );
    this.workspace.root.assertLocalGitDirectory();
    return this.descriptor(step, this.git.statusSpec(), [
      this.workspace.root.path,
    ]);
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    try {
      parseStepInput(
        context.step,
        this.workspace,
        this.capabilityId,
        workspaceGitStatusInputSchema,
      );
      const result = await this.git.status(context.signal);
      return {
        outcome: "succeeded",
        summary: `Git status returned ${result.output.entries.length} entries`,
        output: result.output,
        outputDigest: outputDigest(result.output),
        treeTerminationConfirmed: result.process.treeTerminationConfirmed,
      };
    } catch (error) {
      return this.failed(error);
    }
  }
}

export class WorkspaceGitDiffDispatcher extends GitDispatcher {
  readonly capabilityId = workspaceCapabilityIds.gitDiff;

  describe(step: PlannedStep): ExecutionDescriptor {
    const input = parseStepInput(
      step,
      this.workspace,
      this.capabilityId,
      workspaceGitDiffInputSchema,
    );
    const spec = this.git.diffSpec(input);
    const targets = input.paths.map((path) =>
      this.workspace.root.resolveExisting(path, "file"),
    );
    return this.descriptor(step, spec, targets);
  }

  async dispatch(context: DispatchContext): Promise<DispatchResult> {
    try {
      const input = parseStepInput(
        context.step,
        this.workspace,
        this.capabilityId,
        workspaceGitDiffInputSchema,
      );
      const result = await this.git.diff(input, context.signal);
      return {
        outcome: "succeeded",
        summary: `Git diff returned ${result.output.diff.length} characters`,
        output: result.output,
        outputDigest: outputDigest(result.output),
        treeTerminationConfirmed: result.process.treeTerminationConfirmed,
      };
    } catch (error) {
      return this.failed(error);
    }
  }
}

export const createWorkspaceDispatchers = (
  workspace: WorkspaceService,
  git?: GitReadClient,
): StepDispatcher[] => [
  new WorkspaceReadDispatcher(workspace),
  new WorkspaceSearchDispatcher(workspace),
  ...(git
    ? [
        new WorkspaceGitStatusDispatcher(workspace, git),
        new WorkspaceGitDiffDispatcher(workspace, git),
      ]
    : []),
];
