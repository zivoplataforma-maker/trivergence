import { createHash, randomUUID } from "node:crypto";

import {
  agentProfileSchema,
  type AgentProfile,
  type CapabilityDescriptor,
} from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import { AgentProfileCatalog } from "./agent-profile-catalog.js";
import { CapabilityRegistry } from "./capability-registry.js";
import { OrchestrationEngine } from "./orchestration-engine.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const workspaceId = "20000000-0000-4000-8000-000000000001";
const agentCapabilityId = "agent.team.local";
const providerCapabilityId = "provider.local.structured";
const profileId = "agent.profile.review";

const capability = (
  id: string,
  subsystem: CapabilityDescriptor["subsystem"],
  status: CapabilityDescriptor["status"] = "available",
): CapabilityDescriptor => ({
  id,
  version: "1",
  displayName: id,
  subsystem,
  status,
  mode: "structured",
  action: {
    tool: id,
    toolVersion: "1",
    kinds: ["execute"],
    risk: "guarded",
    summary: id,
  },
  dependencies: [],
});

const definition = (): Omit<AgentProfile, "digest"> => ({
  schemaVersion: "1",
  profileId,
  revision: 1,
  responsibility: "reviewer",
  guidance: "Revisar el resultado sin conceder permisos.",
  requiredCapabilities: [
    {
      subsystem: "provider",
      mode: "structured",
      actionKinds: ["execute"],
      networkAllowed: false,
    },
  ],
  optionalCapabilities: [
    {
      subsystem: "tool",
      mode: "structured",
      actionKinds: ["read"],
      networkAllowed: false,
    },
  ],
  constraints: {
    allowedActionKinds: ["execute"],
    networkAllowed: false,
    requireObjective: true,
    requireWorkspace: true,
  },
  budget: {
    maxExecutions: 1,
    maxInputBytes: 512,
    maxOutputBytes: 512,
    timeoutMs: 1_000,
    maxCostMicrounits: 0,
  },
  provenance: { publisher: "test", version: "1" },
});

const catalog = (profile = definition()) =>
  new AgentProfileCatalog(
    [profile],
    { [agentCapabilityId]: [profile.profileId] },
    sha256,
  );

const preview = (
  profiles = catalog(),
  providerStatus: CapabilityDescriptor["status"] = "available",
) => {
  const registry = new CapabilityRegistry("profile-test-1", [
    capability(providerCapabilityId, "provider", providerStatus),
    capability(agentCapabilityId, "agent"),
  ]);
  const engine = new OrchestrationEngine(
    registry,
    randomUUID,
    sha256,
    profiles,
  );
  return {
    engine,
    preview: engine.preview({
      id: randomUUID(),
      goal: "Revisar un resultado",
      profile: "assistant",
      workspaceId,
      privacyMode: "standard",
      requestedCapabilities: [agentCapabilityId],
    }),
  };
};

describe("AgentProfileCatalog", () => {
  it("selects a declarative profile and binds exact revision/digest in the plan", () => {
    const result = preview();
    expect(result.preview.strategy.kind).toBe("direct");
    expect(result.preview.plan.steps[0]?.agentProfiles).toEqual([
      expect.objectContaining({ profileId, revision: 1 }),
    ]);
    expect(result.engine.revalidate(result.preview).valid).toBe(true);
  });

  it("fails closed for an unknown profile identity", () => {
    expect(() =>
      catalog().resolve({
        profileId: "agent.profile.missing",
        revision: 1,
        digest: "0".repeat(64),
      }),
    ).toThrow(/unavailable/u);
  });

  it("rejects a stale revision", () => {
    const selected = preview().preview.plan.steps[0]!.agentProfiles![0]!;
    expect(() => catalog().resolve({ ...selected, revision: 2 })).toThrow(
      /unavailable/u,
    );
  });

  it("rejects a wrong digest", () => {
    const selected = preview().preview.plan.steps[0]!.agentProfiles![0]!;
    expect(() =>
      catalog().resolve({ ...selected, digest: "0".repeat(64) }),
    ).toThrow(/unavailable/u);
  });

  it("canonicalizes incidental requirement order", () => {
    const first = definition();
    const second = {
      ...first,
      optionalCapabilities: [...first.optionalCapabilities].reverse(),
      constraints: {
        ...first.constraints,
        allowedActionKinds: [...first.constraints.allowedActionKinds].reverse(),
      },
    };
    expect(catalog(first).boundProfiles(agentCapabilityId)[0]?.digest).toBe(
      catalog(second).boundProfiles(agentCapabilityId)[0]?.digest,
    );
  });

  it("changes digest for a material budget or guidance change", () => {
    const first = catalog().boundProfiles(agentCapabilityId)[0]!.digest;
    expect(
      catalog({
        ...definition(),
        guidance: "Otra responsabilidad",
      }).boundProfiles(agentCapabilityId)[0]?.digest,
    ).not.toBe(first);
    expect(
      catalog({
        ...definition(),
        budget: { ...definition().budget, maxOutputBytes: 256 },
      }).boundProfiles(agentCapabilityId)[0]?.digest,
    ).not.toBe(first);
  });

  it("rejects hidden provider binding and untrusted authority fields", () => {
    expect(() =>
      agentProfileSchema.parse({
        ...catalog().boundProfiles(agentCapabilityId)[0],
        providerId: "reference",
      }),
    ).toThrow();
    expect(() =>
      agentProfileSchema.parse({
        ...catalog().boundProfiles(agentCapabilityId)[0],
        grantPolicy: true,
      }),
    ).toThrow();
  });

  it("blocks a required capability when unavailable", () => {
    const result = preview(catalog(), "unavailable");
    expect(result.preview.strategy.kind).toBe("unavailable");
    expect(result.preview.plan.steps).toHaveLength(0);
  });

  it("does not require an absent optional capability", () => {
    expect(preview().preview.plan.steps[0]?.agentProfiles).toHaveLength(1);
  });

  it("rejects a profile substitution after planning", () => {
    const result = preview();
    const changed = catalog({
      ...definition(),
      revision: 2,
      guidance: "Otra guía",
    });
    const step = result.preview.plan.steps[0]!;
    const registry = new CapabilityRegistry("profile-test-1", [
      capability(providerCapabilityId, "provider"),
      capability(agentCapabilityId, "agent"),
    ]);
    expect(() =>
      changed.assertStep(step, result.preview.projectContext, registry),
    ).toThrow(/binding changed/u);
  });

  it("does not allow a profile constraint to expand a planned action", () => {
    const restrictive = catalog({
      ...definition(),
      constraints: {
        ...definition().constraints,
        allowedActionKinds: ["read"],
      },
    });
    expect(preview(restrictive).preview.strategy.kind).toBe("unavailable");
  });

  it("does not turn capability eligibility into Policy authorization", () => {
    const result = preview();
    expect(result.preview.plan.steps[0]?.agentProfiles).toHaveLength(1);
    expect(result.preview.plan.steps[0]?.policy.decision).toBe(
      "require_approval",
    );
  });

  it("rejects an incompatible workspace context", () => {
    const result = preview();
    const registry = new CapabilityRegistry("profile-test-1", [
      capability(providerCapabilityId, "provider"),
      capability(agentCapabilityId, "agent"),
    ]);
    expect(() =>
      catalog().selectForStep(
        registry.get(agentCapabilityId)!,
        {
          ...result.preview.projectContext,
          workspace: {
            ...result.preview.projectContext.workspace,
            id: "00000000-0000-4000-8000-000000000000",
          },
        },
        registry,
      ),
    ).toThrow(/ineligible/u);
  });

  it("rejects duplicate profile identities and duplicate bindings", () => {
    expect(
      () => new AgentProfileCatalog([definition(), definition()], {}, sha256),
    ).toThrow(/Duplicate/u);
    expect(
      () =>
        new AgentProfileCatalog(
          [definition()],
          { [agentCapabilityId]: [profileId, profileId] },
          sha256,
        ),
    ).toThrow(/Invalid/u);
  });

  it("never embeds a provider identity in a profile reference", () => {
    const reference = preview().preview.plan.steps[0]?.agentProfiles?.[0];
    expect(Object.keys(reference ?? {}).sort()).toEqual([
      "digest",
      "profileId",
      "revision",
    ]);
    expect(
      JSON.stringify(catalog().boundProfiles(agentCapabilityId)),
    ).not.toContain("reference");
  });

  it("does not let profile network preference override private routing", () => {
    const permissive = catalog({
      ...definition(),
      constraints: {
        ...definition().constraints,
        networkAllowed: true,
        allowedActionKinds: ["execute", "network"],
      },
    });
    const registry = new CapabilityRegistry("profile-test-1", [
      capability(providerCapabilityId, "provider"),
      {
        ...capability(agentCapabilityId, "agent"),
        action: {
          ...capability(agentCapabilityId, "agent").action,
          kinds: ["execute", "network"],
        },
      },
    ]);
    const engine = new OrchestrationEngine(
      registry,
      randomUUID,
      sha256,
      permissive,
    );
    const result = engine.preview({
      id: randomUUID(),
      goal: "Revisar con red",
      profile: "assistant",
      workspaceId,
      privacyMode: "private",
      requestedCapabilities: [agentCapabilityId],
    });
    expect(result.strategy.kind).toBe("unavailable");
    expect(result.strategy.candidates?.[0]?.status).toBe("privacy_blocked");
  });
});
