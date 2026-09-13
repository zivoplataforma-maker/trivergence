import {
  providerOperationAttestationSchema,
  type ProviderOperationAttestation,
} from "@trivergence/contracts";

const pendingReview = (evidenceRefs: readonly string[]) => ({
  status: "pending" as const,
  evidenceRefs: [...evidenceRefs],
});

const codexEvidence = [
  "https://developers.openai.com/codex/app-server/",
  "https://developers.openai.com/codex/auth/",
  "https://openai.com/policies/terms-of-use/",
  "https://openai.com/policies/services-agreement/",
];

const claudeEvidence = [
  "https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication",
  "https://platform.claude.com/docs/en/cli-sdks-libraries/cli/scripting",
  "https://www.anthropic.com/legal/consumer-terms",
  "https://www.anthropic.com/legal/commercial-terms",
];

const geminiEvidence = [
  "https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md",
  "https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md",
  "https://developers.google.com/identity/protocols/oauth2/native-app",
  "https://cloud.google.com/terms",
];

const candidateAttestationsInput = [
  {
    schemaVersion: "1",
    id: "provider.codex.prompt_structured",
    providerId: "codex",
    operation: "prompt_structured",
    officialInterface: "Codex App Server over stdio",
    authenticationMode: "chatgpt_oauth",
    intendedUseCase: "third_party_orchestrator",
    compatibleVersions: [],
    fixtureDigests: [],
    implementationStatus: "not_implemented",
    reviews: {
      technical: pendingReview(codexEvidence),
      contractual: pendingReview(codexEvidence),
      legal: pendingReview(codexEvidence),
    },
  },
  {
    schemaVersion: "1",
    id: "provider.claude.prompt_structured",
    providerId: "claude",
    operation: "prompt_structured",
    officialInterface: "Anthropic ant CLI",
    authenticationMode: "claude_console_oauth",
    intendedUseCase: "third_party_orchestrator",
    compatibleVersions: [],
    fixtureDigests: [],
    implementationStatus: "not_implemented",
    reviews: {
      technical: pendingReview(claudeEvidence),
      contractual: pendingReview(claudeEvidence),
      legal: pendingReview(claudeEvidence),
    },
  },
  {
    schemaVersion: "1",
    id: "provider.gemini.prompt_structured",
    providerId: "gemini",
    operation: "prompt_structured",
    officialInterface: "Vertex AI",
    authenticationMode: "google_vertex_oauth_adc",
    intendedUseCase: "third_party_orchestrator",
    compatibleVersions: [],
    fixtureDigests: [],
    implementationStatus: "not_implemented",
    reviews: {
      technical: pendingReview(geminiEvidence),
      contractual: pendingReview(geminiEvidence),
      legal: pendingReview(geminiEvidence),
    },
  },
];

export const candidateAttestations: readonly ProviderOperationAttestation[] =
  candidateAttestationsInput.map((attestation) =>
    providerOperationAttestationSchema.parse(attestation),
  );

// Intentionally empty until a human gate owner approves a concrete,
// version-bound attestation artifact.
export const trustedProviderAttestationDigests: readonly string[] = [];
