import {
  agentProfileReferenceSchema,
  agentProfileSchema,
  type AgentProfile,
  type AgentProfileReference,
  type CapabilityDescriptor,
  type PlannedStep,
  type OrchestrationRequest,
  type ProjectContextSnapshot,
} from "@trivergence/contracts";

import type { CapabilityRegistry } from "./capability-registry.js";
import { canonicalizeJson } from "./canonical-json.js";

type ProfileDefinition = Omit<AgentProfile, "digest">;
type DigestFunction = (canonicalValue: string) => string;

const sortUnique = <T>(values: readonly T[]): T[] =>
  [...new Set(values)].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );

const normalize = (profile: ProfileDefinition): ProfileDefinition => ({
  ...profile,
  requiredCapabilities: profile.requiredCapabilities
    .map((requirement) => ({
      ...requirement,
      actionKinds: sortUnique(requirement.actionKinds),
    }))
    .sort((left, right) =>
      canonicalizeJson(left).localeCompare(canonicalizeJson(right)),
    ),
  optionalCapabilities: profile.optionalCapabilities
    .map((requirement) => ({
      ...requirement,
      actionKinds: sortUnique(requirement.actionKinds),
    }))
    .sort((left, right) =>
      canonicalizeJson(left).localeCompare(canonicalizeJson(right)),
    ),
  constraints: {
    ...profile.constraints,
    allowedActionKinds: sortUnique(profile.constraints.allowedActionKinds),
  },
});

const matches = (
  requirement: AgentProfile["requiredCapabilities"][number],
  capability: CapabilityDescriptor,
): boolean =>
  requirement.subsystem === capability.subsystem &&
  requirement.mode === capability.mode &&
  requirement.actionKinds.every((kind) =>
    capability.action.kinds.includes(kind),
  ) &&
  (requirement.networkAllowed || !capability.action.kinds.includes("network"));

/** Versioned configuration catalog; Registry remains the capability authority. */
export class AgentProfileCatalog {
  readonly #profiles = new Map<string, AgentProfile>();
  readonly #bindings = new Map<string, readonly string[]>();

  constructor(
    definitions: readonly ProfileDefinition[],
    bindings: Readonly<Record<string, readonly string[]>>,
    private readonly digest: DigestFunction,
  ) {
    for (const input of definitions) {
      const profile = normalize(
        agentProfileSchema.omit({ digest: true }).parse(input),
      );
      if (this.#profiles.has(profile.profileId)) {
        throw new Error(`Duplicate agent profile: ${profile.profileId}`);
      }
      this.#profiles.set(
        profile.profileId,
        agentProfileSchema.parse({
          ...profile,
          digest: digest(canonicalizeJson(profile)),
        }),
      );
    }
    for (const [capabilityId, ids] of Object.entries(bindings)) {
      if (
        ids.length < 1 ||
        ids.length > 4 ||
        new Set(ids).size !== ids.length
      ) {
        throw new Error(`Invalid agent profile binding: ${capabilityId}`);
      }
      if (ids.some((id) => !this.#profiles.has(id))) {
        throw new Error(`Unknown agent profile in binding: ${capabilityId}`);
      }
      this.#bindings.set(capabilityId, [...ids]);
    }
  }

  resolve(reference: AgentProfileReference): AgentProfile {
    const ref = agentProfileReferenceSchema.parse(reference);
    const profile = this.#profiles.get(ref.profileId);
    if (
      !profile ||
      profile.revision !== ref.revision ||
      profile.digest !== ref.digest
    ) {
      throw new Error(`Agent profile version unavailable: ${ref.profileId}`);
    }
    return agentProfileSchema.parse(profile);
  }

  boundProfiles(capabilityId: string): AgentProfile[] {
    return (this.#bindings.get(capabilityId) ?? []).map((id) =>
      agentProfileSchema.parse(this.#profiles.get(id)),
    );
  }

  relevantCapabilityIds(
    request: OrchestrationRequest,
    registry: CapabilityRegistry,
  ): string[] {
    const roots = request.requestedCapabilities.length
      ? request.requestedCapabilities
      : registry
          .list()
          .filter((item) => item.routing)
          .map((item) => item.id);
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dependency of registry.get(id)?.dependencies ?? [])
        visit(dependency);
    };
    for (const id of roots) visit(id);
    const additional = new Set<string>();
    for (const id of visited) {
      for (const profile of this.boundProfiles(id)) {
        for (const requirement of profile.requiredCapabilities) {
          for (const capability of registry.list()) {
            if (
              matches(requirement, capability) &&
              ["available", "degraded"].includes(capability.status)
            ) {
              additional.add(capability.id);
            }
          }
        }
      }
    }
    return [...new Set([...roots, ...additional])].sort();
  }

  selectForStep(
    capability: CapabilityDescriptor,
    context: ProjectContextSnapshot,
    registry: CapabilityRegistry,
  ): AgentProfileReference[] {
    const ids = this.#bindings.get(capability.id);
    if (!ids) {
      if (capability.subsystem === "agent") {
        throw new Error(`No agent profiles bound to ${capability.id}`);
      }
      return [];
    }
    if (capability.subsystem !== "agent") {
      throw new Error("Agent profiles can only bind agent capabilities");
    }
    const available = context.capabilities.references
      .filter((reference) =>
        ["available", "degraded"].includes(reference.status),
      )
      .map((reference) => registry.get(reference.id))
      .filter((item): item is CapabilityDescriptor => item !== undefined);
    return ids.map((id) => {
      const profile = this.#profiles.get(id)!;
      if (
        (profile.constraints.requireObjective &&
          !context.objective.requestId) ||
        (profile.constraints.requireWorkspace &&
          context.workspace.id === "00000000-0000-4000-8000-000000000000") ||
        (!profile.constraints.networkAllowed &&
          capability.action.kinds.includes("network")) ||
        !capability.action.kinds.every((kind) =>
          profile.constraints.allowedActionKinds.includes(kind),
        ) ||
        profile.requiredCapabilities.some(
          (requirement) =>
            !available.some((candidate) => matches(requirement, candidate)),
        )
      ) {
        throw new Error(`Agent profile is ineligible: ${profile.profileId}`);
      }
      return agentProfileReferenceSchema.parse({
        profileId: profile.profileId,
        revision: profile.revision,
        digest: profile.digest,
      });
    });
  }

  assertStep(
    step: PlannedStep,
    context: ProjectContextSnapshot,
    registry: CapabilityRegistry,
  ): void {
    const capability = registry.get(step.capabilityId);
    if (!capability) throw new Error("Agent profile capability is unavailable");
    const expected = this.selectForStep(capability, context, registry);
    if (
      canonicalizeJson(step.agentProfiles ?? []) !== canonicalizeJson(expected)
    ) {
      throw new Error(`Agent profile binding changed for ${step.id}`);
    }
  }
}
