import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  realpathSync,
  statSync,
  type BigIntStats,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";

const RESERVED_WINDOWS_NAME =
  /^(?:con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])$/iu;
const DEVICE_OR_UNC = /^(?:\\\\[?.]\\|\\\\|\/\/)/u;

const mandatorySegments = new Set([
  ".git",
  ".ssh",
  ".aws",
  ".azure",
  ".gnupg",
  ".kube",
  ".docker",
  ".codex",
  ".claude",
  ".gemini",
  ".mozilla",
  "appdata",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);
const mandatoryFiles = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  "_netrc",
  ".git-credentials",
]);
const mandatoryPaths = [
  ".config/gh",
  ".config/gcloud",
  ".config/google-chrome",
  ".config/chromium",
  ".config/microsoft-edge",
  ".config/op",
] as const;

const normalizeCase = (value: string) =>
  process.platform === "win32" ? value.toLocaleLowerCase() : value;

const isWithin = (candidate: string, root: string) => {
  const difference = relative(normalizeCase(root), normalizeCase(candidate));
  return (
    difference === "" ||
    (!difference.startsWith("..") && !isAbsolute(difference))
  );
};

const assertSegment = (segment: string) => {
  if (!segment || segment === "." || segment === "..") {
    throw new Error(
      "Workspace paths cannot contain empty, dot or parent segments",
    );
  }
  if (segment.includes("\0") || segment.includes(":")) {
    throw new Error("Workspace path contains a device or stream syntax");
  }
  const windowsBase = segment.replace(/[ .]+$/u, "").split(".")[0] ?? "";
  if (RESERVED_WINDOWS_NAME.test(windowsBase)) {
    throw new Error("Workspace path contains a reserved Windows name");
  }
};

const normalizeRelative = (input: string) => {
  if (
    !input ||
    input.includes("\0") ||
    isAbsolute(input) ||
    win32.isAbsolute(input) ||
    DEVICE_OR_UNC.test(input)
  ) {
    throw new Error("Workspace tools require a relative path");
  }
  const segments = input.split(/[\\/]+/u);
  for (const segment of segments) assertSegment(segment);
  return segments.join("/");
};

const identityOf = (stats: BigIntStats) =>
  `${stats.dev.toString()}:${stats.ino.toString()}`;

export interface WorkspaceRootOptions {
  readonly id: string;
  readonly path: string;
  readonly userExclusions?: readonly string[];
}

export class WorkspaceRoot {
  readonly id: string;
  readonly path: string;
  readonly fingerprint: string;
  readonly #identity: string;
  readonly #userExclusions: ReadonlySet<string>;

  constructor(options: WorkspaceRootOptions) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        options.id,
      )
    ) {
      throw new Error("Workspace id must be a UUID");
    }
    if (
      !options.path ||
      options.path.includes("\0") ||
      !isAbsolute(options.path) ||
      DEVICE_OR_UNC.test(options.path)
    ) {
      throw new Error("Workspace root must be an absolute local path");
    }
    const drivePrefix = /^[a-zA-Z]:/u.test(options.path) ? 2 : 0;
    if (options.path.slice(drivePrefix).includes(":")) {
      throw new Error("Workspace root cannot contain Alternate Data Streams");
    }
    for (const segment of options.path.slice(drivePrefix).split(/[\\/]+/u)) {
      if (segment) assertSegment(segment);
    }
    const canonical = realpathSync.native(resolve(options.path));
    const stats = statSync(canonical, { bigint: true });
    if (!stats.isDirectory())
      throw new Error("Workspace root must be a directory");

    this.id = options.id;
    this.path = canonical;
    this.#identity = identityOf(stats);
    this.fingerprint = createHash("sha256").update(canonical).digest("hex");
    this.#userExclusions = new Set(
      (options.userExclusions ?? []).map((value) =>
        normalizeRelative(value).toLocaleLowerCase(),
      ),
    );
  }

  normalizeRelative(input: string): string {
    return normalizeRelative(input);
  }

  isExcluded(input: string): boolean {
    const normalized = normalizeRelative(input).toLocaleLowerCase();
    const segments = normalized.split("/");
    if (
      segments.some(
        (segment) =>
          mandatorySegments.has(segment) ||
          mandatoryFiles.has(segment) ||
          segment === ".env" ||
          segment.startsWith(".env."),
      )
    ) {
      return true;
    }
    if (
      mandatoryPaths.some(
        (excluded) =>
          normalized === excluded || normalized.startsWith(`${excluded}/`),
      )
    ) {
      return true;
    }
    return [...this.#userExclusions].some(
      (excluded) =>
        normalized === excluded || normalized.startsWith(`${excluded}/`),
    );
  }

  resolveExisting(
    input: string,
    expected: "file" | "directory" = "file",
  ): string {
    this.assertIdentity();
    const normalized = normalizeRelative(input);
    if (this.isExcluded(normalized)) {
      throw new Error("Workspace path is excluded by mandatory policy");
    }
    const candidate = join(this.path, ...normalized.split("/"));
    const canonical = realpathSync.native(candidate);
    if (!isWithin(canonical, this.path)) {
      throw new Error("Workspace path resolves outside the selected root");
    }
    const realRelative = relative(this.path, canonical).split(sep).join("/");
    if (realRelative && this.isExcluded(realRelative)) {
      throw new Error("Workspace target resolves into an excluded path");
    }
    const stats = statSync(canonical);
    if (expected === "file" ? !stats.isFile() : !stats.isDirectory()) {
      throw new Error(`Workspace target must be a ${expected}`);
    }
    return canonical;
  }

  resolveForWrite(input: string): string {
    this.assertIdentity();
    const normalized = normalizeRelative(input);
    if (this.isExcluded(normalized)) {
      throw new Error("Workspace path is excluded by mandatory policy");
    }
    const candidate = join(this.path, ...normalized.split("/"));
    const canonicalParent = realpathSync.native(dirname(candidate));
    if (!isWithin(canonicalParent, this.path)) {
      throw new Error("Workspace parent resolves outside the selected root");
    }
    if (existsSync(candidate)) {
      const linkStats = lstatSync(candidate);
      if (linkStats.isSymbolicLink()) {
        throw new Error("Workspace writes cannot target symbolic links");
      }
      const stats = statSync(candidate);
      if (!stats.isFile())
        throw new Error("Workspace write target must be a file");
      if (stats.nlink > 1) {
        throw new Error("Workspace writes cannot target hard-linked files");
      }
      const canonical = realpathSync.native(candidate);
      if (!isWithin(canonical, this.path)) {
        throw new Error("Workspace target resolves outside the selected root");
      }
    }
    return candidate;
  }

  assertLocalGitDirectory(): string {
    this.assertIdentity();
    const logical = join(this.path, ".git");
    const linkStats = lstatSync(logical);
    if (linkStats.isSymbolicLink() || !linkStats.isDirectory()) {
      throw new Error(
        "M4 requires a local .git directory inside the workspace root",
      );
    }
    const canonical = realpathSync.native(logical);
    if (!isWithin(canonical, this.path)) {
      throw new Error("Git metadata resolves outside the workspace root");
    }
    return canonical;
  }

  assertIdentity(): void {
    const canonical = realpathSync.native(this.path);
    const stats = statSync(canonical, { bigint: true });
    if (canonical !== this.path || identityOf(stats) !== this.#identity) {
      throw new Error("Workspace root identity changed; select it again");
    }
  }
}
