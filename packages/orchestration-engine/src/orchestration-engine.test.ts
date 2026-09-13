import { createHash } from "node:crypto";

import type {
  CapabilityDescriptor,
  StepEvidence,
} from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  CapabilityRegistry,
  IntegrityEngine,
  OrchestrationEngine,
} from "./index.js";

const UUIDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
];

const capability = (
  id: string,
  overrides: Partial<CapabilityDescriptor> = {},
): CapabilityDescriptor => ({
  id,
  version: "1",
  displayName: id,
  subsystem: "tool",
  status: "available",
  mode: "structured",
  action: {
    tool: id,
    toolVersion: "1",
    kinds: ["read"],
    risk: "safe",
    summary: `Ejecutar ${id}`,
  },
  dependencies: [],
  ...overrides,
});

const idFactory = () => {
  let index = 0;
  return () => UUIDS[index++] ?? UUIDS[UUIDS.length - 1]!;
};

const sha256 = (canonicalValue: string) =>
  createHash("sha256").update(canonicalValue, "utf8").digest("hex");

describe("CapabilityRegistry", () => {
  it("rejects duplicate capabilities", () => {
    expect(
      () =>
        new CapabilityRegistry("test-1", [
          capability("system.read"),
          capability("system.read"),
        ]),
    ).toThrow("Duplicate capability");
  });
});

describe("IntegrityEngine", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(canonicalizeJson({ z: 1, a: { y: true, b: "value" } })).toBe(
      canonicalizeJson({ a: { b: "value", y: true }, z: 1 }),
    );
  });

  it("rejects values outside canonical JSON", () => {
    expect(() => canonicalizeJson({ value: undefined })).toThrow(
      "does not support undefined",
    );
    expect(() => canonicalizeJson(Number.POSITIVE_INFINITY)).toThrow(
      "non-finite numbers",
    );
  });

  it("rejects cyclic canonical values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow("cyclic values");
  });

  it("creates the same snapshot identity regardless of registry insertion order", () => {
    const first = capability("system.diagnostics.read");
    const second = capability("provider.presence.detect", {
      dependencies: ["system.diagnostics.read"],
    });
    const integrity = new IntegrityEngine(sha256);

    const left = integrity.createRegistrySnapshot(
      new CapabilityRegistry("test-1", [first, second]),
    );
    const right = integrity.createRegistrySnapshot(
      new CapabilityRegistry("test-1", [second, first]),
    );

    expect(left).toEqual(right);
  });

  it("changes the snapshot when provider attestation provenance changes", () => {
    const integrity = new IntegrityEngine(sha256);
    const base = capability("provider.codex.prompt.structured", {
      subsystem: "provider",
      status: "unavailable",
      provenance: {
        publisher: "provider-adapters",
        observedAt: "2026-08-07T12:00:00.000Z",
        observationDigest: "a".repeat(64),
        attestationDigest: "b".repeat(64),
        reason: "Gate pending",
      },
    });
    const changed = capability("provider.codex.prompt.structured", {
      ...base,
      provenance: {
        ...base.provenance!,
        attestationDigest: "c".repeat(64),
      },
    });

    const first = integrity.createRegistrySnapshot(
      new CapabilityRegistry("test-1", [base]),
    );
    const second = integrity.createRegistrySnapshot(
      new CapabilityRegistry("test-1", [changed]),
    );

    expect(first.id).not.toBe(second.id);
  });
});

describe("OrchestrationEngine", () => {
  it("generates, compares and selects objective routes without a preselected operation", () => {
    const registry = new CapabilityRegistry("objective-routes-1", [
      capability("workspace.file.read", {
        routing: { objectiveTerms: ["leer", "archivo"], priority: 60 },
      }),
      capability("workspace.search.literal", {
        routing: { objectiveTerms: ["buscar", "texto"], priority: 70 },
      }),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);
    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000020",
      goal: "Buscar texto en el workspace",
      profile: "observer",
      requestedCapabilities: [],
    });

    expect(preview.strategy.capabilityIds).toEqual([
      "workspace.search.literal",
    ]);
    expect(preview.strategy.candidates).toHaveLength(2);
    expect(preview.strategy.candidates?.[0]).toMatchObject({
      id: "workspace.search.literal",
      status: "eligible",
    });
    expect(preview.plan.steps[0]?.capabilityId).toBe(
      "workspace.search.literal",
    );
    expect(engine.revalidate(preview).valid).toBe(true);
  });

  it("blocks network routes in private mode before planning", () => {
    const registry = new CapabilityRegistry("private-routes-1", [
      capability("provider.remote.prompt", {
        action: {
          tool: "provider.remote.prompt",
          toolVersion: "1",
          kinds: ["execute", "network"],
          risk: "guarded",
          summary: "Remote prompt",
        },
        routing: { objectiveTerms: ["remoto"], priority: 80 },
      }),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);
    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000021",
      goal: "Usar un proveedor remoto",
      profile: "assistant",
      privacyMode: "private",
      requestedCapabilities: [],
    });

    expect(preview.strategy.kind).toBe("unavailable");
    expect(preview.strategy.candidates?.[0]?.status).toBe("privacy_blocked");
    expect(preview.evaluation.status).toBe("blocked");
  });

  it("separates preflight from postflight and rejects mismatched evidence", () => {
    const registry = new CapabilityRegistry("postflight-1", [
      capability("workspace.file.read"),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);
    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000022",
      goal: "Leer evidencia local",
      profile: "observer",
      requestedCapabilities: ["workspace.file.read"],
    });
    const runId = "10000000-0000-4000-8000-000000000023";
    const run = {
      id: runId,
      requestId: preview.request.id,
      planId: preview.plan.id,
      registrySnapshotId: preview.registrySnapshot.id,
      planDigest: preview.planIntegrity.digest,
      status: "completed" as const,
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:01.000Z",
    };
    const evidence: StepEvidence = {
      id: "10000000-0000-4000-8000-000000000024",
      runId,
      planId: preview.plan.id,
      stepId: preview.plan.steps[0]!.id,
      capabilityId: "workspace.file.read",
      subsystem: "tool",
      capabilityVersion: "1",
      outcome: "succeeded",
      observedAt: "2026-09-12T00:00:01.000Z",
      summary: "Read completed",
    };

    expect(preview.evaluation.phase).toBe("preflight");
    expect(engine.evaluateOutcome(preview, run, [evidence]).status).toBe(
      "accepted",
    );
    expect(
      engine.evaluateOutcome(preview, run, [
        { ...evidence, capabilityId: "workspace.other.read" },
      ]).status,
    ).toBe("rejected");
    expect(
      engine.evaluateOutcome(preview, { ...run, planDigest: "0".repeat(64) }, [
        evidence,
      ]).status,
    ).toBe("rejected");
  });

  it("builds a sequential dependency-first plan without executing", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("system.diagnostics.read"),
      capability("provider.presence.detect", {
        subsystem: "provider",
        dependencies: ["system.diagnostics.read"],
      }),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);

    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000001",
      goal: "Diagnosticar las capacidades locales disponibles",
      profile: "observer",
      requestedCapabilities: ["provider.presence.detect"],
    });

    expect(preview.strategy.kind).toBe("sequential");
    expect(preview.plan.steps.map((step) => step.capabilityId)).toEqual([
      "system.diagnostics.read",
      "provider.presence.detect",
    ]);
    expect(preview.plan.steps[1]?.dependsOn).toEqual(["step-1"]);
    expect(
      preview.plan.steps.every((step) => step.policy.decision === "allow"),
    ).toBe(true);
    expect(preview.evaluation.status).toBe("ready");
    expect(engine.revalidate(preview).valid).toBe(true);
  });

  it("blocks a request when the requested capability is unavailable", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("provider.prompt.run", {
        subsystem: "provider",
        status: "unavailable",
      }),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);

    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000002",
      goal: "Enviar un prompt estructurado",
      profile: "assistant",
      requestedCapabilities: ["provider.prompt.run"],
    });

    expect(preview.strategy.kind).toBe("unavailable");
    expect(preview.plan.steps).toHaveLength(0);
    expect(preview.evaluation.status).toBe("blocked");
  });

  it("detects dependency cycles and fails closed", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("workflow.prepare", {
        subsystem: "workflow",
        dependencies: ["agent.review"],
      }),
      capability("agent.review", {
        subsystem: "agent",
        dependencies: ["workflow.prepare"],
      }),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);

    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000003",
      goal: "Revisar un plan con dependencias cíclicas",
      profile: "assistant",
      requestedCapabilities: ["workflow.prepare"],
    });

    expect(preview.plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "dependency_cycle" }),
      ]),
    );
    expect(preview.evaluation.status).toBe("blocked");
  });

  it("surfaces approval requirements without executing the plan", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("workspace.file.write", {
        subsystem: "workspace",
        action: {
          tool: "workspace.file.write",
          toolVersion: "1",
          kinds: ["write"],
          risk: "guarded",
          summary: "Escribir un archivo dentro del workspace",
        },
      }),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);

    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000004",
      goal: "Preparar una escritura controlada",
      profile: "assistant",
      requestedCapabilities: ["workspace.file.write"],
    });

    expect(preview.plan.steps[0]?.policy.decision).toBe("require_approval");
    expect(preview.evaluation.status).toBe("approval_required");
  });

  it("invalidates integrity when a policy decision changes", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("system.diagnostics.read"),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);
    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000005",
      goal: "Verificar la integridad de una lectura",
      profile: "observer",
      requestedCapabilities: ["system.diagnostics.read"],
    });
    const mutated = structuredClone(preview);
    mutated.plan.steps[0]!.policy.decision = "deny";

    const result = engine.revalidate(mutated);

    expect(result.valid).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "plan_integrity_matches",
          passed: false,
        }),
      ]),
    );
  });

  it("invalidates integrity when an action target changes", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("system.diagnostics.read"),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);
    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000005",
      goal: "Verificar el target autorizado",
      profile: "observer",
      requestedCapabilities: ["system.diagnostics.read"],
    });
    const mutated = structuredClone(preview);
    mutated.plan.steps[0]!.action.targets = ["workspace/otro-destino"];

    expect(engine.revalidate(mutated).valid).toBe(false);
  });

  it("invalidates integrity when a planned step changes", () => {
    const registry = new CapabilityRegistry("test-1", [
      capability("system.diagnostics.read"),
    ]);
    const engine = new OrchestrationEngine(registry, idFactory(), sha256);
    const preview = engine.preview({
      id: "10000000-0000-4000-8000-000000000005",
      goal: "Verificar el paso planificado",
      profile: "observer",
      requestedCapabilities: ["system.diagnostics.read"],
    });
    const mutated = structuredClone(preview);
    mutated.plan.steps[0]!.action.summary = "Resumen alterado";

    expect(engine.revalidate(mutated).valid).toBe(false);
  });

  it("invalidates a plan when the capability snapshot changes", () => {
    const capabilityBefore = capability("system.diagnostics.read");
    const original = new OrchestrationEngine(
      new CapabilityRegistry("test-1", [capabilityBefore]),
      idFactory(),
      sha256,
    );
    const preview = original.preview({
      id: "10000000-0000-4000-8000-000000000005",
      goal: "Verificar el snapshot vigente",
      profile: "observer",
      requestedCapabilities: ["system.diagnostics.read"],
    });
    const changed = new OrchestrationEngine(
      new CapabilityRegistry("test-2", [
        capability("system.diagnostics.read", { status: "degraded" }),
      ]),
      idFactory(),
      sha256,
    );

    const result = changed.revalidate(preview);

    expect(result.valid).toBe(false);
    expect(result.checks[0]).toMatchObject({
      id: "registry_snapshot_matches",
      passed: false,
    });
  });
});
