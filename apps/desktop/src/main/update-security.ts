import { createHash, verify } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const externalUpdatesEnabled = false;

export interface ReleaseAsset {
  readonly url: string;
  readonly sha256: string;
  readonly size: number;
}

export interface ReleaseManifestPayload {
  readonly schemaVersion: 1;
  readonly product: "Trivergence";
  readonly channel: "stable";
  readonly version: string;
  readonly minimumInstalledVersion: string;
  readonly publishedAt: string;
  readonly installer: ReleaseAsset;
  readonly sbom: ReleaseAsset;
}

export interface SignedReleaseManifest {
  readonly keyId: string;
  readonly algorithm: "ed25519";
  readonly payload: ReleaseManifestPayload;
  readonly signature: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
};

const compareVersions = (left: string, right: string) => {
  const parse = (value: string) => {
    const match = SEMVER.exec(value);
    if (!match)
      throw new Error("Release versions must be strict semantic versions");
    return match.slice(1).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
};

const assertAsset = (
  asset: ReleaseAsset,
  allowedHosts: ReadonlySet<string>,
) => {
  const parsed = new URL(asset.url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error(
      "Release assets require canonical HTTPS URLs without credentials or custom ports",
    );
  }
  if (!allowedHosts.has(parsed.hostname.toLocaleLowerCase())) {
    throw new Error("Release asset host is not allowlisted");
  }
  if (
    !SHA256.test(asset.sha256) ||
    !Number.isSafeInteger(asset.size) ||
    asset.size < 1
  ) {
    throw new Error("Release asset integrity metadata is invalid");
  }
};

export const verifyReleaseManifest = (
  manifest: SignedReleaseManifest,
  options: {
    readonly installedVersion: string;
    readonly publicKeys: Readonly<Record<string, string>>;
    readonly allowedHosts: readonly string[];
    readonly now?: Date;
  },
): ReleaseManifestPayload => {
  if (
    manifest.algorithm !== "ed25519" ||
    manifest.payload.schemaVersion !== 1 ||
    manifest.payload.product !== "Trivergence" ||
    manifest.payload.channel !== "stable"
  ) {
    throw new Error("Release manifest identity is invalid");
  }
  const key = options.publicKeys[manifest.keyId];
  if (!key) throw new Error("Release signing key is not pinned");
  if (
    compareVersions(manifest.payload.version, options.installedVersion) <= 0
  ) {
    throw new Error("Release manifest is not an upgrade");
  }
  if (
    compareVersions(
      manifest.payload.minimumInstalledVersion,
      options.installedVersion,
    ) > 0
  ) {
    throw new Error("Installed version is outside the supported update path");
  }
  const publishedAt = Date.parse(manifest.payload.publishedAt);
  const now = (options.now ?? new Date()).getTime();
  if (!Number.isFinite(publishedAt) || publishedAt > now + 300_000) {
    throw new Error("Release publication time is invalid");
  }
  const hosts = new Set(
    options.allowedHosts.map((host) => host.toLocaleLowerCase()),
  );
  assertAsset(manifest.payload.installer, hosts);
  assertAsset(manifest.payload.sbom, hosts);
  const signature = Buffer.from(manifest.signature, "base64");
  if (
    signature.byteLength !== 64 ||
    !verify(null, Buffer.from(canonicalize(manifest.payload)), key, signature)
  ) {
    throw new Error("Release manifest signature is invalid");
  }
  return manifest.payload;
};

export const verifyReleaseAsset = async (
  path: string,
  expected: Pick<ReleaseAsset, "sha256" | "size">,
): Promise<void> => {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size !== expected.size)
    throw new Error("Release asset size mismatch");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest("hex") !== expected.sha256)
    throw new Error("Release asset digest mismatch");
};

export const canonicalizeReleasePayload = canonicalize;
