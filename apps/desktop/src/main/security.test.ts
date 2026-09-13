import path from "node:path";

import { describe, expect, it } from "vitest";

import { isPathInside, isTrustedRendererUrl } from "./security.js";

describe("isTrustedRendererUrl", () => {
  it("accepts only the production app origin", () => {
    expect(isTrustedRendererUrl("trivergence://app/index.html")).toBe(true);
    expect(isTrustedRendererUrl("trivergence://evil/index.html")).toBe(false);
    expect(isTrustedRendererUrl("https://app/index.html")).toBe(false);
  });

  it("accepts an explicit development origin without prefix matching", () => {
    const development = "http://127.0.0.1:5173";
    expect(
      isTrustedRendererUrl("http://127.0.0.1:5173/page", development),
    ).toBe(true);
    expect(
      isTrustedRendererUrl("http://127.0.0.1:51730/page", development),
    ).toBe(false);
  });
});

describe("isPathInside", () => {
  it("rejects traversal outside the renderer root", () => {
    const root = path.resolve("C:/app/renderer");
    expect(isPathInside(root, path.join(root, "index.html"))).toBe(true);
    expect(isPathInside(root, path.resolve(root, "../secret.txt"))).toBe(false);
  });
});
