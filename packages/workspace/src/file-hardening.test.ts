import { randomUUID } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AtomicWorkspaceWriter,
  WorkspaceWriteConflictError,
} from "./file-hardening.js";
import { WorkspaceRoot } from "./workspace-root.js";

const temporary: string[] = [];
const setup = async () => {
  const parent = await mkdtemp(join(tmpdir(), "trivergence-hardening-"));
  temporary.push(parent);
  const workspace = join(parent, "workspace");
  const recovery = join(parent, "recovery");
  mkdirSync(workspace);
  const root = new WorkspaceRoot({ id: randomUUID(), path: workspace });
  return {
    parent,
    workspace,
    recovery,
    root,
    writer: new AtomicWorkspaceWriter(root, recovery),
  };
};

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("atomic workspace hardening", () => {
  it("writes atomically and rolls back from its authenticated journal", async () => {
    const { workspace, writer } = await setup();
    await writeFile(join(workspace, "note.txt"), "before");
    const snapshot = writer.snapshot("note.txt");
    const transactionId = writer.write(
      "note.txt",
      Buffer.from("after"),
      snapshot,
    );
    expect(await readFile(join(workspace, "note.txt"), "utf8")).toBe("after");
    expect(writer.rollback(transactionId).outcome).toBe("restored");
    expect(await readFile(join(workspace, "note.txt"), "utf8")).toBe("before");
  });

  it("recovers a write left pending by a simulated crash", async () => {
    const { workspace, recovery, root, writer } = await setup();
    await writeFile(join(workspace, "note.txt"), "before");
    const transactionId = writer.write(
      "note.txt",
      Buffer.from("after"),
      writer.snapshot("note.txt"),
    );
    const restarted = new AtomicWorkspaceWriter(root, recovery);
    expect(restarted.recoverPending()).toEqual([
      { transactionId, relativePath: "note.txt", outcome: "restored" },
    ]);
    expect(await readFile(join(workspace, "note.txt"), "utf8")).toBe("before");
  });

  it("fails closed for stale snapshots and corrupted journals", async () => {
    const { workspace, recovery, writer } = await setup();
    await writeFile(join(workspace, "note.txt"), "one");
    const snapshot = writer.snapshot("note.txt");
    await writeFile(join(workspace, "note.txt"), "two");
    expect(() =>
      writer.write("note.txt", Buffer.from("three"), snapshot),
    ).toThrow(WorkspaceWriteConflictError);
    const current = writer.snapshot("note.txt");
    const transactionId = writer.write(
      "note.txt",
      Buffer.from("three"),
      current,
    );
    const journalPath = join(recovery, `${transactionId}.journal.json`);
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      digest: string;
    };
    journal.digest = "0".repeat(64);
    writeFileSync(journalPath, JSON.stringify(journal));
    expect(() => writer.recoverPending()).toThrow("invalid or corrupt");
  });

  it("rejects symlink and hard-link write targets", async () => {
    const { parent, workspace, writer } = await setup();
    const external = join(parent, "external.txt");
    await writeFile(external, "secret");
    try {
      symlinkSync(external, join(workspace, "link.txt"), "file");
      expect(() => writer.snapshot("link.txt")).toThrow("symbolic links");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("EPERM");
    }
    linkSync(external, join(workspace, "hard.txt"));
    expect(() => writer.snapshot("hard.txt")).toThrow("hard-linked");
  });
});
