import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import electronPath from "electron";

const directory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(directory, "..");
const harness = path.resolve(directory, "e2e-main.mjs");
const profile = mkdtempSync(path.join(applicationRoot, "dist", "e2e-profile-"));
const workspace = mkdtempSync(
  path.join(applicationRoot, "dist", "e2e-workspace-"),
);
writeFileSync(
  path.join(workspace, "README.md"),
  "E2E workspace content\n",
  "utf8",
);
for (let index = 0; index < 400; index += 1) {
  writeFileSync(
    path.join(
      workspace,
      `search-fixture-${index.toString().padStart(3, "0")}.txt`,
    ),
    `search fixture ${index}\n`,
    "utf8",
  );
}

let cleaned = false;
const cleanProfile = () => {
  if (cleaned) return;
  cleaned = true;
  rmSync(profile, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
};

const child = spawn(
  electronPath,
  ["--disable-gpu", `--user-data-dir=${profile}`, harness],
  {
    env: {
      ...process.env,
      TRIVERGENCE_E2E_TEST: "1",
      TRIVERGENCE_E2E_WORKSPACE: workspace,
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

const timeout = setTimeout(() => {
  child.kill();
  process.stderr.write("Electron orchestration E2E timed out.\n");
}, 30_000);

child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  cleanProfile();
  if (signal || code !== 0) process.exitCode = 1;
});

child.once("error", (error) => {
  clearTimeout(timeout);
  cleanProfile();
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
