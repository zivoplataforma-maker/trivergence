import {
  contextSliceManifestSchema,
  type ContextSliceManifest,
  type ContextSliceUpstreamReference,
  type ProjectContextSnapshot,
} from "@trivergence/contracts";

import { canonicalizeJson } from "./canonical-json.js";
import type { DigestFunction } from "./integrity-engine.js";

const MAX_SLICE_BYTES = 12_288;

export interface ContextSliceBuildOptions {
  readonly id: string;
  readonly groupId: string;
  readonly branchId: string;
  readonly phase?: "execution" | "fan_in";
  readonly sourceIds?: readonly string[];
  readonly capabilityIds?: readonly string[];
  readonly upstreamResultReferences?: readonly ContextSliceUpstreamReference[];
  readonly revision?: number;
  readonly createdAt?: string;
  readonly expiresAt?: string;
}

export class ContextSliceBuilder {
  constructor(
    private readonly sha256: DigestFunction,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  build(
    context: ProjectContextSnapshot,
    options: ContextSliceBuildOptions,
  ): ContextSliceManifest {
    const createdAt = options.createdAt ?? this.clock().toISOString();
    const expiresAt =
      options.expiresAt ??
      new Date(
        Date.parse(createdAt) + context.governance.retentionDays * 86_400_000,
      ).toISOString();
    const sourceIds = new Set(options.sourceIds ?? []);
    const capabilityIds = new Set(options.capabilityIds ?? []);
    const sourceReferences = context.sources
      .filter((source) => sourceIds.has(source.sourceId))
      .sort(compareSourceReferences);
    const capabilityReferences = context.capabilities.references
      .filter((capability) => capabilityIds.has(capability.id))
      .sort((left, right) => left.id.localeCompare(right.id));

    if (sourceReferences.length !== sourceIds.size) {
      throw new Error(
        "Context slice contains a missing or unauthorized source",
      );
    }
    if (capabilityReferences.length !== capabilityIds.size) {
      throw new Error("Context slice contains a missing capability reference");
    }

    const upstreamResultReferences = [
      ...(options.upstreamResultReferences ?? []),
    ].sort(
      (left, right) =>
        left.stepId.localeCompare(right.stepId) ||
        left.evidenceId.localeCompare(right.evidenceId),
    );
    const inputDigest = this.digest({
      projectContext: {
        id: context.id,
        revision: context.revision,
        digest: context.digest,
      },
      workspaceId: context.workspace.id,
      objectiveRequestId: context.objective.requestId,
      groupId: options.groupId,
      branchId: options.branchId,
      phase: options.phase ?? "execution",
      sourceReferences,
      capabilityReferences,
      upstreamResultReferences,
    });
    const unsigned = {
      schemaVersion: "1" as const,
      id: options.id,
      revision: options.revision ?? 1,
      createdAt,
      expiresAt,
      workspaceId: context.workspace.id,
      objectiveRequestId: context.objective.requestId,
      projectContext: {
        id: context.id,
        revision: context.revision,
        digest: context.digest,
      },
      groupId: options.groupId,
      branchId: options.branchId,
      phase: options.phase ?? ("execution" as const),
      sourceReferences,
      capabilityReferences,
      upstreamResultReferences,
      provenance: {
        builderVersion: "1" as const,
        canonicalizationVersion: "1" as const,
        inputDigest,
        sourceDigests: [
          ...new Set([
            ...sourceReferences.map((source) => source.digest),
            ...capabilityReferences.map(
              (capability) => capability.descriptorDigest,
            ),
            ...upstreamResultReferences.map((reference) =>
              this.digest(reference),
            ),
          ]),
        ].sort(),
      },
    };
    const canonical = canonicalizeJson(unsigned);
    if (Buffer.byteLength(canonical, "utf8") > MAX_SLICE_BYTES) {
      throw new Error(`Context slice exceeds ${MAX_SLICE_BYTES} bytes`);
    }
    return deepFreeze(
      contextSliceManifestSchema.parse({
        ...unsigned,
        digest: this.digest(unsigned),
      }),
    );
  }

  verify(
    slice: ContextSliceManifest,
    context: ProjectContextSnapshot,
    branchId: string,
    groupId: string,
    now = this.clock(),
  ): ContextSliceManifest {
    const parsed = contextSliceManifestSchema.parse(slice);
    if (
      parsed.projectContext.id !== context.id ||
      parsed.projectContext.revision !== context.revision ||
      parsed.projectContext.digest !== context.digest ||
      parsed.workspaceId !== context.workspace.id ||
      parsed.objectiveRequestId !== context.objective.requestId ||
      parsed.branchId !== branchId ||
      parsed.groupId !== groupId ||
      Date.parse(parsed.expiresAt) <= now.getTime()
    ) {
      throw new Error("Context slice binding is stale or inconsistent");
    }
    if (
      parsed.sourceReferences.some(
        (reference) =>
          !context.sources.some(
            (source) =>
              canonicalizeJson(source) === canonicalizeJson(reference),
          ),
      ) ||
      parsed.capabilityReferences.some(
        (reference) =>
          !context.capabilities.references.some(
            (capability) =>
              canonicalizeJson(capability) === canonicalizeJson(reference),
          ),
      )
    ) {
      throw new Error("Context slice references are not authorized");
    }
    const unsigned = { ...parsed };
    Reflect.deleteProperty(unsigned, "digest");
    if (parsed.digest !== this.digest(unsigned)) {
      throw new Error("Context slice digest mismatch");
    }
    return deepFreeze(parsed);
  }

  private digest(value: unknown): string {
    return this.sha256(
      typeof value === "string" ? value : canonicalizeJson(value),
    );
  }
}

const compareSourceReferences = (
  left: ContextSliceManifest["sourceReferences"][number],
  right: ContextSliceManifest["sourceReferences"][number],
) =>
  left.kind.localeCompare(right.kind) ||
  left.sourceId.localeCompare(right.sourceId) ||
  left.version.localeCompare(right.version);

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
