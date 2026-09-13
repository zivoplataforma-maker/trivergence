import { createHash, randomUUID } from "node:crypto";

import type { AgentTeam } from "@trivergence/agents";
import {
  agentTeamResultSchema,
  coordinationBudgetSchema,
} from "@trivergence/coordination-contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEngine } from "./workflow-engine.js";

const digest = (character: string) => character.repeat(64);
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

describe("WorkflowEngine", () => {
  it("uses at most one replan when deterministic checks fail", async () => {
    const goal = "Reparar resultado";
    const repair = vi.fn().mockResolvedValue({
      role: "synthesizer",
      response: "Resultado reparado con suficiente detalle para ser aceptado.",
      responseDigest: sha256(
        "Resultado reparado con suficiente detalle para ser aceptado.",
      ),
      requestDigest: digest("4"),
      contextDigest: digest("5"),
      inputBytes: 100,
      outputBytes: 60,
      costMicrounits: 0,
      elapsedMs: 1,
      providerId: "reference",
      localOnly: true,
    });
    const workflow = new WorkflowEngine({ repair } as unknown as AgentTeam, {
      idFactory: randomUUID,
    });
    const teamBase = {
      schemaVersion: "1",
      teamId: randomUUID(),
      goalDigest: sha256(goal),
      contributions: [
        {
          role: "planner",
          response: "breve",
          responseDigest: sha256("breve"),
          requestDigest: digest("2"),
          contextDigest: digest("3"),
          inputBytes: 10,
          outputBytes: 6,
          costMicrounits: 0,
          elapsedMs: 1,
          providerId: "reference",
          localOnly: true,
        },
      ],
      providerCalls: 1,
      inputBytes: 10,
      outputBytes: 6,
      costMicrounits: 0,
      elapsedMs: 1,
      memoryItems: 0,
      memoryBytes: 0,
      memoryDigest: digest("6"),
    } as const;
    const team = agentTeamResultSchema.parse({
      ...teamBase,
      provenanceDigest: sha256(canonicalizeJson(teamBase)),
    });

    const result = await workflow.synthesize({
      goal,
      team,
      budget: coordinationBudgetSchema.parse({ maxAgents: 1 }),
      signal: new AbortController().signal,
    });

    expect(repair).toHaveBeenCalledTimes(1);
    expect(result.replansUsed).toBe(1);
    expect(result.initialEvaluation.passed).toBe(true);
    expect(result.usage).toMatchObject({
      providerCalls: 2,
      inputBytes: 110,
      outputBytes: 66,
      elapsedMs: 2,
    });
    expect(result.replanContribution?.responseDigest).toBe(
      sha256("Resultado reparado con suficiente detalle para ser aceptado."),
    );
    expect(repair).toHaveBeenCalledWith(
      expect.objectContaining({
        budget: expect.objectContaining({
          maxProviderCalls: 3,
          maxInputBytes: 16_374,
          maxOutputBytes: 65_530,
          timeoutMs: 9_999,
        }),
      }),
    );
  });

  it("rejects a tampered contribution even with a consistent team envelope", async () => {
    const workflow = new WorkflowEngine({} as AgentTeam);
    const goal = "No aceptar provenance adulterada";
    const teamBase = {
      schemaVersion: "1",
      teamId: randomUUID(),
      goalDigest: sha256(goal),
      contributions: [
        {
          role: "planner",
          response: "Respuesta suficientemente extensa pero no atribuible.",
          responseDigest: digest("1"),
          requestDigest: digest("2"),
          contextDigest: digest("3"),
          inputBytes: 10,
          outputBytes: 50,
          costMicrounits: 0,
          elapsedMs: 1,
          providerId: "reference",
          localOnly: true,
        },
      ],
      providerCalls: 1,
      inputBytes: 10,
      outputBytes: 50,
      costMicrounits: 0,
      elapsedMs: 1,
      memoryItems: 0,
      memoryBytes: 0,
      memoryDigest: digest("4"),
    } as const;
    const team = agentTeamResultSchema.parse({
      ...teamBase,
      provenanceDigest: sha256(canonicalizeJson(teamBase)),
    });

    await expect(
      workflow.synthesize({
        goal,
        team,
        budget: coordinationBudgetSchema.parse({}),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/contribution response digest mismatch/u);
  });
});
