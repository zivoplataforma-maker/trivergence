import { createHash, randomUUID } from "node:crypto";

import {
  agentTeamResultSchema,
  type AgentContribution,
  type AgentTeamResult,
  type CoordinationBudget,
  type MemoryRecallResult,
} from "@trivergence/coordination-contracts";
import type {
  AgentProfile,
  AgentProfileReference,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import type { AdapterHost } from "@trivergence/provider-adapters";
import { createAgentProfileCatalog } from "./profiles.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const bytes = (value: string) => Buffer.byteLength(value, "utf8");

export interface AgentTeamOptions {
  readonly idFactory?: () => string;
  readonly clock?: () => Date;
  readonly profiles?: readonly AgentProfile[];
}

export class AgentTeam {
  readonly #idFactory: () => string;
  readonly #clock: () => Date;
  readonly #profiles: readonly AgentProfile[];

  constructor(
    private readonly providerHost: AdapterHost,
    private readonly capabilityId: string,
    options: AgentTeamOptions = {},
  ) {
    const manifest = providerHost.manifestFor(capabilityId);
    if (manifest.providerId !== "reference" || !manifest.localOnly) {
      throw new Error("M6 only permits the local Reference Provider");
    }
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#clock = options.clock ?? (() => new Date());
    this.#profiles =
      options.profiles ??
      createAgentProfileCatalog(sha256).boundProfiles("agent.reference.team");
  }

  matchesReferences(
    references: readonly AgentProfileReference[] | undefined,
  ): boolean {
    return (
      JSON.stringify(references ?? []) ===
      JSON.stringify(
        this.#profiles.map((profile) => ({
          profileId: profile.profileId,
          revision: profile.revision,
          digest: profile.digest,
        })),
      )
    );
  }

  async execute(input: {
    readonly goal: string;
    readonly memory: MemoryRecallResult;
    readonly budget: CoordinationBudget;
    readonly signal: AbortSignal;
  }): Promise<AgentTeamResult> {
    const startedAt = this.#clock().getTime();
    const profiles = this.#profiles.slice(0, input.budget.maxAgents);
    if (profiles.length > input.budget.maxProviderCalls) {
      throw new Error("Agent team exceeds provider call budget");
    }
    const memoryContext = input.memory.items.map((item) =>
      item.content.slice(0, 2_048),
    );
    const contributions: AgentContribution[] = [];
    let totalInputBytes = 0;
    let totalOutputBytes = 0;
    let totalCost = 0;

    for (const profile of profiles) {
      const role = profile.responsibility;
      if (input.signal.aborted) throw new Error("Agent team cancelled");
      const elapsed = this.#clock().getTime() - startedAt;
      const remainingMs = Math.min(
        input.budget.timeoutMs - elapsed,
        profile.budget.timeoutMs,
      );
      if (remainingMs < 10)
        throw new Error("Agent team timeout budget reached");
      const prior = contributions.map(
        (item) => `${item.role}: ${item.response.slice(0, 1_024)}`,
      );
      const context = [...memoryContext, ...prior];
      const prompt = `${role.toUpperCase()}: ${profile.guidance} Objetivo: ${input.goal}`;
      const remainingInputBytes = Math.min(
        input.budget.maxInputBytes - totalInputBytes,
        profile.budget.maxInputBytes,
      );
      const remainingOutputBytes = Math.min(
        input.budget.maxOutputBytes - totalOutputBytes,
        profile.budget.maxOutputBytes,
      );
      const remainingCalls = profiles.length - contributions.length;
      if (remainingInputBytes < 1 || remainingOutputBytes < 256) {
        throw new Error("Agent team aggregate byte budget exhausted");
      }
      const prepared = this.providerHost.prepare(
        this.capabilityId,
        this.#idFactory(),
        {
          prompt: prompt.slice(0, 2_048),
          context,
          maxInputBytes: remainingInputBytes,
          maxOutputBytes: Math.max(
            256,
            Math.floor(remainingOutputBytes / remainingCalls),
          ),
          maxChunks: 128,
          timeoutMs: Math.max(10, remainingMs),
          maxCostMicrounits: Math.min(
            input.budget.maxCostMicrounits - totalCost,
            profile.budget.maxCostMicrounits,
          ),
          scenario: "normal",
        },
      );
      const result = await this.providerHost.execute(
        this.capabilityId,
        prepared,
        {
          signal: input.signal,
          onEvent: () => undefined,
        },
      );
      if (result.outcome !== "succeeded" || result.response === undefined) {
        throw new Error(result.error?.message ?? `Agent ${role} failed`);
      }
      totalInputBytes += result.usage.inputBytes;
      totalOutputBytes += result.usage.outputBytes;
      totalCost += result.usage.costMicrounits;
      if (
        totalInputBytes > input.budget.maxInputBytes ||
        totalOutputBytes > input.budget.maxOutputBytes ||
        totalCost > input.budget.maxCostMicrounits
      ) {
        throw new Error("Agent team aggregate budget exceeded");
      }
      contributions.push({
        role,
        profile: {
          profileId: profile.profileId,
          revision: profile.revision,
          digest: profile.digest,
        },
        response: result.response,
        responseDigest: sha256(result.response),
        requestDigest: result.provenance.requestDigest,
        contextDigest: result.provenance.contextDigest,
        inputBytes: result.usage.inputBytes,
        outputBytes: result.usage.outputBytes,
        costMicrounits: result.usage.costMicrounits,
        elapsedMs: Math.max(0, this.#clock().getTime() - startedAt - elapsed),
        providerId: "reference",
        localOnly: true,
      });
    }

    if (
      bytes(JSON.stringify(contributions)) >
      input.budget.maxOutputBytes * 2
    ) {
      throw new Error("Agent team result serialization budget exceeded");
    }
    const elapsedMs = Math.max(0, this.#clock().getTime() - startedAt);
    if (elapsedMs > input.budget.timeoutMs) {
      throw new Error("Agent team aggregate timeout budget exceeded");
    }
    const base = {
      schemaVersion: "1" as const,
      teamId: this.#idFactory(),
      goalDigest: sha256(input.goal),
      contributions,
      providerCalls: contributions.length,
      inputBytes: totalInputBytes,
      outputBytes: totalOutputBytes,
      costMicrounits: totalCost,
      elapsedMs,
      memoryItems: input.memory.items.length,
      memoryBytes: input.memory.bytes,
      memoryDigest: input.memory.provenanceDigest,
    };
    return agentTeamResultSchema.parse({
      ...base,
      provenanceDigest: sha256(canonicalizeJson(base)),
    });
  }

  async repair(input: {
    readonly goal: string;
    readonly candidate: string;
    readonly budget: CoordinationBudget;
    readonly signal: AbortSignal;
    readonly profile: AgentProfileReference;
  }): Promise<AgentContribution> {
    if (input.signal.aborted) throw new Error("Agent replan cancelled");
    const startedAt = this.#clock().getTime();
    const profile = this.#profiles.find(
      (item) => item.responsibility === "synthesizer",
    );
    if (
      !profile ||
      profile.budget.maxExecutions < 2 ||
      !this.matchesProfile(profile, input.profile)
    ) {
      throw new Error("Synthesis profile is unavailable for repair");
    }
    const prepared = this.providerHost.prepare(
      this.capabilityId,
      this.#idFactory(),
      {
        prompt:
          `SYNTHESIZER: Repara el resultado para satisfacer el objetivo: ${input.goal}`.slice(
            0,
            2_048,
          ),
        context: [input.candidate.slice(0, 2_048)],
        maxInputBytes: Math.min(
          input.budget.maxInputBytes,
          profile.budget.maxInputBytes,
        ),
        maxOutputBytes: Math.min(
          input.budget.maxOutputBytes,
          profile.budget.maxOutputBytes,
        ),
        maxChunks: 128,
        timeoutMs: Math.min(input.budget.timeoutMs, profile.budget.timeoutMs),
        maxCostMicrounits: Math.min(
          input.budget.maxCostMicrounits,
          profile.budget.maxCostMicrounits,
        ),
        scenario: "normal",
      },
    );
    const result = await this.providerHost.execute(
      this.capabilityId,
      prepared,
      {
        signal: input.signal,
        onEvent: () => undefined,
      },
    );
    if (result.outcome !== "succeeded" || result.response === undefined) {
      throw new Error(result.error?.message ?? "Agent replan failed");
    }
    const elapsedMs = Math.max(0, this.#clock().getTime() - startedAt);
    if (elapsedMs > input.budget.timeoutMs) {
      throw new Error("Agent replan timeout budget exceeded");
    }
    return {
      role: profile.responsibility,
      profile: {
        profileId: profile.profileId,
        revision: profile.revision,
        digest: profile.digest,
      },
      response: result.response,
      responseDigest: sha256(result.response),
      requestDigest: result.provenance.requestDigest,
      contextDigest: result.provenance.contextDigest,
      inputBytes: result.usage.inputBytes,
      outputBytes: result.usage.outputBytes,
      costMicrounits: result.usage.costMicrounits,
      elapsedMs,
      providerId: "reference",
      localOnly: true,
    };
  }

  private matchesProfile(
    profile: AgentProfile,
    reference: AgentProfileReference,
  ): boolean {
    return (
      profile.profileId === reference.profileId &&
      profile.revision === reference.revision &&
      profile.digest === reference.digest
    );
  }
}
