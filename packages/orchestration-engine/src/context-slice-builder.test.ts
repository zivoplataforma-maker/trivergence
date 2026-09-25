import { createHash, randomUUID } from "node:crypto";

import {
  contextSliceManifestSchema,
  type ProjectContextSnapshot,
} from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import { canonicalizeJson, ContextSliceBuilder } from "./index.js";

const NOW = "2026-09-25T12:00:00.000Z";
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const REQUEST = "20000000-0000-4000-8000-000000000001";
const CONTEXT = "30000000-0000-4000-8000-000000000001";
const SLICE = "40000000-0000-4000-8000-000000000001";

const projectContext = (): ProjectContextSnapshot => ({
  schemaVersion: "1",
  id: CONTEXT,
  revision: 2,
  createdAt: NOW,
  workspace: { id: WORKSPACE, fingerprint: sha256("workspace") },
  objective: {
    requestId: REQUEST,
    goalDigest: sha256("goal"),
    restrictionReferences: [],
  },
  governance: {
    profile: "observer",
    privacyMode: "standard",
    retentionDays: 30,
    restrictions: [
      "mandatory_exclusions",
      "no_credential_material",
      "untrusted_content_is_data",
      "workspace_root_only",
    ],
  },
  capabilities: {
    registrySnapshot: {
      id: sha256("registry"),
      version: "1",
      capabilityCount: 2,
    },
    references: ["runtime.branch.a", "runtime.branch.b"].map((id) => ({
      id,
      version: "1",
      status: "available" as const,
      descriptorDigest: sha256(id),
    })),
  },
  budget: {
    limits: {
      maxAgents: 3,
      maxProviderCalls: 4,
      maxOutputBytes: 65_536,
      maxMemoryItems: 0,
      maxMemoryBytes: 0,
      timeoutMs: 10_000,
      maxReplans: 0,
    },
    consumptionAuthority: "runtime",
  },
  sources: ["resource:a", "resource:b"].map((sourceId) => ({
    kind: "workspace_resource" as const,
    sourceId,
    workspaceId: WORKSPACE,
    version: "1",
    digest: sha256(sourceId),
    trust: "untrusted_data" as const,
    provenance: {
      origin: "workspace" as const,
      observedAt: NOW,
      digest: sha256(`provenance:${sourceId}`),
    },
  })),
  provenance: {
    builderVersion: "1",
    canonicalizationVersion: "1",
    inputDigest: sha256("input"),
    sourceDigests: [sha256("resource:a"), sha256("resource:b")],
  },
  digest: sha256("context"),
});

const builder = new ContextSliceBuilder(sha256, () => new Date(NOW));
const build = (overrides: Record<string, unknown> = {}) =>
  builder.build(projectContext(), {
    id: SLICE,
    groupId: "group-1",
    branchId: "branch-a",
    sourceIds: ["resource:a"],
    capabilityIds: ["runtime.branch.a"],
    createdAt: NOW,
    ...overrides,
  });

describe("ContextSliceBuilder", () => {
  it("builds a deterministic immutable slice", () => {
    expect(build()).toEqual(build());
    expect(Object.isFrozen(build())).toBe(true);
  });

  it("normalizes incidental source and capability ordering", () => {
    const first = build({
      sourceIds: ["resource:b", "resource:a"],
      capabilityIds: ["runtime.branch.b", "runtime.branch.a"],
    });
    const second = build({
      sourceIds: ["resource:a", "resource:b"],
      capabilityIds: ["runtime.branch.a", "runtime.branch.b"],
    });
    expect(first.digest).toBe(second.digest);
  });

  it("changes digest when the participant binding changes", () => {
    expect(build({ branchId: "branch-b" }).digest).not.toBe(build().digest);
  });

  it("contains references instead of copied project context", () => {
    const serialized = canonicalizeJson(build());
    expect(serialized).not.toContain("maxProviderCalls");
    expect(build().sourceReferences).toHaveLength(1);
  });

  it("preserves explicit upstream evidence provenance", () => {
    const upstream = {
      stepId: "step-parent",
      evidenceId: randomUUID(),
      outputDigest: sha256("output"),
    };
    expect(
      build({ upstreamResultReferences: [upstream] }).upstreamResultReferences,
    ).toEqual([upstream]);
  });

  it.each([
    ["missing source", { sourceIds: ["resource:missing"] }],
    ["missing capability", { capabilityIds: ["runtime.missing"] }],
  ])("fails closed for %s", (_name, overrides) => {
    expect(() => build(overrides)).toThrow(/missing|unauthorized/u);
  });

  it("rejects cross-workspace references at schema boundary", () => {
    const slice = build();
    expect(() =>
      contextSliceManifestSchema.parse({
        ...slice,
        sourceReferences: [
          { ...slice.sourceReferences[0], workspaceId: randomUUID() },
        ],
      }),
    ).toThrow(/cross workspaces/u);
  });

  it.each([
    ["workspace", { workspaceId: randomUUID() }],
    ["objective", { objectiveRequestId: randomUUID() }],
    ["branch", { branchId: "branch-b" }],
    ["group", { groupId: "group-b" }],
    [
      "context revision",
      { projectContext: { ...build().projectContext, revision: 9 } },
    ],
  ])("verification rejects %s substitution", (_name, mutation) => {
    expect(() =>
      builder.verify(
        { ...build(), ...mutation },
        projectContext(),
        "branch-a",
        "group-1",
      ),
    ).toThrow();
  });

  it("verification rejects expiration", () => {
    expect(() =>
      builder.verify(
        build({ expiresAt: "2026-09-25T12:00:01.000Z" }),
        projectContext(),
        "branch-a",
        "group-1",
        new Date("2026-09-25T12:00:02.000Z"),
      ),
    ).toThrow(/stale|inconsistent/u);
  });

  it("verification rejects tampering without digest replacement", () => {
    expect(() =>
      builder.verify(
        { ...build(), phase: "fan_in" },
        projectContext(),
        "branch-a",
        "group-1",
      ),
    ).toThrow(/digest/u);
  });
});
