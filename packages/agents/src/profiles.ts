import type { AgentProfile } from "@trivergence/contracts";
import { coordinationCapabilityIds } from "@trivergence/coordination-contracts";
import { AgentProfileCatalog } from "@trivergence/orchestration-engine";

type Definition = Omit<AgentProfile, "digest">;

const executionRequirement = {
  subsystem: "provider" as const,
  mode: "structured" as const,
  actionKinds: ["execute" as const],
  networkAllowed: false,
};

const base = {
  schemaVersion: "1" as const,
  revision: 1,
  requiredCapabilities: [executionRequirement],
  optionalCapabilities: [],
  constraints: {
    allowedActionKinds: ["execute" as const],
    networkAllowed: false,
    requireObjective: true,
    requireWorkspace: true,
  },
  provenance: { publisher: "@trivergence/agents", version: "1.0.0" },
};

/** M6's existing three sequential responsibilities, now declarative. */
export const initialAgentProfiles: readonly Definition[] = [
  {
    ...base,
    profileId: "agent.profile.planning",
    responsibility: "planner",
    guidance:
      "Propón una solución concreta, ordenada y compatible con el objetivo.",
    budget: {
      maxExecutions: 1,
      maxInputBytes: 65_536,
      maxOutputBytes: 32_768,
      timeoutMs: 60_000,
      maxCostMicrounits: 1_000_000,
    },
  },
  {
    ...base,
    profileId: "agent.profile.critique",
    responsibility: "critic",
    guidance: "Detecta riesgos, supuestos débiles y mejoras verificables.",
    budget: {
      maxExecutions: 1,
      maxInputBytes: 65_536,
      maxOutputBytes: 32_768,
      timeoutMs: 60_000,
      maxCostMicrounits: 1_000_000,
    },
  },
  {
    ...base,
    profileId: "agent.profile.synthesis",
    responsibility: "synthesizer",
    guidance:
      "Integra la propuesta y la crítica en un resultado final conciso.",
    budget: {
      maxExecutions: 2,
      maxInputBytes: 65_536,
      maxOutputBytes: 32_768,
      timeoutMs: 60_000,
      maxCostMicrounits: 1_000_000,
    },
  },
];

export const createAgentProfileCatalog = (digest: (value: string) => string) =>
  new AgentProfileCatalog(
    initialAgentProfiles,
    {
      [coordinationCapabilityIds.agentTeam]: initialAgentProfiles.map(
        (profile) => profile.profileId,
      ),
    },
    digest,
  );
