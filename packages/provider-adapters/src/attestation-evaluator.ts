import {
  providerOperationAttestationSchema,
  providerRuntimeObservationSchema,
  sha256DigestSchema,
  type ProviderOperationAttestation,
  type ProviderRuntimeObservation,
} from "@trivergence/contracts";

export const providerEligibilityReasonSchemaValues = [
  "observation_missing",
  "provider_mismatch",
  "provider_absent",
  "version_not_attested",
  "version_not_compatible",
  "executable_not_fingerprinted",
  "authentication_not_verified",
  "provider_unhealthy",
  "observation_stale",
  "implementation_not_verified",
  "fixtures_missing",
  "technical_gate_not_approved",
  "contractual_gate_not_approved",
  "legal_gate_not_approved",
  "gate_expired",
  "attestation_not_trusted",
  "disabled_by_user",
  "private_mode",
] as const;

export type ProviderEligibilityReason =
  (typeof providerEligibilityReasonSchemaValues)[number];

export interface ProviderEligibilityContext {
  now: string;
  userEnabled: boolean;
  privateMode: boolean;
  trustedAttestationDigests: readonly string[];
  maximumObservationAgeMs?: number;
}

export interface ProviderEligibilityDecision {
  eligible: boolean;
  reasons: readonly ProviderEligibilityReason[];
}

export function evaluateProviderEligibility(
  attestationInput: ProviderOperationAttestation,
  attestationDigestInput: string,
  observationInput: ProviderRuntimeObservation | undefined,
  context: ProviderEligibilityContext,
): ProviderEligibilityDecision {
  const attestation =
    providerOperationAttestationSchema.parse(attestationInput);
  const attestationDigest = sha256DigestSchema.parse(attestationDigestInput);
  const reasons: ProviderEligibilityReason[] = [];
  const now = Date.parse(context.now);

  if (!observationInput) {
    reasons.push("observation_missing");
  } else {
    const observation =
      providerRuntimeObservationSchema.parse(observationInput);
    if (observation.providerId !== attestation.providerId) {
      reasons.push("provider_mismatch");
    }
    if (observation.installation !== "present") {
      reasons.push("provider_absent");
    }
    if (observation.versionState !== "attested" || !observation.version) {
      reasons.push("version_not_attested");
    } else if (!attestation.compatibleVersions.includes(observation.version)) {
      reasons.push("version_not_compatible");
    }
    if (!observation.executableFingerprint) {
      reasons.push("executable_not_fingerprinted");
    }
    if (observation.authentication !== "authenticated") {
      reasons.push("authentication_not_verified");
    }
    if (observation.health !== "healthy") {
      reasons.push("provider_unhealthy");
    }

    const maximumAge = context.maximumObservationAgeMs ?? 86_400_000;
    const observedAt = Date.parse(observation.observedAt);
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(observedAt) ||
      observedAt > now ||
      now - observedAt > maximumAge
    ) {
      reasons.push("observation_stale");
    }
  }

  if (attestation.implementationStatus !== "verified") {
    reasons.push("implementation_not_verified");
  }
  if (attestation.fixtureDigests.length === 0) {
    reasons.push("fixtures_missing");
  }

  for (const [gate, reason] of [
    [attestation.reviews.technical, "technical_gate_not_approved"],
    [attestation.reviews.contractual, "contractual_gate_not_approved"],
    [attestation.reviews.legal, "legal_gate_not_approved"],
  ] as const) {
    if (gate.status !== "approved") {
      reasons.push(reason);
    } else if (!gate.expiresAt || Date.parse(gate.expiresAt) <= now) {
      reasons.push("gate_expired");
    }
  }

  if (!context.trustedAttestationDigests.includes(attestationDigest)) {
    reasons.push("attestation_not_trusted");
  }
  if (!context.userEnabled) {
    reasons.push("disabled_by_user");
  }
  if (context.privateMode) {
    reasons.push("private_mode");
  }

  return { eligible: reasons.length === 0, reasons };
}
