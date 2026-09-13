import {
  artifactIntegritySchema,
  capabilitySnapshotIdentitySchema,
  orchestrationIntegrityPayloadSchema,
  orchestrationPreviewSchema,
  revalidationResultSchema,
  sha256DigestSchema,
  type ArtifactIntegrity,
  type CapabilityDescriptor,
  type CapabilitySnapshotIdentity,
  type OrchestrationIntegrityPayload,
  type OrchestrationPreview,
  type RevalidationResult,
} from "@trivergence/contracts";

import type { CapabilityRegistry } from "./capability-registry.js";
import { canonicalizeJson } from "./canonical-json.js";

export type DigestFunction = (canonicalValue: string) => string;

export class IntegrityEngine {
  constructor(private readonly sha256: DigestFunction) {}

  createRegistrySnapshot(
    registry: CapabilityRegistry,
  ): CapabilitySnapshotIdentity {
    const capabilities = registry
      .list()
      .map(normalizeCapability)
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      );
    const id = this.digest({ version: registry.version, capabilities });

    return capabilitySnapshotIdentitySchema.parse({
      id,
      version: registry.version,
      capabilityCount: capabilities.length,
    });
  }

  createPlanIntegrity(input: OrchestrationIntegrityPayload): ArtifactIntegrity {
    const payload = orchestrationIntegrityPayloadSchema.parse(input);
    return artifactIntegritySchema.parse({
      algorithm: "sha256",
      digest: this.digest(payload),
      canonicalizationVersion: "1",
    });
  }

  revalidate(
    input: OrchestrationPreview,
    registry: CapabilityRegistry,
  ): RevalidationResult {
    const parsed = orchestrationPreviewSchema.safeParse(input);
    if (!parsed.success) {
      return revalidationResultSchema.parse({
        valid: false,
        checks: [
          {
            id: "registry_snapshot_matches",
            passed: false,
            evidence: "El preview no cumple el contrato de snapshot.",
          },
          {
            id: "plan_integrity_matches",
            passed: false,
            evidence: "El preview no cumple el contrato de integridad.",
          },
        ],
        revalidationVersion: "1",
      });
    }

    const preview = parsed.data;
    const currentSnapshot = this.createRegistrySnapshot(registry);
    const snapshotMatches =
      currentSnapshot.id === preview.registrySnapshot.id &&
      currentSnapshot.version === preview.registrySnapshot.version &&
      currentSnapshot.capabilityCount ===
        preview.registrySnapshot.capabilityCount;
    const expected = this.createPlanIntegrity(payloadFromPreview(preview));
    const integrityMatches = expected.digest === preview.planIntegrity.digest;

    return revalidationResultSchema.parse({
      valid: snapshotMatches && integrityMatches,
      checks: [
        {
          id: "registry_snapshot_matches",
          passed: snapshotMatches,
          evidence: snapshotMatches
            ? `Snapshot ${currentSnapshot.id} vigente.`
            : "El Capability Registry cambió; el plan debe regenerarse.",
        },
        {
          id: "plan_integrity_matches",
          passed: integrityMatches,
          evidence: integrityMatches
            ? `Integridad ${expected.digest} verificada.`
            : "El plan, la policy o la evaluación cambiaron desde el preview.",
        },
      ],
      revalidationVersion: "1",
    });
  }

  private digest(value: unknown): string {
    return sha256DigestSchema.parse(this.sha256(canonicalizeJson(value)));
  }
}

export function payloadFromPreview(
  preview: OrchestrationPreview,
): OrchestrationIntegrityPayload {
  return orchestrationIntegrityPayloadSchema.parse({
    request: preview.request,
    registrySnapshot: preview.registrySnapshot,
    strategy: preview.strategy,
    plan: preview.plan,
    evaluation: preview.evaluation,
  });
}

function normalizeCapability(capability: CapabilityDescriptor) {
  return {
    id: capability.id,
    version: capability.version,
    displayName: capability.displayName,
    subsystem: capability.subsystem,
    status: capability.status,
    mode: capability.mode,
    action: {
      tool: capability.action.tool,
      toolVersion: capability.action.toolVersion,
      kinds: [...capability.action.kinds].sort(),
      risk: capability.action.risk,
      summary: capability.action.summary,
    },
    dependencies: [...capability.dependencies].sort(),
    ...(capability.routing
      ? {
          routing: {
            objectiveTerms: [...capability.routing.objectiveTerms].sort(),
            priority: capability.routing.priority,
          },
        }
      : {}),
    ...(capability.provenance
      ? {
          provenance: {
            publisher: capability.provenance.publisher,
            observedAt: capability.provenance.observedAt,
            observationDigest: capability.provenance.observationDigest,
            attestationDigest: capability.provenance.attestationDigest,
            reason: capability.provenance.reason,
          },
        }
      : {}),
  };
}
