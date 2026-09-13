import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { openPersistenceWithRecovery } from "./recovery.js";

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  ),
);

it("quarantines an unreadable database before creating a healthy replacement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "trivergence-db-recovery-"));
  temporary.push(directory);
  const databasePath = join(directory, "trivergence.sqlite");
  const recoveryRoot = join(directory, "recovery");
  const corrupt = Buffer.from(
    "this is not sqlite and must be preserved",
    "utf8",
  );
  await writeFile(databasePath, corrupt);

  const result = await openPersistenceWithRecovery(databasePath, recoveryRoot, {
    clock: () => new Date("2026-09-10T12:00:00.000Z"),
  });
  expect(result.recovery?.files).toEqual([
    expect.objectContaining({
      name: "trivergence.sqlite",
      sha256: createHash("sha256").update(corrupt).digest("hex"),
    }),
  ]);
  expect(result.store.health).toMatchObject({
    mode: "readwrite",
    databaseIntegrity: "ok",
    privilegedActionsAvailable: true,
  });
  const quarantinedPath = join(
    result.recovery!.quarantineDirectory,
    "trivergence.sqlite",
  );
  expect(await readFile(quarantinedPath)).toEqual(corrupt);
  expect(
    existsSync(
      join(result.recovery!.quarantineDirectory, "recovery-manifest.json"),
    ),
  ).toBe(true);
  result.store.close();
});
