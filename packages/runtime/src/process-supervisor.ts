import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export interface ProcessSpec {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly gracePeriodMs: number;
  readonly maxOutputBytes: number;
  readonly networkDestinations?: readonly string[];
}

export interface ProcessRunResult {
  readonly outcome: "succeeded" | "failed" | "cancelled" | "timed_out";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputTruncated: boolean;
  readonly treeTerminationConfirmed: boolean;
}

export interface ProcessSupervisorOptions {
  readonly allowedExecutables: readonly string[];
  readonly allowedWorkingDirectories: readonly string[];
  readonly allowedEnvironmentNames: readonly string[];
  readonly platform?: NodeJS.Platform;
  readonly systemRoot?: string;
}

const normalizedPath = (path: string, platform: NodeJS.Platform) => {
  const value = realpathSync.native(resolve(path));
  return platform === "win32" ? value.toLocaleLowerCase() : value;
};

const normalizedEnvironmentName = (name: string, platform: NodeJS.Platform) =>
  platform === "win32" ? name.toLocaleLowerCase() : name;

const isWithin = (
  candidate: string,
  root: string,
  platform: NodeJS.Platform,
) => {
  const child = normalizedPath(candidate, platform);
  const parent = normalizedPath(root, platform);
  const difference = relative(parent, child);
  return (
    difference === "" ||
    (!difference.startsWith("..") && !isAbsolute(difference))
  );
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));

export class ProcessSupervisor {
  readonly #allowedExecutables: ReadonlySet<string>;
  readonly #allowedWorkingDirectories: readonly string[];
  readonly #allowedEnvironmentNames: ReadonlySet<string>;
  readonly #platform: NodeJS.Platform;
  readonly #systemRoot: string | undefined;

  constructor(options: ProcessSupervisorOptions) {
    this.#platform = options.platform ?? process.platform;
    this.#allowedExecutables = new Set(
      options.allowedExecutables.map((path) =>
        normalizedPath(path, this.#platform),
      ),
    );
    this.#allowedWorkingDirectories = options.allowedWorkingDirectories.map(
      (path) => normalizedPath(path, this.#platform),
    );
    this.#allowedEnvironmentNames = new Set(
      options.allowedEnvironmentNames.map((name) =>
        normalizedEnvironmentName(name, this.#platform),
      ),
    );
    this.#systemRoot = options.systemRoot ?? process.env.SystemRoot;
  }

  validate(spec: ProcessSpec): void {
    if (
      !isAbsolute(spec.executable) ||
      !this.#allowedExecutables.has(
        normalizedPath(spec.executable, this.#platform),
      )
    ) {
      throw new Error("Process executable is not allowlisted");
    }
    if (
      !isAbsolute(spec.cwd) ||
      !this.#allowedWorkingDirectories.some((root) =>
        isWithin(spec.cwd, root, this.#platform),
      )
    ) {
      throw new Error("Process cwd is outside the allowed roots");
    }
    if (
      spec.argv.length > 128 ||
      spec.argv.some((value) => value.length > 8_192 || value.includes("\0"))
    ) {
      throw new Error("Process argv exceeds its limits");
    }
    const environmentEntries = Object.entries(spec.environment);
    const normalizedEnvironmentNames = environmentEntries.map(([name]) =>
      normalizedEnvironmentName(name, this.#platform),
    );
    if (
      environmentEntries.length > 64 ||
      new Set(normalizedEnvironmentNames).size !== environmentEntries.length ||
      environmentEntries.some(
        ([name, value]) =>
          !this.#allowedEnvironmentNames.has(
            normalizedEnvironmentName(name, this.#platform),
          ) ||
          value.length > 8_192 ||
          value.includes("\0"),
      )
    ) {
      throw new Error("Process environment is outside the allowlist");
    }
    if (
      !Number.isInteger(spec.timeoutMs) ||
      spec.timeoutMs < 10 ||
      spec.timeoutMs > 5 * 60_000 ||
      !Number.isInteger(spec.gracePeriodMs) ||
      spec.gracePeriodMs < 0 ||
      spec.gracePeriodMs > 10_000 ||
      !Number.isInteger(spec.maxOutputBytes) ||
      spec.maxOutputBytes < 1 ||
      spec.maxOutputBytes > 1024 * 1024
    ) {
      throw new Error("Process limits are invalid");
    }
  }

  async run(spec: ProcessSpec, signal: AbortSignal): Promise<ProcessRunResult> {
    this.validate(spec);
    if (signal.aborted) {
      return {
        outcome: "cancelled",
        exitCode: null,
        stdout: "",
        stderr: "",
        outputTruncated: false,
        treeTerminationConfirmed: true,
      };
    }

    return await new Promise<ProcessRunResult>((resolveRun, rejectRun) => {
      const child = spawn(spec.executable, [...spec.argv], {
        cwd: spec.cwd,
        detached: this.#platform !== "win32",
        env: { ...spec.environment },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let capturedBytes = 0;
      let outputTruncated = false;
      let terminationReason: "cancelled" | "timed_out" | undefined;
      let settled = false;

      const capture = (
        current: Buffer<ArrayBufferLike>,
        chunk: Buffer<ArrayBufferLike>,
      ) => {
        const remaining = spec.maxOutputBytes - capturedBytes;
        if (remaining <= 0) {
          outputTruncated = true;
          return current;
        }
        const accepted = chunk.subarray(0, remaining);
        capturedBytes += accepted.length;
        if (chunk.length > accepted.length) outputTruncated = true;
        return Buffer.concat([current, accepted]);
      };
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = capture(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = capture(stderr, chunk);
      });

      const finish = (
        exitCode: number | null,
        treeTerminationConfirmed: boolean,
      ) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        const outcome = terminationReason
          ? terminationReason
          : exitCode === 0
            ? "succeeded"
            : "failed";
        resolveRun({
          outcome,
          exitCode,
          stdout: stdout.toString("utf8"),
          stderr: stderr.toString("utf8"),
          outputTruncated,
          treeTerminationConfirmed,
        });
      };
      const requestTermination = (reason: "cancelled" | "timed_out") => {
        if (terminationReason || child.pid === undefined) return;
        terminationReason = reason;
        void this.#terminateTree(child.pid, spec.gracePeriodMs).then(
          (confirmed) => finish(null, confirmed),
          rejectRun,
        );
      };
      const abort = () => requestTermination("cancelled");
      signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(
        () => requestTermination("timed_out"),
        spec.timeoutMs,
      );

      child.once("error", (error) => {
        if (settled) return;
        if (terminationReason) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        rejectRun(error);
      });
      child.once("close", (exitCode) => {
        if (settled) return;
        if (!terminationReason) finish(exitCode, true);
      });
    });
  }

  async #terminateTree(pid: number, gracePeriodMs: number): Promise<boolean> {
    if (this.#platform === "win32") {
      const graceful = await this.#taskkill(pid, false);
      await delay(gracePeriodMs);
      const forced = await this.#taskkill(pid, true);
      if (graceful || forced) return true;
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    }

    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      return true;
    }
    await delay(gracePeriodMs);
    try {
      process.kill(-pid, 0);
      process.kill(-pid, "SIGKILL");
    } catch {
      return true;
    }
    return true;
  }

  async #taskkill(pid: number, force: boolean): Promise<boolean> {
    if (!this.#systemRoot || !isAbsolute(this.#systemRoot)) return false;
    const executable = join(this.#systemRoot, "System32", "taskkill.exe");
    if (!existsSync(executable)) return false;
    const argv = ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])];
    return await new Promise<boolean>((resolveTaskkill) => {
      let settled = false;
      const taskkill = spawn(executable, argv, {
        env: { SystemRoot: this.#systemRoot },
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveTaskkill(result);
      };
      const timeout = setTimeout(() => {
        taskkill.kill();
        finish(false);
      }, 2_000);
      taskkill.once("error", () => finish(false));
      taskkill.once("close", (code) => finish(code === 0));
    });
  }
}
