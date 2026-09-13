import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";

const directory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(directory, "..");
const smokeProfile = mkdtempSync(
  path.join(applicationRoot, "dist", "smoke-profile-"),
);

const child = spawn(
  electronPath,
  ["--disable-gpu", `--user-data-dir=${smokeProfile}`, applicationRoot],
  {
    env: {
      ...process.env,
      TRIVERGENCE_SMOKE_TEST: "1",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

const cleanSmokeProfile = () => {
  rmSync(smokeProfile, { recursive: true, force: true });
};

const timeout = setTimeout(() => {
  child.kill();
  process.stderr.write("Electron smoke test timed out.\n");
}, 15_000);

child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  cleanSmokeProfile();
  if (signal || code !== 0) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Electron smoke test passed.\n");
});

child.once("error", (error) => {
  clearTimeout(timeout);
  cleanSmokeProfile();
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
