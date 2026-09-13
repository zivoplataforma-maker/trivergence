import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalizeReleasePayload,
  externalUpdatesEnabled,
  verifyReleaseAsset,
  verifyReleaseManifest,
  type ReleaseManifestPayload,
  type SignedReleaseManifest,
} from "./update-security.js";

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  ),
);

const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const payload: ReleaseManifestPayload = {
  schemaVersion: 1,
  product: "Trivergence",
  channel: "stable",
  version: "0.8.0",
  minimumInstalledVersion: "0.7.0",
  publishedAt: "2026-09-10T12:00:00.000Z",
  installer: {
    url: "https://releases.trivergence.local/Trivergence.exe",
    sha256: "a".repeat(64),
    size: 100,
  },
  sbom: {
    url: "https://releases.trivergence.local/sbom.json",
    sha256: "b".repeat(64),
    size: 200,
  },
};
const signed = (value: ReleaseManifestPayload): SignedReleaseManifest => ({
  keyId: "release-2026",
  algorithm: "ed25519",
  payload: value,
  signature: sign(
    null,
    Buffer.from(canonicalizeReleasePayload(value)),
    keys.privateKey,
  ).toString("base64"),
});
const options = {
  installedVersion: "0.7.0",
  publicKeys: { "release-2026": publicKey },
  allowedHosts: ["releases.trivergence.local"],
  now: new Date("2026-09-10T12:05:00.000Z"),
};

describe("secure update boundary", () => {
  it("keeps external updates disabled and accepts a pinned valid manifest", () => {
    expect(externalUpdatesEnabled).toBe(false);
    expect(verifyReleaseManifest(signed(payload), options)).toEqual(payload);
  });

  it("rejects tampering, downgrade and non-HTTPS or unexpected hosts", () => {
    const manifest = signed(payload);
    expect(() =>
      verifyReleaseManifest(
        { ...manifest, payload: { ...payload, version: "0.9.0" } },
        options,
      ),
    ).toThrow("signature");
    expect(() =>
      verifyReleaseManifest(signed({ ...payload, version: "0.7.0" }), options),
    ).toThrow("not an upgrade");
    expect(() =>
      verifyReleaseManifest(
        signed({
          ...payload,
          installer: {
            ...payload.installer,
            url: "http://releases.trivergence.local/file.exe",
          },
        }),
        options,
      ),
    ).toThrow("HTTPS");
    expect(() =>
      verifyReleaseManifest(
        signed({
          ...payload,
          sbom: { ...payload.sbom, url: "https://evil.example/sbom.json" },
        }),
        options,
      ),
    ).toThrow("allowlisted");
  });

  it("verifies the downloaded asset size and digest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "trivergence-update-"));
    temporary.push(directory);
    const path = join(directory, "asset.bin");
    const content = Buffer.from("release asset");
    await writeFile(path, content);
    await expect(
      verifyReleaseAsset(path, {
        size: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      }),
    ).resolves.toBeUndefined();
    await expect(
      verifyReleaseAsset(path, {
        size: content.byteLength,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow("digest");
  });
});
