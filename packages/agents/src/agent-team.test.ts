import { randomUUID } from "node:crypto";

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

import { AgentTeam } from "./agent-team.js";

const ZERO_DIGEST = "0".repeat(64);
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
      ...candidate,
      manifest: {
        ...candidate.manifest,
        providerId: "codex",
        localOnly: false,
      },
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
});
