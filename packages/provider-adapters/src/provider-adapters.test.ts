import {
  providerOperationAttestationSchema,
  type ProviderOperationAttestation,
  type ProviderRuntimeObservation,
} from "@trivergence/contracts";
import { describe, expect, it } from "vitest";

import * as providerAdapters from "./index.js";

const NOW = "2026-08-07T12:00:00.000Z";
const DIGEST = "a".repeat(64);
const OBSERVATION_DIGEST = "b".repeat(64);
const FIXTURE_DIGEST = "c".repeat(64);
const FINGERPRINT = "d".repeat(64);

const approvedReview = {
  status: "approved" as const,
  reviewer: "provider-gate-owner",
  reviewedAt: "2026-08-07T10:00:00.000Z",
  expiresAt: "2026-09-06T10:00:00.000Z",
  evidenceRefs: ["https://example.test/official-evidence"],
};

const approvedAttestation = (): ProviderOperationAttestation =>
  providerOperationAttestationSchema.parse({
    schemaVersion: "1",
    id: "provider.codex.prompt_structured",
    providerId: "codex",
    operation: "prompt_structured",
    officialInterface: "Codex App Server over stdio",
    authenticationMode: "chatgpt_oauth",
    intendedUseCase: "third_party_orchestrator",
    compatibleVersions: ["1.2.3"],
    fixtureDigests: [FIXTURE_DIGEST],
    implementationStatus: "verified",
    reviews: {
      technical: approvedReview,
      contractual: approvedReview,
      legal: approvedReview,
    },
  });

const healthyObservation = (): ProviderRuntimeObservation => ({
  providerId: "codex",
  installation: "present",
  versionState: "attested",
  version: "1.2.3",
  authentication: "authenticated",
  health: "healthy",
  executableFingerprint: FINGERPRINT,
  observedAt: "2026-08-07T11:59:00.000Z",
  observationDigest: OBSERVATION_DIGEST,
});

const context = () => ({
  now: NOW,
  userEnabled: true,
  privateMode: false,
  trustedAttestationDigests: [DIGEST],
});

describe("provider gate", () => {
  it("publishes every current candidate as unavailable", () => {
    for (const candidate of providerAdapters.providerCandidates) {
      const attestation = providerAdapters.candidateAttestations.find(
        (entry) => entry.providerId === candidate.providerId,
      )!;
      const publication = providerAdapters.publishProviderCandidateCapability({
        candidate,
        attestation,
        attestationDigest: DIGEST,
        context: {
          now: NOW,
          userEnabled: true,
          privateMode: false,
        },
      });

      expect(publication.capability.status).toBe("unavailable");
      expect(publication.eligibility.eligible).toBe(false);
    }
  });

  it("does not treat installation and authentication as sufficient", () => {
    const pending = providerAdapters.candidateAttestations[0]!;
    const decision = providerAdapters.evaluateProviderEligibility(
      pending,
      DIGEST,
      healthyObservation(),
      context(),
    );

    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("implementation_not_verified");
    expect(decision.reasons).toContain("legal_gate_not_approved");
  });

  it("rejects an untrusted attestation digest", () => {
    const decision = providerAdapters.evaluateProviderEligibility(
      approvedAttestation(),
      DIGEST,
      healthyObservation(),
      { ...context(), trustedAttestationDigests: [] },
    );

    expect(decision.reasons).toContain("attestation_not_trusted");
  });

  it("rejects a version outside the exact attested set", () => {
    const decision = providerAdapters.evaluateProviderEligibility(
      approvedAttestation(),
      DIGEST,
      { ...healthyObservation(), version: "1.2.4" },
      context(),
    );

    expect(decision.reasons).toContain("version_not_compatible");
  });

  it("rejects expired reviews and stale observations", () => {
    const attestation = approvedAttestation();
    const expired = providerOperationAttestationSchema.parse({
      ...attestation,
      reviews: {
        ...attestation.reviews,
        legal: {
          ...approvedReview,
          expiresAt: "2026-08-07T09:00:00.000Z",
        },
      },
    });
    const decision = providerAdapters.evaluateProviderEligibility(
      expired,
      DIGEST,
      { ...healthyObservation(), observedAt: "2026-08-05T11:59:00.000Z" },
      context(),
    );

    expect(decision.reasons).toContain("gate_expired");
    expect(decision.reasons).toContain("observation_stale");
  });

  it("honors user disablement and private mode", () => {
    const decision = providerAdapters.evaluateProviderEligibility(
      approvedAttestation(),
      DIGEST,
      healthyObservation(),
      { ...context(), userEnabled: false, privateMode: true },
    );

    expect(decision.reasons).toContain("disabled_by_user");
    expect(decision.reasons).toContain("private_mode");
  });

  it("can only become eligible when every independent condition passes", () => {
    const decision = providerAdapters.evaluateProviderEligibility(
      approvedAttestation(),
      DIGEST,
      healthyObservation(),
      context(),
    );

    expect(decision).toEqual({ eligible: true, reasons: [] });
  });

  it("does not let a caller expand the compiled publication trust store", () => {
    const publication = providerAdapters.publishProviderCandidateCapability({
      candidate: providerAdapters.providerCandidates[0]!,
      attestation: approvedAttestation(),
      attestationDigest: DIGEST,
      observation: healthyObservation(),
      context: {
        now: NOW,
        userEnabled: true,
        privateMode: false,
      },
    });

    expect(publication.capability.status).toBe("unavailable");
    expect(publication.eligibility.reasons).toContain(
      "attestation_not_trusted",
    );
  });

  it("exports no provider execution or login surface", () => {
    expect("execute" in providerAdapters).toBe(false);
    expect("login" in providerAdapters).toBe(false);
    expect("dispatch" in providerAdapters).toBe(false);
  });
});
