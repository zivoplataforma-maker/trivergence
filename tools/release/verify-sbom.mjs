import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(
  import.meta.dirname,
  "../../artifacts/trivergence-0.7.0.cdx.json",
);
const raw = readFileSync(path, "utf8");
const sbom = JSON.parse(raw);
if (
  sbom.bomFormat !== "CycloneDX" ||
  sbom.specVersion !== "1.7" ||
  !Array.isArray(sbom.components) ||
  sbom.components.length === 0
) {
  throw new Error("SBOM must be a non-empty CycloneDX 1.7 document");
}
if (
  /(_authToken|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|password\s*[=:])/iu.test(
    raw,
  )
) {
  throw new Error("SBOM contains material resembling a credential");
}
const references = new Set(
  sbom.components.map((component) => component["bom-ref"]),
);
for (const dependency of sbom.dependencies ?? []) {
  if (
    !references.has(dependency.ref) &&
    dependency.ref !== sbom.metadata?.component?.["bom-ref"]
  ) {
    throw new Error(
      `SBOM dependency has an unknown reference: ${dependency.ref}`,
    );
  }
}
process.stdout.write(`SBOM verified: ${sbom.components.length} components\n`);
