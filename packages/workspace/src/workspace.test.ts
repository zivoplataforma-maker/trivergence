import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CapabilityRegistry,
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import { RuntimeEngine } from "@trivergence/runtime";
import { afterEach, describe, expect, it } from "vitest";

import {
  createWorkspaceCapabilities,
  createWorkspaceDispatchers,
  GitReadClient,
  WorkspaceRoot,
  WorkspaceService,
  workspaceCapabilityIds,
  workspaceFileResultSchema,
} from "./index.js";

const temporaryDirectories: string[] = [];
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const fixture = () => {
  const base = mkdtempSync(join(tmpdir(), "trivergence-workspace-"));
  temporaryDirectories.push(base);
  const rootPath = join(base, "workspace");
  const outsidePath = join(base, "outside");
  mkdirSync(rootPath);
  mkdirSync(outsidePath);
  const root = new WorkspaceRoot({ id: randomUUID(), path: rootPath });
  return { base, rootPath, outsidePath, root };
};

const findGitExecutable = (): string | undefined => {
  const executableName = process.platform === "win32" ? "git.exe" : "git";
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, executableName);
    if (existsSync(candidate)) return candidate;
  }
  if (process.platform === "win32") {
    const common = "C:\\Program Files\\Git\\cmd\\git.exe";
    if (existsSync(common)) return common;
  }
  return undefined;
};

const runGit = (git: string, cwd: string, argv: readonly string[]) => {
  const result = spawnSync(git, [...argv], {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`Git fixture failed: ${result.stderr}`);
  }
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("WorkspaceRoot and WorkspaceService", () => {
  it("reads bounded UTF-8 content and rejects traversal, secrets and junction escape", () => {
    const { rootPath, outsidePath, root } = fixture();
    writeFileSync(join(rootPath, "safe.txt"), "contenido seguro", "utf8");
    writeFileSync(join(rootPath, ".env"), "TOKEN=secret", "utf8");
    writeFileSync(join(outsidePath, "outside.txt"), "outside", "utf8");
    symlinkSync(
      outsidePath,
      join(rootPath, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const service = new WorkspaceService(root);

    expect(service.readText("safe.txt")).toMatchObject({
      path: "safe.txt",
      content: "contenido seguro",
      bytes: 16,
    });
    expect(() => service.readText("../outside/outside.txt")).toThrow(
      /relative path|parent segments/u,
    );
    expect(() => service.readText(".env")).toThrow(/excluded/u);
    expect(() => service.readText("escape/outside.txt")).toThrow(
      /outside the selected root/u,
    );
    expect(() => service.readText("C:\\Windows\\win.ini")).toThrow(
      /relative path/u,
    );
    expect(() => service.readText("safe.txt:stream")).toThrow(/stream/u);
  });

  it("searches literally while enforcing mandatory, user and .gitignore exclusions", async () => {
    const { rootPath } = fixture();
    writeFileSync(join(rootPath, "visible.txt"), "needle visible", "utf8");
    writeFileSync(join(rootPath, "ignored.txt"), "needle ignored", "utf8");
    writeFileSync(join(rootPath, ".env.local"), "needle secret", "utf8");
    mkdirSync(join(rootPath, "private"));
    writeFileSync(
      join(rootPath, "private", "note.txt"),
      "needle private",
      "utf8",
    );
    writeFileSync(join(rootPath, ".gitignore"), "ignored.txt\n", "utf8");
    const root = new WorkspaceRoot({
      id: randomUUID(),
      path: rootPath,
      userExclusions: ["private"],
    });

    const result = await new WorkspaceService(root).searchLiteral("needle");

    expect(result.matches.map((match) => match.path)).toEqual(["visible.txt"]);
    expect(result.truncated).toBe(false);
  });

  it("yields during search so cancellation can be observed", async () => {
    const { rootPath, root } = fixture();
    for (let index = 0; index < 300; index += 1) {
      writeFileSync(
        join(rootPath, `file-${index}.txt`),
        `searchable content ${index}`,
        "utf8",
      );
    }
    const controller = new AbortController();
    const completion = new WorkspaceService(root).searchLiteral(
      "not-present",
      controller.signal,
    );
    setTimeout(() => controller.abort(), 0);

    await expect(completion).rejects.toThrow(/cancelled/u);
  });
});

describe("GitReadClient", () => {
  it("returns structured status and an explicit-path diff without excluded files", async () => {
    const gitExecutable = findGitExecutable();
    expect(
      gitExecutable,
      "Git is required for the M4 acceptance fixture",
    ).toBeTruthy();
    const { rootPath, root } = fixture();
    runGit(gitExecutable!, rootPath, ["init", "--quiet"]);
    writeFileSync(join(rootPath, "app.txt"), "before\n", "utf8");
    writeFileSync(join(rootPath, ".env"), "SECRET=before\n", "utf8");
    runGit(gitExecutable!, rootPath, ["add", "app.txt", ".env"]);
    writeFileSync(join(rootPath, "app.txt"), "after\n", "utf8");
    writeFileSync(join(rootPath, ".env"), "SECRET=after\n", "utf8");
    const git = new GitReadClient(root, gitExecutable!);

    const status = await git.status(new AbortController().signal);
    const diff = await git.diff(
      { paths: ["app.txt"], staged: false },
      new AbortController().signal,
    );

    expect(status.output.entries.map((entry) => entry.path)).toEqual([
      "app.txt",
    ]);
    expect(diff.output.diff).toContain("-before");
    expect(diff.output.diff).toContain("+after");
    expect(diff.output.diff).not.toContain("SECRET");
    expect(() => git.diffSpec({ paths: [".env"], staged: false })).toThrow(
      /excluded/u,
    );
    appendFileSync(
      join(rootPath, ".git", "config"),
      '\n[filter "hostile"]\n\tclean = powershell.exe\n',
      "utf8",
    );
    expect(() => new GitReadClient(root, gitExecutable!)).toThrow(
      /external helpers/u,
    );
  });
});

describe("workspace orchestration vertical slice", () => {
  it("binds the path to the signed plan, executes read-only and persists evidence only", async () => {
    const { rootPath, root } = fixture();
    writeFileSync(join(rootPath, "README.md"), "vertical evidence", "utf8");
    const workspace = new WorkspaceService(root);
    const registry = new CapabilityRegistry(
      "workspace-test-1",
      createWorkspaceCapabilities(false),
    );
    const engine = new OrchestrationEngine(registry, randomUUID, sha256);
    const preview = engine.preview({
      id: randomUUID(),
      goal: "Leer el README del workspace",
      profile: "observer",
      workspaceId: root.id,
      requestedCapabilities: [workspaceCapabilityIds.read],
      capabilityInputs: {
        [workspaceCapabilityIds.read]: { path: "README.md" },
      },
    });
    const store = PersistenceStore.open(":memory:");
    store.persistPreview(preview);
    const runtime = new RuntimeEngine({
      persistence: store,
      dispatchers: createWorkspaceDispatchers(workspace),
      revalidate: (candidate) => engine.revalidate(candidate),
      evaluatePolicy,
      sha256,
    });

    const result = await runtime.execute(preview);
    const output = workspaceFileResultSchema.parse(result.outputs?.["step-1"]);

    expect(result).toMatchObject({ status: "completed", evidenceCount: 1 });
    expect(output.content).toBe("vertical evidence");
    expect(store.listEvidence(result.runId!).at(0)?.outputDigest).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(JSON.stringify(store.listAuditEvents())).not.toContain(
      "vertical evidence",
    );

    const changed = structuredClone(preview);
    changed.plan.steps[0]!.action.input = { path: "other.md" };
    expect(engine.revalidate(changed).valid).toBe(false);
    store.close();
  });

  it("blocks an escape before creating a run", async () => {
    const { root, outsidePath } = fixture();
    writeFileSync(join(outsidePath, "outside.txt"), "outside", "utf8");
    const workspace = new WorkspaceService(root);
    const registry = new CapabilityRegistry(
      "workspace-test-escape",
      createWorkspaceCapabilities(false),
    );
    const engine = new OrchestrationEngine(registry, randomUUID, sha256);
    const preview = engine.preview({
      id: randomUUID(),
      goal: "Intentar escapar del workspace",
      profile: "observer",
      workspaceId: root.id,
      requestedCapabilities: [workspaceCapabilityIds.read],
      capabilityInputs: {
        [workspaceCapabilityIds.read]: { path: "../outside/outside.txt" },
      },
    });
    const store = PersistenceStore.open(":memory:");
    store.persistPreview(preview);
    const runtime = new RuntimeEngine({
      persistence: store,
      dispatchers: createWorkspaceDispatchers(workspace),
      revalidate: (candidate) => engine.revalidate(candidate),
      evaluatePolicy,
      sha256,
    });

    const result = await runtime.execute(preview);

    expect(result.status).toBe("blocked");
    expect(result.runId).toBeUndefined();
    store.close();
  });
});
