import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PersistenceStore, type PersistenceDependencies } from "./store.js";

export interface QuarantinedFile {
  readonly name: string;
  readonly size: number;
  readonly sha256: string;
}

export interface PersistenceRecoveryRecord {
  readonly schemaVersion: 1;
  readonly incidentId: string;
  readonly detectedAt: string;
  readonly databaseFile: string;
  readonly reason: string;
  readonly files: readonly QuarantinedFile[];
  readonly quarantineDirectory: string;
}

export interface PersistenceOpenResult {
  readonly store: PersistenceStore;
  readonly recovery?: PersistenceRecoveryRecord;
}

const digestFile = async (path: string) => {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    size += bytes.byteLength;
    hash.update(bytes);
  }
  return { size, sha256: hash.digest("hex") };
};

const isReadableSqlite = (path: string): boolean => {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, {
      readOnly: true,
      allowExtension: false,
    });
    database.prepare("PRAGMA schema_version").get();
    return true;
  } catch {
    return false;
  } finally {
    database?.close();
  }
};

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

export const openPersistenceWithRecovery = async (
  databasePath: string,
  recoveryRoot: string,
  dependencies: PersistenceDependencies = {},
): Promise<PersistenceOpenResult> => {
  const activePath = resolve(databasePath);
  const recoveryPath = resolve(recoveryRoot);
  if (
    dirname(activePath).toLocaleLowerCase() !==
    dirname(recoveryPath).toLocaleLowerCase()
  ) {
    throw new Error(
      "Persistence recovery root must be an explicit sibling of the database",
    );
  }
  let failure: unknown;
  try {
    const store = PersistenceStore.open(activePath, dependencies);
    if (store.health.databaseIntegrity !== "failed") return { store };
    failure = new Error(
      store.health.reason ?? "Database integrity verification failed",
    );
    store.close();
  } catch (error) {
    if (!existsSync(activePath) || isReadableSqlite(activePath)) throw error;
    failure = error;
  }
  {
    mkdirSync(recoveryPath, { recursive: true, mode: 0o700 });
    const incidentId = randomUUID();
    const quarantineDirectory = join(recoveryPath, incidentId);
    mkdirSync(quarantineDirectory, { mode: 0o700 });
    const files: QuarantinedFile[] = [];
    for (const suffix of ["", "-wal", "-shm"] as const) {
      const source = `${activePath}${suffix}`;
      if (!existsSync(source)) continue;
      const name = `${basename(activePath)}${suffix}`;
      const metadata = await digestFile(source);
      renameSync(source, join(quarantineDirectory, name));
      files.push({ name, ...metadata });
    }
    const record: PersistenceRecoveryRecord = {
      schemaVersion: 1,
      incidentId,
      detectedAt: (dependencies.clock?.() ?? new Date()).toISOString(),
      databaseFile: basename(activePath),
      reason:
        failure instanceof Error
          ? failure.message
          : "Unreadable persistence database",
      files,
      quarantineDirectory,
    };
    const manifestPath = join(quarantineDirectory, "recovery-manifest.json");
    const descriptor = openSync(manifestPath, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    syncDirectory(quarantineDirectory);
    syncDirectory(recoveryPath);
    return {
      store: PersistenceStore.open(activePath, dependencies),
      recovery: record,
    };
  }
};
