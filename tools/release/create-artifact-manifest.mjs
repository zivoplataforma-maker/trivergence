import { createHash } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const directory = resolve(import.meta.dirname, "../../artifacts");
const output = resolve(directory, "SHA256SUMS.json");
const files = readdirSync(directory, { recursive: true })
  .map(String)
  .filter((name) => name !== "SHA256SUMS.json")
  .map((name) => ({
    name: name.replaceAll("\\", "/"),
    path: resolve(directory, name),
  }))
  .filter(({ path }) => statSync(path).isFile())
  .sort((a, b) => a.name.localeCompare(b.name));
const artifacts = [];
for (const file of files) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file.path)) hash.update(chunk);
  artifacts.push({
    path: file.name,
    size: statSync(file.path).size,
    sha256: hash.digest("hex"),
  });
}
writeFileSync(
  output,
  `${JSON.stringify({ schemaVersion: 1, artifacts }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${output}\n`);
