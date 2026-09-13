import type {
  CapabilityId,
  ProviderAuthenticationMode,
  ProviderId,
} from "@trivergence/contracts";

export interface ProviderCandidate {
  providerId: ProviderId;
  displayName: string;
  capabilityId: CapabilityId;
  officialInterface: string;
  authenticationMode: ProviderAuthenticationMode;
  recommendationOrder: number;
  initialScope: readonly string[];
  excludedScope: readonly string[];
}

export const providerCandidates = [
  {
    providerId: "codex",
    displayName: "Codex / OpenAI",
    capabilityId: "provider.codex.prompt.structured",
    officialInterface: "Codex App Server over stdio",
    authenticationMode: "chatgpt_oauth",
    recommendationOrder: 1,
    initialScope: [
      "Structured proposal/response",
      "User-attended local session",
      "Effects returned to the Trivergence planner as proposals",
    ],
    excludedScope: [
      "Commands, file writes, network actions or tools executed by Codex",
      "Externally supplied ChatGPT tokens",
      "WebSocket transport, MCP, apps, dynamic tools and cloud jobs",
      "Unattended execution",
    ],
  },
  {
    providerId: "claude",
    displayName: "Claude / Anthropic",
    capabilityId: "provider.claude.prompt.structured",
    officialInterface: "Anthropic ant CLI",
    authenticationMode: "claude_console_oauth",
    recommendationOrder: 2,
    initialScope: [
      "Messages and streaming",
      "Strict JSON responses",
      "Client-side tool proposals and token counting",
    ],
    excludedScope: [
      "Claude Code subscription credentials",
      "Managed agents, files, batches and code execution",
      "MCP, server-side tools and beta features",
    ],
  },
  {
    providerId: "gemini",
    displayName: "Gemini / Google",
    capabilityId: "provider.gemini.prompt.structured",
    officialInterface: "Vertex AI",
    authenticationMode: "google_vertex_oauth_adc",
    recommendationOrder: 3,
    initialScope: [
      "Text and streaming",
      "Schema-constrained JSON",
      "Function-call proposals",
    ],
    excludedScope: [
      "Gemini CLI or Code Assist OAuth piggybacking",
      "Grounding, code execution and computer use",
      "Managed agents, embeddings and tuning",
    ],
  },
] as const satisfies readonly ProviderCandidate[];

export const recommendedFirstProviderId = "codex" as const;
