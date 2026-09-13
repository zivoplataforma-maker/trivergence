import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const manifestPath = resolve(root, "artifacts/SHA256SUMS.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const installer = manifest.artifacts.find((item) =>
  /windows\/Trivergence-.*-windows-x64-UNSIGNED\.exe$/u.test(item.path),
);
const appAsar = manifest.artifacts.find((item) =>
  item.path.endsWith("windows/win-unpacked/resources/app.asar"),
);
const sbom = manifest.artifacts.find((item) => item.path.endsWith(".cdx.json"));
if (!installer || !appAsar || !sbom)
  throw new Error("Installer, packaged ASAR and SBOM are required");
for (const item of manifest.artifacts) {
  const path = resolve(root, "artifacts", item.path);
  if (
    !existsSync(path) ||
    !statSync(path).isFile() ||
    statSync(path).size !== item.size
  )
    throw new Error(`Artifact missing or resized: ${item.path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== item.sha256)
    throw new Error(`Artifact digest mismatch: ${item.path}`);
}
process.stdout.write(
  `Verified ${manifest.artifacts.length} artifact digests; installer is intentionally UNSIGNED.\n`,
);
