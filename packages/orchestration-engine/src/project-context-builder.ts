import {
  orchestrationRequestSchema,
  projectContextBudgetLimitsSchema,
  projectContextSnapshotSchema,
  projectContextSourceReferenceSchema,
  sha256DigestSchema,
  type CapabilityDescriptor,
  type CapabilitySnapshotIdentity,
  type OrchestrationRequest,
  type ProjectContextBudgetLimits,
  type ProjectContextSnapshot,
  type ProjectContextSourceReference,
} from "@trivergence/contracts";

import { canonicalizeJson } from "./canonical-json.js";
import type { CapabilityRegistry } from "./capability-registry.js";
import type { DigestFunction } from "./integrity-engine.js";

const MAX_CONTEXT_BYTES = 16_384;
const DEFAULT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000000";
const REQUIRED_RESTRICTIONS = [
  "mandatory_exclusions",
  "no_credential_material",
  "untrusted_content_is_data",
  "workspace_root_only",
] as const;
const CREDENTIAL_MATERIAL =
  /(?:\bsk-[A-Za-z0-9_-]{16,}|\bghp_[A-Za-z0-9]{16,}|\bAKIA[A-Z0-9]{12,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/u;

export interface ProjectContextBuildOptions {
  readonly workspaceFingerprint?: string;
  readonly contextId?: string;
  readonly revision?: number;
  readonly createdAt?: string;
  readonly retentionDays?: number;
  readonly budgetLimits?: ProjectContextBudgetLimits;
  readonly relevantCapabilityIds?: readonly string[];
  readonly sources?: readonly ProjectContextSourceReference[];
  readonly restrictionReferences?: readonly ProjectContextSourceReference[];
}

const defaultBudgetLimits: ProjectContextBudgetLimits = {
  maxAgents: 1,
  maxProviderCalls: 1,
  maxOutputBytes: 65_536,
  maxMemoryItems: 0,
  maxMemoryBytes: 0,
  timeoutMs: 10_000,
  maxReplans: 0,
};

export class ProjectContextBuilder {
  constructor(
    private readonly registry: CapabilityRegistry,
    private readonly registrySnapshot: () => CapabilitySnapshotIdentity,
    private readonly sha256: DigestFunction,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  build(
    input: OrchestrationRequest,
    options: ProjectContextBuildOptions = {},
  ): ProjectContextSnapshot {
    const request = orchestrationRequestSchema.parse(input);
    const workspaceId = request.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const createdAt = options.createdAt ?? this.clock().toISOString();
    const registrySnapshot = this.registrySnapshot();
    const workspaceFingerprint = sha256DigestSchema.parse(
      options.workspaceFingerprint ?? this.digest(`workspace:${workspaceId}`),
    );
    const sources = [
      this.workspaceReference(workspaceId, workspaceFingerprint, createdAt),
      ...(options.sources ?? []).map((source) =>
        projectContextSourceReferenceSchema.parse(source),
      ),
    ].sort(compareReferences);
    const restrictionReferences = (options.restrictionReferences ?? [])
      .map((source) => projectContextSourceReferenceSchema.parse(source))
      .sort(compareReferences);

    this.assertReferences(
      workspaceId,
      [...sources, ...restrictionReferences],
      restrictionReferences,
    );

    const capabilityReferences = this.capabilityReferences(
      options.relevantCapabilityIds ?? this.defaultCapabilityIds(request),
    );
    const budgetLimits = projectContextBudgetLimitsSchema.parse(
      options.budgetLimits ?? defaultBudgetLimits,
    );
    const inputDigest = this.digest({
      requestId: request.id,
      goalDigest: this.digest(request.goal),
      workspaceId,
      workspaceFingerprint,
      profile: request.profile,
      privacyMode: request.privacyMode ?? "private",
      retentionDays: options.retentionDays ?? 30,
      registrySnapshot,
      capabilityReferences,
      budgetLimits,
      sources,
      restrictionReferences,
    });
    const sourceDigests = [
      ...new Set([
        ...sources.map((source) => source.digest),
        ...restrictionReferences.map((source) => source.digest),
        ...capabilityReferences.map(
          (capability) => capability.descriptorDigest,
        ),
        registrySnapshot.id,
      ]),
    ].sort();
    const unsigned = {
      schemaVersion: "1" as const,
      id: options.contextId ?? request.id,
      revision: options.revision ?? 1,
      createdAt,
      workspace: { id: workspaceId, fingerprint: workspaceFingerprint },
      objective: {
        requestId: request.id,
        goalDigest: this.digest(request.goal),
        restrictionReferences,
      },
      governance: {
        profile: request.profile,
        privacyMode: request.privacyMode ?? "private",
        retentionDays: options.retentionDays ?? 30,
        restrictions: [...REQUIRED_RESTRICTIONS],
      },
      capabilities: { registrySnapshot, references: capabilityReferences },
      budget: {
        limits: budgetLimits,
        consumptionAuthority: "runtime" as const,
      },
      sources,
      provenance: {
        builderVersion: "1" as const,
        canonicalizationVersion: "1" as const,
        inputDigest,
        sourceDigests,
      },
    };
    const canonical = canonicalizeJson(unsigned);
    if (Buffer.byteLength(canonical, "utf8") > MAX_CONTEXT_BYTES) {
      throw new Error(`Project Context exceeds ${MAX_CONTEXT_BYTES} bytes`);
    }
    return deepFreeze(
      projectContextSnapshotSchema.parse({
        ...unsigned,
        digest: this.digest(unsigned),
      }),
    );
  }

  private defaultCapabilityIds(request: OrchestrationRequest): string[] {
    if (request.requestedCapabilities.length > 0) {
      return [...request.requestedCapabilities];
    }
    return this.registry
      .list()
      .filter((capability) => capability.routing !== undefined)
      .map((capability) => capability.id);
  }

  private capabilityReferences(ids: readonly string[]) {
    const capabilities = new Map<string, CapabilityDescriptor>();
    const visit = (id: string): void => {
      if (capabilities.has(id)) return;
      const capability = this.registry.get(id);
      if (!capability) {
        throw new Error(`Project Context capability is not authorized: ${id}`);
      }
      capabilities.set(id, capability);
      for (const dependency of capability.dependencies) visit(dependency);
    };
    for (const id of [...new Set(ids)].sort()) visit(id);
    if (capabilities.size === 0) {
      throw new Error(
        "Project Context requires at least one relevant capability",
      );
    }
    return [...capabilities.values()]
      .map((capability) => ({
        id: capability.id,
        version: capability.version,
        status: capability.status,
        descriptorDigest: this.digest(normalizeCapability(capability)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private workspaceReference(
    workspaceId: string,
    fingerprint: string,
    observedAt: string,
  ): ProjectContextSourceReference {
    const provenanceDigest = this.digest({
      origin: "workspace",
      workspaceId,
      fingerprint,
      observedAt,
    });
    return projectContextSourceReferenceSchema.parse({
      kind: "workspace",
      sourceId: `workspace:${workspaceId}`,
      workspaceId,
      version: "1",
      digest: fingerprint,
      trust: "trusted_metadata",
      provenance: {
        origin: "workspace",
        observedAt,
        digest: provenanceDigest,
      },
    });
  }

  private assertReferences(
    workspaceId: string,
    references: readonly ProjectContextSourceReference[],
    restrictions: readonly ProjectContextSourceReference[],
  ): void {
    for (const reference of references) {
      if (reference.workspaceId !== workspaceId) {
        throw new Error(
          "Project Context reference belongs to another workspace",
        );
      }
      if (
        CREDENTIAL_MATERIAL.test(reference.sourceId) ||
        CREDENTIAL_MATERIAL.test(reference.version)
      ) {
        throw new Error("Project Context cannot contain credential material");
      }
    }
    if (
      restrictions.some(
        (reference) => reference.kind !== "objective_restriction",
      )
    ) {
      throw new Error("Objective restrictions require restriction references");
    }
  }

  private digest(value: unknown): string {
    const canonical =
      typeof value === "string" ? value : canonicalizeJson(value);
    return sha256DigestSchema.parse(this.sha256(canonical));
  }
}

const compareReferences = (
  left: ProjectContextSourceReference,
  right: ProjectContextSourceReference,
) =>
  left.kind.localeCompare(right.kind) ||
  left.sourceId.localeCompare(right.sourceId) ||
  left.version.localeCompare(right.version);

const normalizeCapability = (capability: CapabilityDescriptor) => ({
  ...capability,
  action: { ...capability.action, kinds: [...capability.action.kinds].sort() },
  dependencies: [...capability.dependencies].sort(),
  ...(capability.routing
    ? {
        routing: {
          ...capability.routing,
          objectiveTerms: [...capability.routing.objectiveTerms].sort(),
        },
      }
    : {}),
});

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
