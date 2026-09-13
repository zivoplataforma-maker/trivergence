import { describe, expect, it } from "vitest";

import {
  actionRequestSchema,
  artifactIntegritySchema,
  diagnosticsSchema,
  executionRunSchema,
  orchestrationRequestSchema,
  orchestrationPreviewSchema,
  policyEvaluationRequestSchema,
  providerExecutionResultSchema,
  providerGateReviewSchema,
  providerOperationAttestationSchema,
  providerRequestInputSchema,
  providerIdSchema,
  providerStreamEventSchema,
  stepEvidenceSchema,
  workspaceExecutionStateSchema,
  workspacePreviewRequestSchema,
  workspaceWorkflowOutputSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("rejects an action without a declared kind", () => {
    expect(() =>
      actionRequestSchema.parse({
        id: "d0c1cd22-0cf4-4d08-a88f-0829a0988469",
        tool: "workspace.list",
        toolVersion: "1",
        kinds: [],
        risk: "safe",
        summary: "Listar",
      }),
    ).toThrow();
  });

  it("rejects an unknown policy profile at the IPC boundary", () => {
    expect(() =>
      policyEvaluationRequestSchema.parse({
        profile: "autonomous",
        action: {},
      }),
    ).toThrow();
  });

  it("requires a complete provider diagnostic matrix", () => {
    expect(() =>
      diagnosticsSchema.parse({
        appVersion: "0.0.0",
        platform: "win32",
        arch: "x64",
        providers: [],
        rendererSecurity: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      }),
    ).toThrow();
  });

  it("rejects an incomplete preview identity", () => {
    expect(() =>
      orchestrationPreviewSchema.parse({
        registryVersion: "stale",
        registrySnapshot: {
          version: "current",
        },
      }),
    ).toThrow();
  });

  it("bounds candidate-route inputs and accepts objective-first requests", () => {
    expect(() =>
      orchestrationRequestSchema.parse({
        id: "20000000-0000-4000-8000-000000000010",
        goal: "Leer un archivo del workspace",
        profile: "observer",
        requestedCapabilities: ["workspace.file.read", "workspace.file.read"],
      }),
    ).toThrow(/unique/u);

    expect(
      orchestrationRequestSchema.parse({
        id: "20000000-0000-4000-8000-000000000011",
        goal: "Leer un archivo del workspace",
        profile: "observer",
        workspaceId: "20000000-0000-4000-8000-000000000012",
        requestedCapabilities: ["workspace.file.read"],
        capabilityInputs: {
          "workspace.file.read": { path: "README.md" },
        },
      }).capabilityInputs,
    ).toEqual({ "workspace.file.read": { path: "README.md" } });
    expect(
      orchestrationRequestSchema.parse({
        id: "20000000-0000-4000-8000-000000000013",
        goal: "Buscar un texto local",
        profile: "observer",
      }).requestedCapabilities,
    ).toEqual([]);
  });

  it("rejects unknown canonicalization versions", () => {
    expect(() =>
      artifactIntegritySchema.parse({
        algorithm: "sha256",
        digest: "a".repeat(64),
        canonicalizationVersion: "2",
      }),
    ).toThrow();
  });

  it("binds runs and evidence to plan and snapshot identifiers", () => {
    const digest = "a".repeat(64);
    expect(
      executionRunSchema.parse({
        id: "20000000-0000-4000-8000-000000000001",
        requestId: "20000000-0000-4000-8000-000000000002",
        planId: "20000000-0000-4000-8000-000000000003",
        registrySnapshotId: digest,
        planDigest: digest,
        status: "planned",
        createdAt: "2026-08-04T19:00:00.000Z",
        updatedAt: "2026-08-04T19:00:00.000Z",
      }).planDigest,
    ).toBe(digest);

    expect(
      stepEvidenceSchema.parse({
        id: "20000000-0000-4000-8000-000000000004",
        runId: "20000000-0000-4000-8000-000000000001",
        planId: "20000000-0000-4000-8000-000000000003",
        stepId: "step-1",
        capabilityId: "system.diagnostics.read",
        subsystem: "tool",
        capabilityVersion: "1",
        outcome: "succeeded",
        observedAt: "2026-08-04T19:00:01.000Z",
        summary: "Diagnóstico completado",
        outputDigest: digest,
      }).runId,
    ).toBe("20000000-0000-4000-8000-000000000001");
  });

  it("keeps Desktop workspace IPC nominal and rejects extra authority", () => {
    expect(() =>
      workspacePreviewRequestSchema.parse({
        workspaceId: "20000000-0000-4000-8000-000000000020",
        requestId: "20000000-0000-4000-8000-000000000021",
        goal: "Leer un archivo",
        profile: "observer",
        detail: "README.md",
        rootPath: "C:\\untrusted",
      }),
    ).toThrow();

    expect(
      workspaceExecutionStateSchema.parse({
        runId: "20000000-0000-4000-8000-000000000022",
        status: "completed",
        reason: "Execution completed",
        evidenceCount: 1,
        output: {
          kind: "file",
          path: "README.md",
          content: "safe text",
          bytes: 9,
          sha256: "a".repeat(64),
        },
      }).output?.kind,
    ).toBe("file");
  });

  it("requires attributable and expiring approval for provider gates", () => {
    expect(() =>
      providerGateReviewSchema.parse({
        status: "approved",
        evidenceRefs: ["https://example.test/official-evidence"],
      }),
    ).toThrow(/reviewer, reviewedAt, expiresAt and evidence/u);
  });

  it("keeps a provider attestation operation-scoped and unimplemented", () => {
    const pendingReview = {
      status: "pending" as const,
      evidenceRefs: ["https://example.test/official-evidence"],
    };
    const attestation = providerOperationAttestationSchema.parse({
      schemaVersion: "1",
      id: "provider.codex.prompt_structured",
      providerId: "codex",
      operation: "prompt_structured",
      officialInterface: "Codex App Server",
      authenticationMode: "chatgpt_oauth",
      intendedUseCase: "third_party_orchestrator",
      compatibleVersions: [],
      fixtureDigests: [],
      implementationStatus: "not_implemented",
      reviews: {
        technical: pendingReview,
        contractual: pendingReview,
        legal: pendingReview,
      },
    });

    expect(attestation.operation).toBe("prompt_structured");
    expect(attestation.implementationStatus).toBe("not_implemented");
  });

  it("normalizes bounded provider request budgets", () => {
    const request = providerRequestInputSchema.parse({
      prompt: "Local prompt",
    });

    expect(request).toMatchObject({
      context: [],
      maxInputBytes: 65_536,
      maxOutputBytes: 65_536,
      maxChunks: 128,
      timeoutMs: 30_000,
      maxCostMicrounits: 0,
      scenario: "normal",
    });
  });

  it("rejects malformed provider stream events", () => {
    expect(() =>
      providerStreamEventSchema.parse({
        type: "delta",
        requestId: "20000000-0000-4000-8000-000000000030",
        sequence: -1,
        observedAt: "not-a-date",
        text: "",
      }),
    ).toThrow();
  });

  it("requires complete failure metadata in provider results", () => {
    expect(() =>
      providerExecutionResultSchema.parse({
        schemaVersion: "1",
        requestId: "20000000-0000-4000-8000-000000000031",
        outcome: "failed",
      }),
    ).toThrow();
  });

  it("keeps the M6 desktop boundary bounded and typed", () => {
    const request = workspacePreviewRequestSchema.parse({
      workspaceId: "20000000-0000-4000-8000-000000000040",
      requestId: "20000000-0000-4000-8000-000000000041",
      goal: "Coordinar un workflow local",
      profile: "assistant",
      detail: "",
    });
    expect(request).toMatchObject({
      maxAgents: 3,
      maxProviderCalls: 4,
      maxReplans: 1,
      retentionDays: 30,
    });
    expect(() =>
      workspaceWorkflowOutputSchema.parse({ kind: "workflow", result: {} }),
    ).toThrow();
  });

  it("accepts new namespaced provider IDs without opening external gates", () => {
    expect(providerIdSchema.parse("vendor.local-model")).toBe(
      "vendor.local-model",
    );
    expect(() => providerIdSchema.parse("../Unsafe Provider")).toThrow();
  });
});
