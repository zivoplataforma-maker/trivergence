import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, join, relative } from "node:path";

import { canonicalizeJson } from "@trivergence/orchestration-engine";
import {
  ProcessSupervisor,
  type ProcessRunResult,
  type ProcessSpec,
} from "@trivergence/runtime";

import {
  gitDiffResultSchema,
  gitStatusResultSchema,
  type GitDiffResult,
  type GitStatusResult,
  type WorkspaceGitDiffInput,
} from "./schemas.js";
import type { WorkspaceRoot } from "./workspace-root.js";

const MAX_OUTPUT_BYTES = 1_048_576;
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalizeJson(value)).digest("hex");

export interface GitOperationResult<T> {
  readonly output: T;
  readonly process: ProcessRunResult;
}

export class GitOperationError extends Error {
  constructor(
    message: string,
    readonly process: ProcessRunResult,
  ) {
    super(message);
    this.name = "GitOperationError";
  }
}

export class GitReadClient {
  readonly executable: string;
  readonly #environment: Readonly<Record<string, string>>;
  readonly #supervisor: ProcessSupervisor;

  constructor(
    readonly workspace: WorkspaceRoot,
    executablePath: string,
  ) {
    const executable = realpathSync.native(executablePath);
    const stats = statSync(executable);
    const allowedNames = process.platform === "win32" ? ["git.exe"] : ["git"];
    if (
      !stats.isFile() ||
      !allowedNames.includes(basename(executable).toLocaleLowerCase())
    ) {
      throw new Error(
        "Git executable must be an absolute official git binary path",
      );
    }
    workspace.assertLocalGitDirectory();
    this.#assertSafeMetadata();
    this.executable = executable;
    this.#environment = {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_PAGER: "cat",
      NO_COLOR: "1",
      LC_ALL: "C",
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    };
    this.#supervisor = new ProcessSupervisor({
      allowedExecutables: [executable],
      allowedWorkingDirectories: [workspace.path],
      allowedEnvironmentNames: Object.keys(this.#environment),
    });
  }

  environmentNames(): string[] {
    return Object.keys(this.#environment).sort();
  }

  environmentDigest(): string {
    return digest(this.#environment);
  }

  statusSpec(): ProcessSpec {
    return this.#spec([
      ...this.#baseArguments(),
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=all",
    ]);
  }

  diffSpec(input: WorkspaceGitDiffInput): ProcessSpec {
    const paths = this.#validatedPaths(input.paths);
    return this.#spec([
      ...this.#baseArguments(),
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--no-color",
      "--no-renames",
      "--ignore-submodules=all",
      "--unified=3",
      ...(input.staged ? ["--cached"] : []),
      "--",
      ...paths,
    ]);
  }

  async status(
    signal: AbortSignal,
  ): Promise<GitOperationResult<GitStatusResult>> {
    this.#assertSafeMetadata();
    const processResult = await this.#supervisor.run(this.statusSpec(), signal);
    if (processResult.outcome !== "succeeded") {
      throw new GitOperationError(
        `Git status ${processResult.outcome}`,
        processResult,
      );
    }
    const completeOutput = processResult.stdout.endsWith("\0");
    const tokens = processResult.stdout.split("\0");
    tokens.pop();
    const entries: GitStatusResult["entries"] = [];
    for (
      let index = 0;
      index < tokens.length && entries.length < 5_000;
      index += 1
    ) {
      const token = tokens[index] ?? "";
      if (token.length < 4 || token[2] !== " ") {
        throw new Error("Git status returned an invalid porcelain record");
      }
      const indexState = token[0] ?? " ";
      const worktreeState = token[1] ?? " ";
      const path = this.workspace.normalizeRelative(token.slice(3));
      const renamed = [indexState, worktreeState].some(
        (value) => value === "R" || value === "C",
      );
      let originalPath: string | undefined;
      if (renamed) {
        const original = tokens[index + 1];
        if (!original) throw new Error("Git rename record is incomplete");
        originalPath = this.workspace.normalizeRelative(original);
        index += 1;
      }
      if (
        this.workspace.isExcluded(path) ||
        (originalPath && this.workspace.isExcluded(originalPath))
      ) {
        continue;
      }
      entries.push({
        path,
        index: indexState,
        worktree: worktreeState,
        ...(originalPath ? { originalPath } : {}),
      });
    }
    return {
      output: gitStatusResultSchema.parse({
        entries,
        truncated:
          processResult.outputTruncated ||
          !completeOutput ||
          entries.length >= 5_000,
      }),
      process: processResult,
    };
  }

  async diff(
    input: WorkspaceGitDiffInput,
    signal: AbortSignal,
  ): Promise<GitOperationResult<GitDiffResult>> {
    this.#assertSafeMetadata();
    const paths = this.#validatedPaths(input.paths);
    const processResult = await this.#supervisor.run(
      this.diffSpec({ ...input, paths }),
      signal,
    );
    if (processResult.outcome !== "succeeded") {
      throw new GitOperationError(
        `Git diff ${processResult.outcome}`,
        processResult,
      );
    }
    return {
      output: gitDiffResultSchema.parse({
        paths,
        staged: input.staged,
        diff: processResult.stdout,
        truncated: processResult.outputTruncated,
      }),
      process: processResult,
    };
  }

  #validatedPaths(paths: readonly string[]): string[] {
    const normalized = paths.map((path) =>
      this.workspace.normalizeRelative(path),
    );
    if (new Set(normalized).size !== normalized.length) {
      throw new Error("Git diff paths must be unique after normalization");
    }
    for (const path of normalized) {
      if (this.workspace.isExcluded(path)) {
        throw new Error("Git diff cannot target an excluded path");
      }
      this.workspace.resolveExisting(path, "file");
    }
    return normalized;
  }

  #baseArguments(): string[] {
    return [
      "-c",
      `core.worktree=${this.workspace.path}`,
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      "-c",
      "core.pager=cat",
      "-c",
      "color.ui=false",
    ];
  }

  #assertSafeMetadata(): void {
    const gitDirectory = this.workspace.assertLocalGitDirectory();
    for (const relativePath of ["commondir", "objects/info/alternates"]) {
      if (existsSync(join(gitDirectory, ...relativePath.split("/")))) {
        throw new Error(
          "Git repositories with external metadata are not supported",
        );
      }
    }
    const configPath = join(gitDirectory, "config");
    const linkStats = lstatSync(configPath);
    const realConfig = realpathSync.native(configPath);
    const configDifference = relative(gitDirectory, realConfig);
    if (
      linkStats.isSymbolicLink() ||
      configDifference.startsWith("..") ||
      statSync(realConfig).size > 64 * 1_024
    ) {
      throw new Error("Git local configuration is outside the safe boundary");
    }
    const config = new TextDecoder("utf-8", { fatal: true }).decode(
      readFileSync(realConfig),
    );
    if (
      /^\s*\[(?:include|includeif|filter|diff|merge|credential)\b/imu.test(
        config,
      ) ||
      /^\s*(?:fsmonitor|hookspath|worktree)\s*=/imu.test(config)
    ) {
      throw new Error("Git local configuration declares external helpers");
    }
  }

  #spec(argv: readonly string[]): ProcessSpec {
    return {
      executable: this.executable,
      argv,
      cwd: this.workspace.path,
      environment: this.#environment,
      timeoutMs: 10_000,
      gracePeriodMs: 500,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    };
  }
}
