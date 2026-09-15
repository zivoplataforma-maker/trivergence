import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
process.env.TRIVERGENCE_CAPTURE_DIR = path.resolve(
  directory,
  "../../../docs/assets/screenshots",
);
await import("./e2e-electron.mjs");
