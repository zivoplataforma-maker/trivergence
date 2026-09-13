import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ProcessSupervisor, type ProcessSpec } from "./index.js";

const systemRoot = process.env.SystemRoot;
const environment = systemRoot ? { SystemRoot: systemRoot } : {};
const supervisor = new ProcessSupervisor({
  allowedExecutables: [process.execPath],
  allowedWorkingDirectories: [process.cwd()],
  allowedEnvironmentNames: Object.keys(environment),
  ...(systemRoot ? { systemRoot } : {}),
});

const spec = (
  script: string,
  overrides: Partial<ProcessSpec> = {},
): ProcessSpec => ({
  executable: process.execPath,
  argv: ["-e", script],
  cwd: process.cwd(),
  environment,
  timeoutMs: 10_000,
  gracePeriodMs: 100,
  maxOutputBytes: 4_096,
  ...overrides,
});

const processExists = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("ProcessSupervisor", () => {
  it("executes without a shell and captures bounded output", async () => {
    const result = await supervisor.run(
      spec("process.stdout.write('runtime-ok')"),
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      outcome: "succeeded",
      stdout: "runtime-ok",
      outputTruncated: false,
    });
  });

  it("rejects executable, cwd and environment outside their allowlists", () => {
    expect(() =>
      supervisor.validate(spec("", { executable: "relative.exe" })),
    ).toThrow(/executable/u);
    expect(() => supervisor.validate(spec("", { cwd: "relative" }))).toThrow(
      /cwd/u,
    );
    expect(() =>
      supervisor.validate(spec("", { environment: { SECRET_TOKEN: "value" } })),
    ).toThrow(/environment/u);
  });

  it("truncates combined stdout and stderr at one shared limit", async () => {
    const result = await supervisor.run(
      spec(
        "process.stdout.write('12345678'); process.stderr.write('abcdefgh')",
        { maxOutputBytes: 10 },
      ),
      new AbortController().signal,
    );

    expect(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    ).toBe(10);
    expect(result.outputTruncated).toBe(true);
  });

  it.runIf(process.platform === "win32")(
    "times out and terminates the Windows parent and descendant tree",
    async () => {
      const parentScript = `
        const { spawn } = require('node:child_process');
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
          env: process.env,
          stdio: 'ignore'
        });
        process.stdout.write(String(child.pid));
        setInterval(() => {}, 1000);
      `;
      const result = await supervisor.run(
        spec(parentScript, { timeoutMs: 250 }),
        new AbortController().signal,
      );
      const descendantPid = Number.parseInt(result.stdout, 10);

      expect(result).toMatchObject({
        outcome: "timed_out",
        treeTerminationConfirmed: true,
      });
      expect(Number.isInteger(descendantPid)).toBe(true);
      expect(processExists(descendantPid)).toBe(false);
    },
    20_000,
  );

  it("returns cancelled when aborted", async () => {
    const controller = new AbortController();
    const completion = supervisor.run(
      spec("setInterval(() => {}, 1000)"),
      controller.signal,
    );
    controller.abort();

    const result = await completion;
    expect(result.outcome).toBe("cancelled");
    expect(
      createHash("sha256").update(result.stdout).digest("hex"),
    ).toHaveLength(64);
  }, 15_000);
});
