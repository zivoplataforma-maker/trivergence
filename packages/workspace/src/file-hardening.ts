import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import type { WorkspaceRoot } from "./workspace-root.js";

const MAX_SNAPSHOT_BYTES = 1_048_576;

const digest = (content: Uint8Array | string) =>
  createHash("sha256").update(content).digest("hex");

export interface FileSnapshot {
  readonly schemaVersion: 1;
  readonly relativePath: string;
  readonly exists: boolean;
  readonly size: number;
  readonly sha256: string;
  readonly modifiedAtMs: number;
  readonly contentBase64: string;
}

interface WriteJournalBody {
  readonly schemaVersion: 1;
  readonly transactionId: string;
  readonly workspaceId: string;
  readonly workspaceFingerprint: string;
  readonly relativePath: string;
  readonly before: FileSnapshot;
  readonly afterSha256: string;
}

interface WriteJournal {
  readonly body: WriteJournalBody;
  readonly digest: string;
}

export interface PendingWriteRecovery {
  readonly transactionId: string;
  readonly relativePath: string;
  readonly outcome: "restored" | "already-restored";
}

export class WorkspaceWriteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceWriteConflictError";
  }
}

const sameSnapshot = (left: FileSnapshot, right: FileSnapshot) =>
  left.exists === right.exists &&
  left.size === right.size &&
  left.sha256 === right.sha256;

const syncDirectory = (path: string) => {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
};

export class AtomicWorkspaceWriter {
  readonly #root: WorkspaceRoot;
  readonly #recoveryDirectory: string;

  constructor(root: WorkspaceRoot, recoveryDirectory: string) {
    this.#root = root;
    this.#recoveryDirectory = resolve(recoveryDirectory);
    const fromRoot = relative(root.path, this.#recoveryDirectory);
    if (
      fromRoot === "" ||
      (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
    ) {
      throw new Error("Recovery journals must be stored outside the workspace");
    }
    mkdirSync(this.#recoveryDirectory, { recursive: true, mode: 0o700 });
  }

  snapshot(relativePath: string): FileSnapshot {
    const normalized = this.#root.normalizeRelative(relativePath);
    const target = this.#root.resolveForWrite(normalized);
    if (!existsSync(target)) {
      return {
        schemaVersion: 1,
        relativePath: normalized,
        exists: false,
        size: 0,
        sha256: digest(Buffer.alloc(0)),
        modifiedAtMs: 0,
        contentBase64: "",
      };
    }
    const stats = statSync(target);
    if (stats.size > MAX_SNAPSHOT_BYTES) {
      throw new Error(`Workspace snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
    }
    const content = readFileSync(target);
    return {
      schemaVersion: 1,
      relativePath: normalized,
      exists: true,
      size: content.byteLength,
      sha256: digest(content),
      modifiedAtMs: stats.mtimeMs,
      contentBase64: content.toString("base64"),
    };
  }

  write(
    relativePath: string,
    content: Uint8Array,
    expected: FileSnapshot,
  ): string {
    if (content.byteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error(`Workspace write exceeds ${MAX_SNAPSHOT_BYTES} bytes`);
    }
    const normalized = this.#root.normalizeRelative(relativePath);
    if (
      expected.relativePath !== normalized ||
      !sameSnapshot(this.snapshot(normalized), expected)
    ) {
      throw new WorkspaceWriteConflictError(
        "Workspace file changed after its snapshot",
      );
    }
    const target = this.#root.resolveForWrite(normalized);
    const transactionId = randomUUID();
    const body: WriteJournalBody = {
      schemaVersion: 1,
      transactionId,
      workspaceId: this.#root.id,
      workspaceFingerprint: this.#root.fingerprint,
      relativePath: normalized,
      before: expected,
      afterSha256: digest(content),
    };
    this.#writeJsonAtomic(this.#journalPath(transactionId), {
      body,
      digest: digest(JSON.stringify(body)),
    } satisfies WriteJournal);
    this.#replaceTarget(target, content);
    if (this.snapshot(normalized).sha256 !== body.afterSha256) {
      throw new Error("Atomic workspace write verification failed");
    }
    return transactionId;
  }

  finalize(transactionId: string): void {
    rmSync(this.#journalPath(transactionId), { force: true });
    syncDirectory(this.#recoveryDirectory);
  }

  rollback(transactionId: string): PendingWriteRecovery {
    const journal = this.#readJournal(transactionId);
    const current = this.snapshot(journal.body.relativePath);
    if (current.sha256 !== journal.body.afterSha256) {
      throw new WorkspaceWriteConflictError(
        "Rollback refused because the target changed",
      );
    }
    this.#restore(journal.body.before);
    this.finalize(transactionId);
    return {
      transactionId,
      relativePath: journal.body.relativePath,
      outcome: "restored",
    };
  }

  recoverPending(): PendingWriteRecovery[] {
    const outcomes: PendingWriteRecovery[] = [];
    for (const name of readdirSync(this.#recoveryDirectory).filter((entry) =>
      entry.endsWith(".journal.json"),
    )) {
      const transactionId = name.slice(0, -".journal.json".length);
      const journal = this.#readJournal(transactionId);
      const current = this.snapshot(journal.body.relativePath);
      if (sameSnapshot(current, journal.body.before)) {
        this.finalize(transactionId);
        outcomes.push({
          transactionId,
          relativePath: journal.body.relativePath,
          outcome: "already-restored",
        });
      } else if (current.sha256 === journal.body.afterSha256) {
        this.#restore(journal.body.before);
        this.finalize(transactionId);
        outcomes.push({
          transactionId,
          relativePath: journal.body.relativePath,
          outcome: "restored",
        });
      } else {
        throw new WorkspaceWriteConflictError(
          "Recovery refused because a pending target has unexpected content",
        );
      }
    }
    return outcomes;
  }

  #restore(snapshot: FileSnapshot): void {
    const target = this.#root.resolveForWrite(snapshot.relativePath);
    if (!snapshot.exists) {
      rmSync(target, { force: true });
      syncDirectory(dirname(target));
      return;
    }
    const content = Buffer.from(snapshot.contentBase64, "base64");
    if (
      digest(content) !== snapshot.sha256 ||
      content.byteLength !== snapshot.size
    ) {
      throw new Error("Snapshot payload is corrupt");
    }
    this.#replaceTarget(target, content);
  }

  #replaceTarget(target: string, content: Uint8Array): void {
    const temp = join(
      dirname(target),
      `.${basename(target)}.${randomUUID()}.tmp`,
    );
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temp, "wx", 0o600);
      writeFileSync(descriptor, content);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      this.#root.resolveForWrite(
        this.#root.normalizeRelative(target.slice(this.#root.path.length + 1)),
      );
      renameSync(temp, target);
      syncDirectory(dirname(target));
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      rmSync(temp, { force: true });
    }
  }

  #journalPath(transactionId: string) {
    if (!/^[0-9a-f-]{36}$/u.test(transactionId))
      throw new Error("Invalid transaction id");
    return join(this.#recoveryDirectory, `${transactionId}.journal.json`);
  }

  #writeJsonAtomic(path: string, value: WriteJournal): void {
    const temp = `${path}.${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temp, "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify(value), "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temp, path);
      syncDirectory(dirname(path));
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      rmSync(temp, { force: true });
    }
  }

  #readJournal(transactionId: string): WriteJournal {
    const parsed = JSON.parse(
      readFileSync(this.#journalPath(transactionId), "utf8"),
    ) as WriteJournal;
    if (
      parsed.body.schemaVersion !== 1 ||
      parsed.body.workspaceId !== this.#root.id ||
      parsed.body.workspaceFingerprint !== this.#root.fingerprint ||
      parsed.digest !== digest(JSON.stringify(parsed.body))
    ) {
      throw new Error("Recovery journal is invalid or corrupt");
    }
    return parsed;
  }
}
