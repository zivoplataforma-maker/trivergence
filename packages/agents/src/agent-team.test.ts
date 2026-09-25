import { createHash, randomUUID } from "node:crypto";

import {
  coordinationBudgetSchema,
  memoryRecallResultSchema,
} from "@trivergence/coordination-contracts";
import {
  AdapterHost,
  ReferenceProviderAdapter,
  referenceProviderCapabilityId,
  type ProviderAdapter,
} from "@trivergence/provider-adapters";
import { describe, expect, it } from "vitest";
import { AgentProfileCatalog } from "@trivergence/orchestration-engine";

import { AgentTeam } from "./agent-team.js";
import { createAgentProfileCatalog, initialAgentProfiles } from "./profiles.js";

const ZERO_DIGEST = "0".repeat(64);
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const hosted = (adapter: ProviderAdapter) =>
  new AdapterHost([
    {
      capabilityId: referenceProviderCapabilityId,
      capabilityVersion: "1.0.0",
      adapter,
    },
  ]);

describe("AgentTeam", () => {
  it("runs bounded roles with Reference Provider provenance", async () => {
    const team = new AgentTeam(
      hosted(new ReferenceProviderAdapter()),
      referenceProviderCapabilityId,
    );
    const result = await team.execute({
      goal: "Producir una síntesis local verificable",
      memory: memoryRecallResultSchema.parse({
        schemaVersion: "1",
        namespace: randomUUID(),
        items: [],
        bytes: 0,
        truncated: false,
        provenanceDigest: ZERO_DIGEST,
      }),
      budget: coordinationBudgetSchema.parse({}),
      signal: new AbortController().signal,
    });

    expect(result.contributions.map((item) => item.role)).toEqual([
      "planner",
      "critic",
      "synthesizer",
    ]);
    expect(result.providerCalls).toBe(3);
    expect(result.costMicrounits).toBe(0);
    expect(result.contributions.every((item) => item.localOnly)).toBe(true);
  });

  it("rejects external providers and provider-call overcommit", async () => {
    const candidate = new ReferenceProviderAdapter();
    const external = {
      manifest: {
        ...candidate.manifest,
        providerId: "codex",
        localOnly: false,
      },
      prepare: candidate.prepare.bind(candidate),
      execute: candidate.execute.bind(candidate),
      recover: candidate.recover.bind(candidate),
    } as ProviderAdapter;
    expect(
      () => new AgentTeam(hosted(external), referenceProviderCapabilityId),
    ).toThrow(/only permits/u);

    const team = new AgentTeam(
      hosted(candidate),
      referenceProviderCapabilityId,
    );
    await expect(
      team.execute({
        goal: "No exceder el presupuesto",
        memory: memoryRecallResultSchema.parse({
          schemaVersion: "1",
          namespace: randomUUID(),
          items: [],
          bytes: 0,
          truncated: false,
          provenanceDigest: ZERO_DIGEST,
        }),
        budget: coordinationBudgetSchema.parse({
          maxAgents: 2,
          maxProviderCalls: 1,
        }),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/provider call budget/u);
  });

  it("fails closed when the aggregate input budget is exhausted", async () => {
    const team = new AgentTeam(
      hosted(new ReferenceProviderAdapter()),
      referenceProviderCapabilityId,
    );
    await expect(
      team.execute({
        goal: "x".repeat(2_048),
        memory: memoryRecallResultSchema.parse({
          schemaVersion: "1",
          namespace: randomUUID(),
          items: [],
          bytes: 0,
          truncated: false,
          provenanceDigest: ZERO_DIGEST,
        }),
        budget: coordinationBudgetSchema.parse({ maxInputBytes: 256 }),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/budget/u);
  });

  it("keeps exact profile identity in sequential contribution provenance", async () => {
    const profiles = createAgentProfileCatalog(sha256).boundProfiles(
      "agent.reference.team",
    );
    const team = new AgentTeam(
      hosted(new ReferenceProviderAdapter()),
      referenceProviderCapabilityId,
      { profiles },
    );
    const result = await team.execute({
      goal: "Verificar provenance declarativa",
      memory: memoryRecallResultSchema.parse({
        schemaVersion: "1",
        namespace: randomUUID(),
        items: [],
        bytes: 0,
        truncated: false,
        provenanceDigest: ZERO_DIGEST,
      }),
      budget: coordinationBudgetSchema.parse({}),
      signal: new AbortController().signal,
    });
    expect(result.contributions.map((item) => item.profile?.profileId)).toEqual(
      profiles.map((profile) => profile.profileId),
    );
    expect(result.contributions.map((item) => item.role)).toEqual([
      "planner",
      "critic",
      "synthesizer",
    ]);
  });

  it("rejects plan profile substitution before provider dispatch", () => {
    const profiles = createAgentProfileCatalog(sha256).boundProfiles(
      "agent.reference.team",
    );
    const team = new AgentTeam(
      hosted(new ReferenceProviderAdapter()),
      referenceProviderCapabilityId,
      { profiles },
    );
    const refs = profiles.map((profile) => ({
      profileId: profile.profileId,
      revision: profile.revision,
      digest: profile.digest,
    }));
    expect(team.matchesReferences(refs)).toBe(true);
    expect(
      team.matchesReferences([
        { ...refs[0]!, digest: ZERO_DIGEST },
        ...refs.slice(1),
      ]),
    ).toBe(false);
  });

  it("uses profile limits only to restrict the shared budget", async () => {
    const restrictive = initialAgentProfiles.map((profile, index) =>
      index === 0
        ? { ...profile, budget: { ...profile.budget, maxOutputBytes: 1 } }
        : profile,
    );
    const profiles = new AgentProfileCatalog(
      restrictive,
      {
        "agent.reference.team": restrictive.map((profile) => profile.profileId),
      },
      sha256,
    ).boundProfiles("agent.reference.team");
    const team = new AgentTeam(
      hosted(new ReferenceProviderAdapter()),
      referenceProviderCapabilityId,
      { profiles },
    );
    await expect(
      team.execute({
        goal: "No ampliar el budget",
        memory: memoryRecallResultSchema.parse({
          schemaVersion: "1",
          namespace: randomUUID(),
          items: [],
          bytes: 0,
          truncated: false,
          provenanceDigest: ZERO_DIGEST,
        }),
        budget: coordinationBudgetSchema.parse({ maxOutputBytes: 65_536 }),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/budget/u);
  });

  it("rejects repair against a substituted synthesis profile", async () => {
    const team = new AgentTeam(
      hosted(new ReferenceProviderAdapter()),
      referenceProviderCapabilityId,
    );
    await expect(
      team.repair({
        goal: "Reparar",
        candidate: "Candidato",
        budget: coordinationBudgetSchema.parse({}),
        signal: new AbortController().signal,
        profile: {
          profileId: "agent.profile.synthesis",
          revision: 1,
          digest: ZERO_DIGEST,
        },
      }),
    ).rejects.toThrow(/unavailable/u);
  });
});
