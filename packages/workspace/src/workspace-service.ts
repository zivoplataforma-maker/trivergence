import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  statSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  workspaceFileResultSchema,
  workspaceSearchResultSchema,
  type WorkspaceFileResult,
  type WorkspaceSearchResult,
} from "./schemas.js";
import { isIgnored, parseIgnoreFile, type IgnoreRule } from "./ignore-rules.js";
import type { WorkspaceRoot } from "./workspace-root.js";

const MAX_FILE_BYTES = 1_048_576;
const MAX_FILES = 5_000;
const MAX_SEARCH_BYTES = 20 * 1_048_576;
const MAX_MATCHES = 200;
const MAX_IGNORE_BYTES = 64 * 1_024;

const decodeText = (buffer: Buffer): string => {
  if (buffer.subarray(0, 8_192).includes(0)) {
    throw new Error("Binary files are not supported");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("Workspace file is not valid UTF-8");
  }
};

const readBounded = (path: string, maximum: number): Buffer => {
  const before = statSync(path, { bigint: true });
  if (!before.isFile() || before.size > BigInt(maximum)) {
    throw new Error(`Workspace file exceeds the ${maximum} byte limit`);
  }
  const handle = openSync(path, "r");
  try {
    const opened = fstatSync(handle, { bigint: true });
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > BigInt(maximum)
    ) {
      throw new Error("Workspace file changed while it was being opened");
    }
    return readFileSync(handle);
  } finally {
    closeSync(handle);
  }
};

const yieldToEventLoop = () =>
  new Promise<void>((resolveYield) => setImmediate(resolveYield));

const assertNotCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error("Workspace search cancelled");
};

export class WorkspaceService {
  constructor(readonly root: WorkspaceRoot) {}

  readText(inputPath: string): WorkspaceFileResult {
    const normalized = this.root.normalizeRelative(inputPath);
    const path = this.root.resolveExisting(normalized, "file");
    const buffer = readBounded(path, MAX_FILE_BYTES);
    return workspaceFileResultSchema.parse({
      path: normalized,
      content: decodeText(buffer),
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }

  async searchLiteral(
    query: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceSearchResult> {
    if (!query || query.length > 200 || query.includes("\0")) {
      throw new Error("Search query must contain between 1 and 200 characters");
    }
    assertNotCancelled(signal);
    const candidates = await this.#listSearchableFiles(signal);
    const matches: WorkspaceSearchResult["matches"] = [];
    let filesScanned = 0;
    let bytesScanned = 0;
    let truncated = candidates.truncated;

    for (const relativePath of candidates.files) {
      assertNotCancelled(signal);
      await yieldToEventLoop();
      if (matches.length >= MAX_MATCHES || bytesScanned >= MAX_SEARCH_BYTES) {
        truncated = true;
        break;
      }
      try {
        const path = this.root.resolveExisting(relativePath, "file");
        const size = statSync(path).size;
        if (size > MAX_FILE_BYTES || bytesScanned + size > MAX_SEARCH_BYTES) {
          truncated = true;
          continue;
        }
        const buffer = readBounded(path, MAX_FILE_BYTES);
        const content = decodeText(buffer);
        filesScanned += 1;
        bytesScanned += buffer.length;
        const lines = content.split(/\r?\n/u);
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          const line = lines[lineIndex] ?? "";
          let from = 0;
          while (from <= line.length) {
            const column = line.indexOf(query, from);
            if (column < 0) break;
            const start = Math.max(0, column - 160);
            matches.push({
              path: relativePath,
              line: lineIndex + 1,
              column: column + 1,
              preview: line.slice(start, start + 500),
            });
            if (matches.length >= MAX_MATCHES) {
              truncated = true;
              break;
            }
            from = column + Math.max(query.length, 1);
          }
          if (matches.length >= MAX_MATCHES) break;
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        // Binarios, cambios concurrentes y archivos inaccesibles se omiten.
      }
    }

    return workspaceSearchResultSchema.parse({
      query,
      matches,
      filesScanned,
      bytesScanned,
      truncated,
    });
  }

  async #listSearchableFiles(
    signal?: AbortSignal,
  ): Promise<{ files: string[]; truncated: boolean }> {
    this.root.assertIdentity();
    const files: string[] = [];
    const visited = new Set<string>();
    let truncated = false;

    const visit = async (
      logicalDirectory: string,
      inherited: readonly IgnoreRule[],
    ): Promise<void> => {
      assertNotCancelled(signal);
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const directory = logicalDirectory
        ? this.root.resolveExisting(logicalDirectory, "directory")
        : this.root.path;
      const realKey =
        process.platform === "win32"
          ? directory.toLocaleLowerCase()
          : directory;
      if (visited.has(realKey)) return;
      visited.add(realKey);

      const rules = [...inherited];
      const ignoreLogical = logicalDirectory
        ? `${logicalDirectory}/.gitignore`
        : ".gitignore";
      if (!this.root.isExcluded(ignoreLogical)) {
        try {
          const ignorePath = this.root.resolveExisting(ignoreLogical, "file");
          const content = decodeText(readBounded(ignorePath, MAX_IGNORE_BYTES));
          rules.push(...parseIgnoreFile(content, logicalDirectory));
        } catch {
          // La ausencia de .gitignore es normal.
        }
      }

      const entries = await readdir(directory, { withFileTypes: true });
      for (let index = 0; index < entries.length; index += 1) {
        if (index % 32 === 0) {
          assertNotCancelled(signal);
          await yieldToEventLoop();
        }
        const entry = entries[index];
        if (!entry) continue;
        const logical = logicalDirectory
          ? `${logicalDirectory}/${entry.name}`
          : entry.name;
        if (this.root.isExcluded(logical)) continue;
        let real: string;
        try {
          real = this.root.resolveExisting(
            logical,
            entry.isDirectory()
              ? "directory"
              : entry.isFile()
                ? "file"
                : "file",
          );
        } catch {
          if (entry.isSymbolicLink()) {
            try {
              const candidate = join(directory, entry.name);
              const target = statSync(candidate);
              real = this.root.resolveExisting(
                logical,
                target.isDirectory() ? "directory" : "file",
              );
            } catch {
              continue;
            }
          } else {
            continue;
          }
        }
        const canonicalRelative = relative(this.root.path, real)
          .split(sep)
          .join("/");
        const isDirectory = statSync(real).isDirectory();
        if (
          this.root.isExcluded(canonicalRelative) ||
          isIgnored(logical, isDirectory, rules)
        ) {
          continue;
        }
        if (isDirectory) {
          await visit(logical, rules);
        } else {
          files.push(logical);
          if (files.length >= MAX_FILES) {
            truncated = true;
            break;
          }
        }
      }
    };

    await visit("", []);
    files.sort((left, right) => left.localeCompare(right));
    return { files, truncated };
  }
}
