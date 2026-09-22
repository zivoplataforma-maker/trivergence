import { createHash } from "node:crypto";

import type {
  CapabilityDescriptor,
  OrchestrationRequest,
  ProjectContextSourceReference,
} from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  CapabilityRegistry,
  IntegrityEngine,
  ProjectContextBuilder,
} from "./index.js";

const NOW = "2026-09-22T12:00:00.000Z";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "20000000-0000-4000-8000-000000000001";
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const capability = (
  id: string,
  overrides: Partial<CapabilityDescriptor> = {},
): CapabilityDescriptor => ({
  id,
  version: "1",
  displayName: id,
  subsystem: "provider",
  status: "available",
  mode: "structured",
  action: {
    tool: id,
    toolVersion: "1",
    kinds: ["read"],
    risk: "safe",
    summary: `Execute ${id}`,
  },
  dependencies: [],
  routing: { objectiveTerms: ["reference"], priority: 50 },
  ...overrides,
});

const registry = new CapabilityRegistry("project-context-test-1", [
  capability("provider.reference.prompt"),
  capability("workspace.file.read", { subsystem: "tool" }),
]);
const integrity = new IntegrityEngine(sha256);
const builder = new ProjectContextBuilder(
  registry,
  () => integrity.createRegistrySnapshot(registry),
  sha256,
  () => new Date(NOW),
);
const request = (
  overrides: Partial<OrchestrationRequest> = {},
): OrchestrationRequest => ({
  id: REQUEST_ID,
  goal: "Use the local reference provider",
  profile: "observer",
  privacyMode: "standard",
  workspaceId: WORKSPACE_ID,
  requestedCapabilities: ["provider.reference.prompt"],
  ...overrides,
});
const source = (
  id: string,
  overrides: Partial<ProjectContextSourceReference> = {},
): ProjectContextSourceReference => ({
  kind: "workspace_resource",
  sourceId: id,
  workspaceId: WORKSPACE_ID,
  version: "1",
  digest: sha256(`source:${id}`),
  trust: "untrusted_data",
  provenance: {
    origin: "workspace",
    observedAt: NOW,
    digest: sha256(`provenance:${id}`),
  },
  ...overrides,
});
const options = {
  workspaceFingerprint: sha256("workspace"),
  createdAt: NOW,
  retentionDays: 30,
  budgetLimits: {
    maxAgents: 2,
    maxProviderCalls: 3,
    maxOutputBytes: 8_192,
    maxMemoryItems: 2,
    maxMemoryBytes: 4_096,
    timeoutMs: 5_000,
    maxReplans: 1,
  },
} as const;

describe("ProjectContextBuilder", () => {
  it("creates a deterministic snapshot for identical authorized inputs", () => {
    const snapshot = builder.build(request(), options);
    expect(snapshot).toEqual(builder.build(request(), options));
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.governance)).toBe(true);
  });

  it("changes revision and digest when relevant context changes", () => {
    const first = builder.build(request(), { ...options, revision: 1 });
    const second = builder.build(
      request({ goal: "Use a changed local objective" }),
      { ...options, contextId: first.id, revision: 2 },
    );
    expect(second.revision).toBe(2);
    expect(second.id).toBe(first.id);
    expect(second.digest).not.toBe(first.digest);
  });

  it("normalizes incidental source ordering", () => {
    const a = source("resource:a");
    const b = source("resource:b");
    expect(
      builder.build(request(), { ...options, sources: [a, b] }).digest,
    ).toBe(builder.build(request(), { ...options, sources: [b, a] }).digest);
  });

  it("fails closed for a cross-workspace reference", () => {
    expect(() =>
      builder.build(request(), {
        ...options,
        sources: [
          source("foreign", {
            workspaceId: "30000000-0000-4000-8000-000000000001",
          }),
        ],
      }),
    ).toThrow(/another workspace/u);
  });

  it("rejects credential-shaped material", () => {
    expect(() =>
      builder.build(request(), {
        ...options,
        sources: [source("sk-abcdefghijklmnop")],
      }),
    ).toThrow(/credential material/u);
  });

  it("fails closed for an unavailable or unknown capability", () => {
    expect(() =>
      builder.build(
        request({ requestedCapabilities: ["provider.unknown.prompt"] }),
        options,
      ),
    ).toThrow(/not authorized/u);
  });

  it("fails closed for an invalid source reference", () => {
    expect(() =>
      builder.build(request(), {
        ...options,
        sources: [{ ...source("invalid"), digest: "not-a-digest" }],
      }),
    ).toThrow();
  });

  it("enforces the canonical context size limit", () => {
    const sources = Array.from({ length: 64 }, (_, index) =>
      source(`resource:${String(index).padStart(3, "0")}${"x".repeat(80)}`, {
        version: "v".repeat(80),
      }),
    );
    expect(() => builder.build(request(), { ...options, sources })).toThrow(
      /exceeds 16384 bytes/u,
    );
  });

  it("uses canonical serialization for the published digest", () => {
    const snapshot = builder.build(request(), options);
    const { digest, ...unsigned } = snapshot;
    expect(digest).toBe(sha256(canonicalizeJson(unsigned)));
  });

  it("preserves source and builder provenance", () => {
    const extra = source("resource:provenance");
    const snapshot = builder.build(request(), { ...options, sources: [extra] });
    expect(snapshot.sources).toContainEqual(extra);
    expect(snapshot.provenance.sourceDigests).toContain(extra.digest);
    expect(snapshot.provenance.builderVersion).toBe("1");
  });

  it("represents budget limits without duplicating runtime consumption", () => {
    const snapshot = builder.build(request(), options);
    expect(snapshot.budget.limits).toEqual(options.budgetLimits);
    expect(snapshot.budget.consumptionAuthority).toBe("runtime");
    expect(snapshot.budget).not.toHaveProperty("usage");
  });

  it("does not let source data alter policy governance", () => {
    const snapshot = builder.build(request(), {
      ...options,
      sources: [source("policy:developer")],
    });
    expect(snapshot.governance.profile).toBe("observer");
  });

  it("keeps external content classified as untrusted data", () => {
    const snapshot = builder.build(request(), {
      ...options,
      sources: [source("resource:instructions")],
    });
    expect(
      snapshot.sources.find((item) => item.sourceId === "resource:instructions")
        ?.trust,
    ).toBe("untrusted_data");
  });

  it("works with the local Reference Provider as the only provider", () => {
    const snapshot = builder.build(request(), options);
    expect(snapshot.capabilities.references.map((item) => item.id)).toEqual([
      "provider.reference.prompt",
    ]);
  });
});
