import {
  strategyDecisionSchema,
  type CapabilityDescriptor,
  type OrchestrationRequest,
  type StrategyDecision,
  type StrategyRouteCandidate,
} from "@trivergence/contracts";

import type { CapabilityRegistry } from "./capability-registry.js";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9./_-]+/gu, " ")
    .trim();

const closureFor = (
  capabilityIds: readonly string[],
  registry: CapabilityRegistry,
) => {
  const capabilities: CapabilityDescriptor[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const capability = registry.get(id);
    if (!capability) {
      missing.push(id);
      return;
    }
    for (const dependency of capability.dependencies) visit(dependency);
    capabilities.push(capability);
  };
  for (const capabilityId of capabilityIds) visit(capabilityId);
  return { capabilities, missing };
};

export class StrategyEngine {
  select(
    request: OrchestrationRequest,
    registry: CapabilityRegistry,
  ): StrategyDecision {
    const explicit = request.requestedCapabilities.length > 0;
    const definitions = explicit
      ? [
          {
            id: request.requestedCapabilities[0]!,
            capabilityIds: request.requestedCapabilities,
            objectiveTerms: [] as string[],
            priority: 100,
          },
        ]
      : registry
          .list()
          .filter((capability) => capability.routing !== undefined)
          .map((capability) => ({
            id: capability.id,
            capabilityIds: [capability.id],
            objectiveTerms: capability.routing!.objectiveTerms,
            priority: capability.routing!.priority,
          }));
    const normalizedGoal = normalize(request.goal);
    const candidates = definitions
      .map<StrategyRouteCandidate>((definition) => {
        const matchedTerms = definition.objectiveTerms.filter((term) =>
          normalizedGoal.includes(normalize(term)),
        );
        const { capabilities, missing } = closureFor(
          definition.capabilityIds,
          registry,
        );
        const unavailable = capabilities.filter(
          (capability) =>
            capability.status === "unavailable" ||
            capability.status === "disabled",
        );
        const requiresNetwork = capabilities.some((capability) =>
          capability.action.kinds.includes("network"),
        );
        const score = explicit
          ? 10_000
          : Math.min(9_999, definition.priority + matchedTerms.length * 100);
        if (missing.length > 0 || unavailable.length > 0) {
          const unavailableIds = [
            ...missing,
            ...unavailable.map((item) => item.id),
          ];
          return {
            id: definition.id,
            capabilityIds: definition.capabilityIds,
            score,
            status: "unavailable",
            reason: `No disponible: ${unavailableIds.join(", ")}.`,
            matchedTerms,
          };
        }
        if (request.privacyMode !== "standard" && requiresNetwork) {
          return {
            id: definition.id,
            capabilityIds: definition.capabilityIds,
            score,
            status: "privacy_blocked",
            reason: "El modo privado bloquea rutas que requieren red.",
            matchedTerms,
          };
        }
        if (!explicit && matchedTerms.length === 0) {
          return {
            id: definition.id,
            capabilityIds: definition.capabilityIds,
            score,
            status: "not_matched",
            reason: "La ruta no coincide con términos del objetivo.",
            matchedTerms,
          };
        }
        return {
          id: definition.id,
          capabilityIds: definition.capabilityIds,
          score,
          status: "eligible",
          reason: explicit
            ? "Ruta solicitada explícitamente y viable."
            : `Coincidencias: ${matchedTerms.join(", ")}.`,
          matchedTerms,
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.id.localeCompare(right.id),
      );

    const selected = candidates.find(
      (candidate) => candidate.status === "eligible",
    );
    if (!selected) {
      return strategyDecisionSchema.parse({
        kind: "unavailable",
        reason:
          candidates.length === 0
            ? "No hay rutas publicadas para interpretar el objetivo."
            : "Ninguna ruta coincide y supera disponibilidad y privacidad.",
        capabilityIds: explicit ? request.requestedCapabilities : [],
        evidence: candidates
          .slice(0, 64)
          .map(
            (candidate) =>
              `${candidate.id}: ${candidate.status} · ${candidate.reason}`,
          ),
        candidates,
        strategyVersion: "2",
      });
    }

    const selectedClosure = closureFor(selected.capabilityIds, registry);
    const hasDependencies = selectedClosure.capabilities.some(
      (capability) => capability.dependencies.length > 0,
    );
    const kind =
      selected.capabilityIds.length === 1 && !hasDependencies
        ? "direct"
        : "sequential";

    return strategyDecisionSchema.parse({
      kind,
      reason: `Se compararon ${candidates.length} ruta(s); se seleccionó ${selected.id} con puntuación ${selected.score}.`,
      capabilityIds: selected.capabilityIds,
      evidence: candidates
        .slice(0, 64)
        .map(
          (candidate) =>
            `${candidate.id}: ${candidate.status} · score ${candidate.score}`,
        ),
      candidates,
      strategyVersion: "2",
    });
  }
}
