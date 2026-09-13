import path from "node:path";

export const PRODUCTION_RENDERER_ORIGIN = "trivergence://app";
export const rendererSecurity = Object.freeze({
  contextIsolation: true as const,
  nodeIntegration: false as const,
  sandbox: true as const,
});

export function isTrustedRendererUrl(
  rawUrl: string,
  developmentOrigin?: string,
): boolean {
  try {
    const candidate = new URL(rawUrl);

    if (
      candidate.protocol === "trivergence:" &&
      candidate.hostname === "app" &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.port === ""
    ) {
      return true;
    }

    if (developmentOrigin) {
      const development = new URL(developmentOrigin);
      return candidate.origin === development.origin;
    }

    return false;
  } catch {
    return false;
  }
}

export function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}
