import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  providerConfigurationSchema,
  providerPreferencesSchema,
  type ProviderConfiguration,
  type ProviderDetection,
  type ProviderPreferences,
} from "@trivergence/contracts";

const definitions = [
  {
    id: "codex",
    displayName: "ChatGPT / Codex",
    method: "managed_login",
    guidance:
      "Login gestionado por Codex App Server. Pendiente de validar el adaptador y su gate; no se leen sesiones existentes.",
  },
  {
    id: "gemini",
    displayName: "Gemini",
    method: "official_oauth",
    guidance:
      "OAuth oficial sujeto a requisitos de Google y al gate. Detectar Gemini CLI no autoriza reutilizar su sesión ni la cuota de una suscripción.",
  },
  {
    id: "claude",
    displayName: "Claude",
    method: "official_oauth",
    guidance:
      "Ruta oficial sin key pendiente de aprobación. Una instalación de Claude Code no autoriza a Trivergence a usar sus credenciales o suscripción.",
  },
  {
    id: "ollama",
    displayName: "Ollama local",
    method: "local_service",
    guidance:
      "Servicio local sin cuenta. Solo se guardan dirección y modelo; no se consulta el servicio, descarga un modelo ni permite ejecución cloud.",
  },
] as const;

export const defaultProviderPreferences = (): ProviderPreferences => ({
  version: 1,
  preferredProviderId: null,
  ollama: { endpoint: "http://127.0.0.1:11434", model: "" },
});

/** No adapter, network, credential reader or gate writer is available here. */
export class ProviderConfigurationService {
  readonly #file: string;
  #readOnly = false;
  constructor(directory: string) {
    this.#file = path.join(directory, "provider-preferences.json");
  }

  #read(): ProviderPreferences {
    try {
      if (!existsSync(this.#file)) return defaultProviderPreferences();
      const stat = lstatSync(this.#file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384)
        throw new Error("Unsafe preferences");
      return this.#validate(JSON.parse(readFileSync(this.#file, "utf8")));
    } catch {
      this.#readOnly = true;
      return defaultProviderPreferences();
    }
  }

  #validate(input: unknown): ProviderPreferences {
    const preferences = providerPreferencesSchema.parse(input);
    if (
      preferences.preferredProviderId !== null &&
      !definitions.some((entry) => entry.id === preferences.preferredProviderId)
    ) {
      throw new Error("Proveedor no registrado en la configuración.");
    }
    return preferences;
  }

  snapshot(
    detections: readonly ProviderDetection[] = [],
  ): ProviderConfiguration {
    const preferences = this.#read();
    return providerConfigurationSchema.parse({
      preferences,
      storage: this.#readOnly ? "read_only" : "ready",
      notice: this.#readOnly
        ? "Preferencias no legibles. Se muestran valores seguros sin sobrescribir el archivo; requiere revisión local."
        : "Preferencias locales, sin credenciales. Guardar no conecta ni habilita proveedores.",
      providers: definitions.map((entry) => {
        const detection = detections.find(
          (candidate) => candidate.id === entry.id,
        );
        return {
          ...entry,
          installation:
            detection?.status === "installed_unverified"
              ? "detected"
              : detection?.status === "not_installed"
                ? "not_detected"
                : "unknown",
          authentication:
            entry.id === "ollama" ? "not_required" : "not_checked",
          gate: "pending",
          executionEnabled: false,
          blocked: true,
          blockers: [
            "Gate de integración pendiente.",
            "Adaptador de ejecución no habilitado en esta versión.",
          ],
        };
      }),
    });
  }

  save(input: unknown): void {
    const preferences = this.#validate(input);
    this.#read();
    if (this.#readOnly)
      throw new Error(
        "Preferencias protegidas: no se sobrescribirá el archivo dañado.",
      );
    const temporary = `${this.#file}.${randomUUID()}.tmp`;
    let descriptor: number | undefined;
    try {
      descriptor = openSync(temporary, "wx", 0o600);
      writeFileSync(descriptor, JSON.stringify(preferences, null, 2), "utf8");
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporary, this.#file);
    } catch {
      throw new Error(
        "No se pudieron guardar las preferencias. La configuración anterior se conserva.",
      );
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }
}
