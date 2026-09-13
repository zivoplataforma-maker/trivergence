import {
  capabilityDescriptorSchema,
  type CapabilityDescriptor,
  type ProviderOperationAttestation,
  type ProviderRuntimeObservation,
} from "@trivergence/contracts";

import {
  evaluateProviderEligibility,
  type ProviderEligibilityContext,
  type ProviderEligibilityDecision,
} from "./attestation-evaluator.js";
import type { ProviderCandidate } from "./catalog.js";
import { trustedProviderAttestationDigests } from "./manifests.js";

export interface ProviderCapabilityPublication {
  capability: CapabilityDescriptor;
  eligibility: ProviderEligibilityDecision;
}

export type ProviderCapabilityPublicationContext = Omit<
  ProviderEligibilityContext,
  "trustedAttestationDigests"
>;

export function publishProviderCandidateCapability(input: {
  candidate: ProviderCandidate;
  attestation: ProviderOperationAttestation;
  attestationDigest: string;
  observation?: ProviderRuntimeObservation;
  context: ProviderCapabilityPublicationContext;
}): ProviderCapabilityPublication {
  const eligibility = evaluateProviderEligibility(
    input.attestation,
    input.attestationDigest,
    input.observation,
    {
      ...input.context,
      trustedAttestationDigests: trustedProviderAttestationDigests,
    },
  );
  const reason = eligibility.eligible
    ? "All provider gates and runtime evidence are valid."
    : `Unavailable: ${eligibility.reasons.join(", ")}.`;

  const capability = capabilityDescriptorSchema.parse({
    id: input.candidate.capabilityId,
    version: "1",
    displayName: `${input.candidate.displayName} structured prompt`,
    subsystem: "provider",
    status: eligibility.eligible ? "available" : "unavailable",
    mode: "structured",
    action: {
      tool: `${input.candidate.providerId}.promptStructured`,
      toolVersion: "1",
      kinds: ["network"],
      risk: "sensitive",
      summary: `Request a structured proposal from ${input.candidate.displayName}`,
    },
    dependencies: [],
    ...(input.observation
      ? {
          provenance: {
            publisher: "@trivergence/provider-adapters",
            observedAt: input.observation.observedAt,
            observationDigest: input.observation.observationDigest,
            attestationDigest: input.attestationDigest,
            reason,
          },
        }
      : {}),
  });

  return { capability, eligibility };
}
