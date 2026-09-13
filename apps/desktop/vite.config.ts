import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const directory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: path.resolve(directory, "dist/renderer"),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@renderer": path.resolve(directory, "src/renderer"),
    },
  },
  root: path.resolve(directory, "src/renderer"),
});
