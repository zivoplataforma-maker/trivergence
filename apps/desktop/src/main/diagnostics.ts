import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  diagnosticsSchema,
  type Diagnostics,
  type ProviderDetection,
  type ProviderId,
} from "@trivergence/contracts";

import { rendererSecurity } from "./security.js";

const execFileAsync = promisify(execFile);

const providers: ReadonlyArray<{
  id: ProviderId;
  displayName: string;
  command: string;
}> = [
  { id: "codex", displayName: "Codex", command: "codex" },
  { id: "claude", displayName: "Claude Code", command: "claude" },
  { id: "gemini", displayName: "Gemini CLI", command: "gemini" },
  { id: "ollama", displayName: "Ollama", command: "ollama" },
];

function sanitizeResolvedPath(value: string): string | undefined {
  const firstLine = value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || firstLine.length > 2_048 || !path.isAbsolute(firstLine)) {
    return undefined;
  }

  return path.normalize(firstLine);
}

async function detectProvider(
  provider: (typeof providers)[number],
): Promise<ProviderDetection> {
  try {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const whereExecutable = path.join(systemRoot, "System32", "where.exe");
    const { stdout } = await execFileAsync(
      whereExecutable,
      [provider.command],
      {
        encoding: "utf8",
        timeout: 1_500,
        windowsHide: true,
        maxBuffer: 16 * 1_024,
        env: {
          PATH: process.env.PATH,
          PATHEXT: process.env.PATHEXT,
          SystemRoot: process.env.SystemRoot,
        },
      },
    );
    const executablePath = sanitizeResolvedPath(stdout);

    if (!executablePath) {
      return {
        id: provider.id,
        displayName: provider.displayName,
        status: "unhealthy",
        reason:
          "El sistema devolvió una ruta no válida; no se ejecutó el proveedor.",
      };
    }

    return {
      id: provider.id,
      displayName: provider.displayName,
      executablePath,
      status: "installed_unverified",
      reason:
        "Instalación detectada. La versión y sus capacidades todavía no fueron verificadas.",
    };
  } catch {
    return {
      id: provider.id,
      displayName: provider.displayName,
      status: "not_installed",
      reason:
        "No se encontró el ejecutable en la ruta de búsqueda del sistema.",
    };
  }
}

export async function collectDiagnostics(
  appVersion: string,
): Promise<Diagnostics> {
  const detected = await Promise.all(providers.map(detectProvider));

  return diagnosticsSchema.parse({
    appVersion,
    platform: process.platform,
    arch: process.arch,
    providers: detected,
    rendererSecurity,
  });
}
