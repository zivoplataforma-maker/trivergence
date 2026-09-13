import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const outputDirectory = resolve(root, "artifacts");
const output = resolve(outputDirectory, "trivergence-0.7.0.cdx.json");
mkdirSync(outputDirectory, { recursive: true });
const pnpmEntry = process.env.npm_execpath;
if (!pnpmEntry) throw new Error("pnpm entrypoint is unavailable");
const result = spawnSync(
  process.execPath,
  [
    pnpmEntry,
    "sbom",
    "--sbom-format",
    "cyclonedx",
    "--sbom-spec-version",
    "1.7",
    "--sbom-type",
    "application",
    "--lockfile-only",
    "--out",
    output,
  ],
  { cwd: root, encoding: "utf8", env: { ...process.env, CI: "true" } },
);
if (result.status !== 0 || result.error) {
  process.stderr.write(
    result.error?.message ||
      result.stderr ||
      result.stdout ||
      "SBOM generation failed\n",
  );
  process.exit(result.status ?? 1);
}
const document = JSON.parse(readFileSync(output, "utf8"));
delete document.serialNumber;
if (document.metadata) delete document.metadata.timestamp;
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
process.stdout.write(`${output}\n`);
