import { createHash, randomUUID } from "node:crypto";
import {
  constants as fileConstants,
  createReadStream,
  existsSync,
} from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { verifyAuditChain } from "./audit-chain.js";
import { latestSchemaVersion } from "./migrations.js";
import type { PersistenceStore } from "./store.js";

export interface BackupManifest {
  readonly formatVersion: "1";
  readonly databaseFile: string;
  readonly createdAt: string;
  readonly schemaVersion: string;
  readonly algorithm: "sha256";
  readonly databaseDigest: string;
  readonly pageCount: number;
}

export interface BackupValidation {
  readonly valid: boolean;
  readonly databaseIntegrity: boolean;
  readonly auditIntegrity: boolean;
  readonly digestMatches: boolean;
  readonly manifest: BackupManifest;
}

export interface BackupActivation {
  readonly activePath: string;
  readonly rollbackDirectory: string;
  readonly validation: BackupValidation;
}

const digestFile = async (path: string): Promise<string> => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
};

const parseManifest = (value: unknown): BackupManifest => {
  if (!value || typeof value !== "object") {
    throw new Error("Backup manifest must be an object");
  }
  const manifest = value as Record<string, unknown>;
  if (
    manifest.formatVersion !== "1" ||
    typeof manifest.databaseFile !== "string" ||
    typeof manifest.createdAt !== "string" ||
    typeof manifest.schemaVersion !== "string" ||
    manifest.algorithm !== "sha256" ||
    typeof manifest.databaseDigest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(manifest.databaseDigest) ||
    typeof manifest.pageCount !== "number" ||
    !Number.isInteger(manifest.pageCount) ||
    manifest.pageCount < 0
  ) {
    throw new Error("Backup manifest is invalid");
  }
  return manifest as unknown as BackupManifest;
};

const inspectDatabase = (path: string) => {
  const database = new DatabaseSync(path, {
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
    enableForeignKeyConstraints: true,
    readOnly: true,
    timeout: 5_000,
  });
  try {
    database.exec("PRAGMA query_only = ON");
    const rows = database.prepare("PRAGMA quick_check").all() as Record<
      string,
      unknown
    >[];
    const databaseIntegrity =
      rows.length === 1 &&
      Object.values(rows[0] ?? {}).every((value) => value === "ok");
    return {
      databaseIntegrity,
      auditIntegrity: verifyAuditChain(database).valid,
    };
  } finally {
    database.close();
  }
};

export const validateBackup = async (
  databasePath: string,
  manifestPath = `${databasePath}.manifest.json`,
): Promise<BackupValidation> => {
  const manifest = parseManifest(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
  );
  const databaseDigest = await digestFile(databasePath);
  const inspection = inspectDatabase(databasePath);
  const digestMatches = databaseDigest === manifest.databaseDigest;
  return {
    valid:
      digestMatches &&
      inspection.databaseIntegrity &&
      inspection.auditIntegrity,
    ...inspection,
    digestMatches,
    manifest,
  };
};

export const createBackup = async (
  store: PersistenceStore,
  destinationPath: string,
  clock: () => Date = () => new Date(),
): Promise<BackupManifest> => {
  const destination = resolve(destinationPath);
  const manifestPath = `${destination}.manifest.json`;
  if (existsSync(destination) || existsSync(manifestPath)) {
    throw new Error("Backup destination and manifest must not already exist");
  }
  const pageCount = await store.createOnlineBackup(destination);
  const inspection = inspectDatabase(destination);
  if (!inspection.databaseIntegrity || !inspection.auditIntegrity) {
    throw new Error("Backup integrity verification failed");
  }
  const manifest: BackupManifest = {
    formatVersion: "1",
    databaseFile: basename(destination),
    createdAt: clock().toISOString(),
    schemaVersion: latestSchemaVersion,
    algorithm: "sha256",
    databaseDigest: await digestFile(destination),
    pageCount,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return manifest;
};

export const restoreBackup = async (
  backupPath: string,
  destinationPath: string,
): Promise<BackupValidation> => {
  const source = resolve(backupPath);
  const destination = resolve(destinationPath);
  if (source.toLocaleLowerCase() === destination.toLocaleLowerCase()) {
    throw new Error("Backup restoration requires a new destination path");
  }
  const sourceValidation = await validateBackup(source);
  if (!sourceValidation.valid) {
    throw new Error("Cannot restore an invalid backup");
  }
  await copyFile(source, destination, fileConstants.COPYFILE_EXCL);
  const restoredDigest = await digestFile(destination);
  const inspection = inspectDatabase(destination);
  return {
    valid:
      restoredDigest === sourceValidation.manifest.databaseDigest &&
      inspection.databaseIntegrity &&
      inspection.auditIntegrity,
    ...inspection,
    digestMatches: restoredDigest === sourceValidation.manifest.databaseDigest,
    manifest: sourceValidation.manifest,
  };
};

export const activateBackup = async (
  backupPath: string,
  activeDatabasePath: string,
  recoveryRoot: string,
): Promise<BackupActivation> => {
  const activePath = resolve(activeDatabasePath);
  const recoveryPath = resolve(recoveryRoot);
  if (
    dirname(activePath).toLocaleLowerCase() !==
    dirname(recoveryPath).toLocaleLowerCase()
  ) {
    throw new Error(
      "Rollback root must be an explicit sibling of the active database",
    );
  }
  const transactionId = randomUUID();
  const stagingPath = `${activePath}.${transactionId}.restore.tmp`;
  const rollbackDirectory = join(recoveryPath, `rollback-${transactionId}`);
  const stagedValidation = await restoreBackup(backupPath, stagingPath);
  if (!stagedValidation.valid) {
    await rm(stagingPath, { force: true });
    throw new Error("Restored database failed validation before activation");
  }
  await mkdir(recoveryPath, { recursive: true, mode: 0o700 });
  await mkdir(rollbackDirectory, { recursive: false, mode: 0o700 });
  const moved: { source: string; rollback: string }[] = [];
  try {
    for (const suffix of ["", "-wal", "-shm"] as const) {
      const source = `${activePath}${suffix}`;
      if (!existsSync(source)) continue;
      const rollback = join(
        rollbackDirectory,
        `${basename(activePath)}${suffix}`,
      );
      await rename(source, rollback);
      moved.push({ source, rollback });
    }
    await rename(stagingPath, activePath);
    const inspection = inspectDatabase(activePath);
    if (!inspection.databaseIntegrity || !inspection.auditIntegrity) {
      throw new Error(
        "Activated rollback database failed integrity verification",
      );
    }
    await writeFile(
      join(rollbackDirectory, "rollback-manifest.json"),
      `${JSON.stringify({ schemaVersion: 1, transactionId, activeDatabase: basename(activePath), sourceBackup: basename(resolve(backupPath)), activatedDigest: stagedValidation.manifest.databaseDigest, preservedFiles: moved.map(({ rollback }) => basename(rollback)) }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    return { activePath, rollbackDirectory, validation: stagedValidation };
  } catch (error) {
    await rm(activePath, { force: true });
    for (const entry of moved.reverse())
      await rename(entry.rollback, entry.source);
    throw error;
  } finally {
    await rm(stagingPath, { force: true });
  }
};
