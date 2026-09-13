import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { SafeWorkspaceWatcher } from "./workspace-watcher.js";
import { WorkspaceRoot } from "./workspace-root.js";

it("debounces safe paths and suppresses excluded paths", async () => {
  const parent = await mkdtemp(join(tmpdir(), "trivergence-watch-"));
  const workspace = join(parent, "workspace");
  mkdirSync(workspace);
  mkdirSync(join(workspace, ".git"));
  const root = new WorkspaceRoot({ id: randomUUID(), path: workspace });
  const batches: string[][] = [];
  const watcher = new SafeWorkspaceWatcher(
    root,
    (events) =>
      batches.push(
        events.flatMap((event) =>
          event.relativePath ? [event.relativePath] : [],
        ),
      ),
    { debounceMs: 30 },
  );
  try {
    watcher.start();
    await writeFile(join(workspace, "safe.txt"), "safe");
    await writeFile(join(workspace, ".git", "config"), "excluded");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(batches.flat()).toContain("safe.txt");
    expect(batches.flat()).not.toContain(".git/config");
  } finally {
    watcher.close();
    await rm(parent, { recursive: true, force: true });
  }
});
