import { createHash, randomUUID } from "node:crypto";

import {
  CapabilityRegistry,
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import { PersistenceStore } from "@trivergence/persistence";
import { evaluatePolicy } from "@trivergence/policy-engine";
import { RuntimeEngine } from "@trivergence/runtime";
import type { ProviderRequestInput } from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import {
  createReferenceProviderCapability,
  AdapterHost,
  ProviderStepDispatcher,
  ReferenceProviderAdapter,
  ReferenceProviderTransport,
  referenceProviderCapabilityId,
  runProviderConformanceSuite,
} from "./index.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const input = (
  overrides: Partial<ProviderRequestInput> = {},
): ProviderRequestInput => ({
  prompt: "CONFORMANCE_PRIVATE_PROMPT",
  context: ["CONFORMANCE_PRIVATE_CONTEXT"],
  maxInputBytes: 4_096,
  maxOutputBytes: 4_096,
  maxChunks: 128,
  timeoutMs: 2_000,
  maxCostMicrounits: 0,
  scenario: "normal",
  ...overrides,
});

describe("Provider Adapter reusable conformance suite", () => {
  it("passes every contract boundary with the local Reference Provider", async () => {
    const capability = createReferenceProviderCapability();
    const report = await runProviderConformanceSuite({
      capability,
      capabilityId: referenceProviderCapabilityId,
      capabilityVersion: capability.version,
      createAdapter: () =>
        new ReferenceProviderAdapter({
          transport: new ReferenceProviderTransport(6, 1, 20),
        }),
      fixtures: {
        normal: input(),
        slow: input({ scenario: "slow" }),
        timeout: input({ scenario: "slow", timeoutMs: 10 }),
        typedFailure: input({ scenario: "error" }),
        recoverable: input({ scenario: "recoverable_error" }),
        inputBudgetExceeded: input({ maxInputBytes: 4 }),
        outputBudgetExceeded: input({ maxOutputBytes: 8 }),
        sensitiveValues: [
          "CONFORMANCE_PRIVATE_PROMPT",
          "CONFORMANCE_PRIVATE_CONTEXT",
        ],
        expectedFailureCode: "transport_error",
        cancelAfterMs: 30,
      },
      verifyApprovalBoundary: async () => {
        const registry = new CapabilityRegistry("conformance-reference-1", [
          capability,
        ]);
        const engine = new OrchestrationEngine(registry, randomUUID, sha256);
        const preview = engine.preview({
          id: randomUUID(),
          goal: "Verify approval boundary",
          profile: "assistant",
          requestedCapabilities: [referenceProviderCapabilityId],
          capabilityInputs: {
            [referenceProviderCapabilityId]: input(),
          },
        });
        const store = PersistenceStore.open(":memory:");
        store.persistPreview(preview);
        const runtime = new RuntimeEngine({
          persistence: store,
          dispatchers: [
            new ProviderStepDispatcher({
              host: new AdapterHost([
                {
                  capabilityId: referenceProviderCapabilityId,
                  capabilityVersion: capability.version,
                  adapter: new ReferenceProviderAdapter(),
                },
              ]),
            }),
          ],
          revalidate: (candidate) => engine.revalidate(candidate),
          evaluatePolicy,
          sha256,
        });
        expect(await runtime.execute(preview)).toMatchObject({
          status: "approval_required",
          evidenceCount: 0,
        });
        expect(
          store
            .listAuditEvents()
            .filter(
              (event) => event.eventType === "execution.evidence_recorded",
            ),
        ).toHaveLength(0);
        store.close();
      },
    });

    expect(report.checks.map((check) => check.id)).toEqual([
      "capability_declaration",
      "prepare_context_preview",
      "execute_and_stream",
      "cancellation",
      "recovery",
      "interrupted_recovery",
      "timeout",
      "typed_failure",
      "input_budget",
      "output_budget",
      "provenance",
      "approval_boundary",
      "malformed_response",
      "unavailable_provider",
    ]);
    expect(report.checks.filter((check) => !check.passed)).toEqual([]);
    expect(report.passed).toBe(true);
  });
});
