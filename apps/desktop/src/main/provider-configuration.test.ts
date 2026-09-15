import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProviderConfigurationService,
  defaultProviderPreferences,
} from "./provider-configuration.js";

const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "trivergence-preferences-"));
  directories.push(directory);
  return { directory, service: new ProviderConfigurationService(directory) };
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("provider configuration boundary", () => {
  it("keeps installation, authentication, gate and execution independent", () => {
    const { service } = fixture();
    const state = service.snapshot([
      {
        id: "codex",
        displayName: "Codex",
        status: "installed_unverified",
        reason: "Located",
      },
    ]);
    expect(state.providers[0]).toMatchObject({
      installation: "detected",
      authentication: "not_checked",
      gate: "pending",
      availability: "unavailable",
      executionEnabled: false,
      blocked: true,
    });
    expect(
      state.providers.find((provider) => provider.id === "ollama")
        ?.authentication,
    ).toBe("not_required");
  });
  it("persists preferences across service instances without granting authority", () => {
    const { directory, service } = fixture();
    const preferences = {
      ...defaultProviderPreferences(),
      preferredProviderId: "ollama",
      ollama: { endpoint: "http://localhost:11434", model: "qwen:7b" },
    };
    service.save(preferences);
    const restarted = new ProviderConfigurationService(directory).snapshot();
    expect(restarted.preferences).toEqual(preferences);
    expect(
      restarted.providers.every(
        (provider) =>
          provider.blocked &&
          !provider.executionEnabled &&
          provider.gate === "pending",
      ),
    ).toBe(true);
  });
  it.each([
    "apiKey",
    "accessToken",
    "gate",
    "executionEnabled",
    "authentication",
  ])("rejects injected %s", (field) => {
    const { service } = fixture();
    expect(() =>
      service.save({ ...defaultProviderPreferences(), [field]: "injected" }),
    ).toThrow();
  });
  it.each([
    "https://ollama.com",
    "http://192.168.1.1:11434",
    "http://localhost.evil:11434",
    "http://user" + ":password@localhost:11434",
    "http://127.0.0.1:11434/api?token=x",
  ])("rejects non-local or credential-bearing endpoint %s", (endpoint) => {
    const { service } = fixture();
    expect(() =>
      service.save({
        ...defaultProviderPreferences(),
        ollama: { endpoint, model: "" },
      }),
    ).toThrow();
  });
  it("rejects unknown providers, nested keys and unbounded models", () => {
    const { service } = fixture();
    expect(() =>
      service.save({
        ...defaultProviderPreferences(),
        preferredProviderId: "unregistered",
      }),
    ).toThrow();
    expect(() =>
      service.save({
        ...defaultProviderPreferences(),
        ollama: { ...defaultProviderPreferences().ollama, apiKey: "test" },
      }),
    ).toThrow();
    expect(() =>
      service.save({
        ...defaultProviderPreferences(),
        ollama: {
          ...defaultProviderPreferences().ollama,
          model: "x".repeat(121),
        },
      }),
    ).toThrow();
  });
  it("preserves corrupt data in read-only mode instead of silently overwriting", () => {
    const { directory, service } = fixture();
    const file = join(directory, "provider-preferences.json");
    writeFileSync(file, "{broken", "utf8");
    expect(service.snapshot().storage).toBe("read_only");
    expect(() => service.save(defaultProviderPreferences())).toThrow();
    expect(readFileSync(file, "utf8")).toBe("{broken");
  });
  it("preserves existing preferences after invalid updates", () => {
    const { service } = fixture();
    service.save({
      ...defaultProviderPreferences(),
      preferredProviderId: "codex",
    });
    expect(() => service.save({ version: 2 })).toThrow();
    expect(service.snapshot().preferences.preferredProviderId).toBe("codex");
  });
});
