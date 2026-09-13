import { describe, expect, it } from "vitest";

import { DispatcherRegistry } from "@trivergence/runtime";
import type { PlannedStep } from "@trivergence/contracts";

import { AdapterHost } from "./adapter-host.js";
import { ProviderStepDispatcher } from "./provider-step-dispatcher.js";
import { ReferenceProviderAdapter } from "./reference-provider.js";

const requestId = "10000000-0000-4000-8000-000000000032";

const step = (capabilityId: string): PlannedStep => ({
  id: "step-1",
  capabilityId,
  subsystem: "provider",
  dependsOn: [],
  action: {
    id: "10000000-0000-4000-8000-000000000031",
    tool: "referenceProvider.promptStructured",
    toolVersion: "1.0.0",
    kinds: ["execute"],
    risk: "guarded",
    summary: "Local reference request",
    input: { prompt: "Test local dispatch" },
  },
  policy: {
    decision: "require_approval",
    reason: "Explicit approval required",
    matchedRule: "test-local-provider",
    rulesetVersion: "1",
  },
});

describe("AdapterHost", () => {
  it("resolves multiple provider capabilities through one dispatcher", () => {
    const host = new AdapterHost([
      {
        capabilityId: "provider.reference.prompt.structured",
        capabilityVersion: "1.0.0",
        adapter: new ReferenceProviderAdapter(),
      },
      {
        capabilityId: "provider.reference.review.structured",
        capabilityVersion: "1.0.0",
        adapter: new ReferenceProviderAdapter(),
      },
    ]);
    const dispatcher = new ProviderStepDispatcher({ host });
    const registry = new DispatcherRegistry([dispatcher]);

    expect(dispatcher.capabilityIds).toHaveLength(2);
    expect(
      registry.describe(step("provider.reference.review.structured"))
        .capabilityId,
    ).toBe("provider.reference.review.structured");
    expect(() =>
      host.prepare("provider.unknown.prompt", "request", {}),
    ).toThrow(/not hosted/u);
  });

  it("rejects duplicate provider capability registration", () => {
    expect(
      () =>
        new AdapterHost([
          {
            capabilityId: "provider.reference.prompt.structured",
            capabilityVersion: "1.0.0",
            adapter: new ReferenceProviderAdapter(),
          },
          {
            capabilityId: "provider.reference.prompt.structured",
            capabilityVersion: "1.0.0",
            adapter: new ReferenceProviderAdapter(),
          },
        ]),
    ).toThrow(/Duplicate hosted/u);
  });

  it("rejects a preview whose identity disagrees with the hosted manifest", () => {
    const reference = new ReferenceProviderAdapter();
    const host = new AdapterHost([
      {
        capabilityId: "provider.reference.prompt.structured",
        capabilityVersion: "1.0.0",
        adapter: {
          manifest: reference.manifest,
          prepare: (id, input) => {
            const prepared = reference.prepare(id, input);
            return {
              ...prepared,
              preview: { ...prepared.preview, providerId: "another-provider" },
            };
          },
          execute: reference.execute.bind(reference),
          recover: reference.recover.bind(reference),
        },
      },
    ]);
    expect(() =>
      host.prepare("provider.reference.prompt.structured", requestId, {
        prompt: "Check identity",
      }),
    ).toThrow(/preview does not match/u);
  });

  it("rejects result provenance that disagrees with the prepared request", async () => {
    const reference = new ReferenceProviderAdapter();
    const host = new AdapterHost([
      {
        capabilityId: "provider.reference.prompt.structured",
        capabilityVersion: "1.0.0",
        adapter: {
          manifest: reference.manifest,
          prepare: reference.prepare.bind(reference),
          execute: async (request, options) => {
            const result = await reference.execute(request, options);
            return {
              ...result,
              provenance: {
                ...result.provenance,
                providerId: "another-provider",
              },
            };
          },
          recover: reference.recover.bind(reference),
        },
      },
    ]);
    const prepared = host.prepare(
      "provider.reference.prompt.structured",
      requestId,
      { prompt: "Check provenance" },
    );
    await expect(
      host.execute("provider.reference.prompt.structured", prepared, {
        signal: new AbortController().signal,
        onEvent: () => undefined,
      }),
    ).rejects.toThrow(/provenance does not match/u);
  });
});
