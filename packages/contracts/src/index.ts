import { z } from "zod";

export const providerIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u,
    "Provider IDs must be stable lowercase namespaces",
  );
export type ProviderId = z.infer<typeof providerIdSchema>;

export const providerStatusSchema = z.enum([
  "not_installed",
  "installed_unverified",
  "compatible_interactive",
  "compatible_structured",
  "authentication_required",
  "terms_blocked",
  "disabled_by_user",
  "unhealthy",
]);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const providerDetectionSchema = z.object({
  id: providerIdSchema,
  displayName: z.string().min(1).max(80),
  status: providerStatusSchema,
  executablePath: z.string().max(2_048).optional(),
  version: z.string().max(120).optional(),
  reason: z.string().max(500),
});
export type ProviderDetection = z.infer<typeof providerDetectionSchema>;

const sha256ValueSchema = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/u, "Expected a lowercase SHA-256 digest");

export const providerOperationSchema = z.enum(["prompt_structured"]);
export type ProviderOperation = z.infer<typeof providerOperationSchema>;

export const providerAuthenticationModeSchema = z.enum([
  "chatgpt_oauth",
  "codex_access_token",
  "claude_console_oauth",
  "workload_identity_federation",
  "google_vertex_oauth_adc",
]);
export type ProviderAuthenticationMode = z.infer<
  typeof providerAuthenticationModeSchema
>;

export const providerGateReviewStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "stale",
]);
export type ProviderGateReviewStatus = z.infer<
  typeof providerGateReviewStatusSchema
>;

export const providerGateReviewSchema = z
  .object({
    status: providerGateReviewStatusSchema,
    reviewer: z.string().min(1).max(120).optional(),
    reviewedAt: z.iso.datetime().optional(),
    expiresAt: z.iso.datetime().optional(),
    evidenceRefs: z.array(z.string().min(1).max(2_048)).max(20),
    notes: z.string().min(1).max(2_000).optional(),
  })
  .superRefine((review, context) => {
    if (
      review.status === "approved" &&
      (!review.reviewer ||
        !review.reviewedAt ||
        !review.expiresAt ||
        review.evidenceRefs.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Approved provider gates require reviewer, reviewedAt, expiresAt and evidence",
      });
    }
  });
export type ProviderGateReview = z.infer<typeof providerGateReviewSchema>;

export const providerImplementationStatusSchema = z.enum([
  "not_implemented",
  "verified",
]);
export type ProviderImplementationStatus = z.infer<
  typeof providerImplementationStatusSchema
>;

export const providerOperationAttestationSchema = z.object({
  schemaVersion: z.literal("1"),
  id: z.string().min(3).max(160),
  providerId: providerIdSchema,
  operation: providerOperationSchema,
  officialInterface: z.string().min(1).max(160),
  authenticationMode: providerAuthenticationModeSchema,
  intendedUseCase: z.literal("third_party_orchestrator"),
  compatibleVersions: z.array(z.string().min(1).max(120)).max(32),
  fixtureDigests: z.array(sha256ValueSchema).max(64),
  implementationStatus: providerImplementationStatusSchema,
  reviews: z.object({
    technical: providerGateReviewSchema,
    contractual: providerGateReviewSchema,
    legal: providerGateReviewSchema,
  }),
});
export type ProviderOperationAttestation = z.infer<
  typeof providerOperationAttestationSchema
>;

export const providerRuntimeObservationSchema = z.object({
  providerId: providerIdSchema,
  installation: z.enum(["absent", "present"]),
  versionState: z.enum(["unknown", "unsupported", "attested"]),
  version: z.string().min(1).max(120).optional(),
  authentication: z.enum([
    "unknown",
    "required",
    "authenticated",
    "not_applicable",
  ]),
  health: z.enum(["unknown", "healthy", "unhealthy"]),
  executableFingerprint: sha256ValueSchema.optional(),
  observedAt: z.iso.datetime(),
  observationDigest: sha256ValueSchema,
});
export type ProviderRuntimeObservation = z.infer<
  typeof providerRuntimeObservationSchema
>;

export const diagnosticsSchema = z.object({
  appVersion: z.string().min(1).max(80),
  platform: z.string().min(1).max(40),
  arch: z.string().min(1).max(40),
  providers: z
    .array(providerDetectionSchema)
    .min(1)
    .max(64)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      {
        message: "Provider diagnostic IDs must be unique",
      },
    ),
  rendererSecurity: z.object({
    contextIsolation: z.literal(true),
    nodeIntegration: z.literal(false),
    sandbox: z.literal(true),
  }),
});
export type Diagnostics = z.infer<typeof diagnosticsSchema>;

export const actionKindSchema = z.enum([
  "read",
  "write",
  "execute",
  "network",
  "git",
  "delete",
  "system",
  "credentials",
]);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const riskSchema = z.enum([
  "safe",
  "guarded",
  "sensitive",
  "destructive",
]);
export type Risk = z.infer<typeof riskSchema>;

export const policyProfileSchema = z.enum([
  "observer",
  "assistant",
  "developer",
]);
export type PolicyProfile = z.infer<typeof policyProfileSchema>;

const actionInputValueSchema = z.union([
  z.string().max(2_048),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(2_048)).max(64),
]);

export const actionInputSchema = z
  .record(
    z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-zA-Z0-9]*$/u, "Action input keys must be camelCase"),
    actionInputValueSchema,
  )
  .superRefine((input, context) => {
    if (Object.keys(input).length > 32) {
      context.addIssue({
        code: "custom",
        message: "Action inputs cannot contain more than 32 fields",
      });
    }
  });
export type ActionInput = z.infer<typeof actionInputSchema>;

export const actionRequestSchema = z.object({
  id: z.string().uuid(),
  tool: z.string().min(1).max(120),
  toolVersion: z.string().min(1).max(40),
  kinds: z.array(actionKindSchema).min(1),
  risk: riskSchema,
  workspaceId: z.string().uuid().optional(),
  targets: z.array(z.string().min(1).max(2_048)).max(64).optional(),
  input: actionInputSchema.optional(),
  summary: z.string().min(1).max(500),
});
export type ActionRequest = z.infer<typeof actionRequestSchema>;

export const policyDecisionSchema = z.object({
  decision: z.enum(["allow", "deny", "require_approval"]),
  reason: z.string().min(1).max(500),
  matchedRule: z.string().min(1).max(120),
  rulesetVersion: z.literal("1"),
});
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export const policyEvaluationRequestSchema = z.object({
  profile: policyProfileSchema,
  action: actionRequestSchema,
});
export type PolicyEvaluationRequest = z.infer<
  typeof policyEvaluationRequestSchema
>;

export const subsystemKindSchema = z.enum([
  "runtime",
  "agent",
  "provider",
  "memory",
  "workflow",
  "workspace",
  "tool",
  "persistence",
]);
export type SubsystemKind = z.infer<typeof subsystemKindSchema>;

export const capabilityStatusSchema = z.enum([
  "available",
  "degraded",
  "unavailable",
  "disabled",
]);
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;

export const capabilityModeSchema = z.enum([
  "structured",
  "interactive",
  "external",
]);
export type CapabilityMode = z.infer<typeof capabilityModeSchema>;

export const capabilityIdSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u,
    "Capability IDs must be stable lowercase namespaces",
  );
export type CapabilityId = z.infer<typeof capabilityIdSchema>;

export const capabilityActionSchema = z.object({
  tool: z.string().min(1).max(120),
  toolVersion: z.string().min(1).max(40),
  kinds: z.array(actionKindSchema).min(1).max(8),
  risk: riskSchema,
  summary: z.string().min(1).max(500),
});
export type CapabilityAction = z.infer<typeof capabilityActionSchema>;

export const capabilityProvenanceSchema = z.object({
  publisher: z.string().min(1).max(120),
  observedAt: z.iso.datetime(),
  observationDigest: sha256ValueSchema,
  attestationDigest: sha256ValueSchema,
  reason: z.string().min(1).max(500),
});
export type CapabilityProvenance = z.infer<typeof capabilityProvenanceSchema>;

export const capabilityDescriptorSchema = z.object({
  id: capabilityIdSchema,
  version: z.string().min(1).max(40),
  displayName: z.string().min(1).max(120),
  subsystem: subsystemKindSchema,
  status: capabilityStatusSchema,
  mode: capabilityModeSchema,
  action: capabilityActionSchema,
  dependencies: z.array(capabilityIdSchema).max(32).default([]),
  routing: z
    .object({
      objectiveTerms: z.array(z.string().trim().min(2).max(80)).min(1).max(32),
      priority: z.number().int().min(0).max(100).default(50),
    })
    .optional(),
  provenance: capabilityProvenanceSchema.optional(),
});
export type CapabilityDescriptor = z.infer<typeof capabilityDescriptorSchema>;

export const orchestrationRequestSchema = z
  .object({
    id: z.string().uuid(),
    goal: z.string().trim().min(3).max(2_000),
    profile: policyProfileSchema,
    privacyMode: z.enum(["private", "standard"]).optional(),
    workspaceId: z.string().uuid().optional(),
    requestedCapabilities: z
      .array(capabilityIdSchema)
      .max(64)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Requested capabilities must be unique",
      })
      .default([]),
    capabilityInputs: z
      .record(capabilityIdSchema, actionInputSchema)
      .optional(),
  })
  .superRefine((request, context) => {
    if (Object.keys(request.capabilityInputs ?? {}).length > 64) {
      context.addIssue({
        code: "custom",
        path: ["capabilityInputs"],
        message: "Capability inputs cannot exceed 64 routes",
      });
    }
  });
export type OrchestrationRequest = z.infer<typeof orchestrationRequestSchema>;

export const strategyRouteCandidateSchema = z.object({
  id: capabilityIdSchema,
  capabilityIds: z.array(capabilityIdSchema).min(1).max(64),
  score: z.number().int().min(0).max(10_000),
  status: z.enum(["eligible", "not_matched", "unavailable", "privacy_blocked"]),
  reason: z.string().min(1).max(500),
  matchedTerms: z.array(z.string().min(1).max(80)).max(32),
});
export type StrategyRouteCandidate = z.infer<
  typeof strategyRouteCandidateSchema
>;

export const strategyDecisionSchema = z.object({
  kind: z.enum(["direct", "sequential", "parallel", "unavailable"]),
  reason: z.string().min(1).max(500),
  capabilityIds: z.array(capabilityIdSchema).max(64),
  evidence: z.array(z.string().min(1).max(300)).max(64),
  candidates: z.array(strategyRouteCandidateSchema).max(64).optional(),
  strategyVersion: z.enum(["1", "2"]),
});
export type StrategyDecision = z.infer<typeof strategyDecisionSchema>;

export const planIssueSchema = z.object({
  code: z.enum([
    "strategy_unavailable",
    "capability_missing",
    "capability_unavailable",
    "dependency_cycle",
    "plan_limit_exceeded",
  ]),
  message: z.string().min(1).max(500),
  capabilityId: capabilityIdSchema.optional(),
});
export type PlanIssue = z.infer<typeof planIssueSchema>;

export const plannedStepSchema = z.object({
  id: z.string().min(1).max(80),
  capabilityId: capabilityIdSchema,
  subsystem: subsystemKindSchema,
  dependsOn: z.array(z.string().min(1).max(80)).max(32),
  action: actionRequestSchema,
  policy: policyDecisionSchema,
});
export type PlannedStep = z.infer<typeof plannedStepSchema>;

export const executionPlanSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  strategy: strategyDecisionSchema,
  steps: z.array(plannedStepSchema).max(256),
  issues: z.array(planIssueSchema).max(256),
  plannerVersion: z.literal("1"),
});
export type ExecutionPlan = z.infer<typeof executionPlanSchema>;

export const evaluationCheckSchema = z.object({
  id: z.enum([
    "strategy_resolved",
    "plan_valid",
    "steps_present",
    "policy_satisfied",
  ]),
  passed: z.boolean(),
  evidence: z.string().min(1).max(500),
});
export type EvaluationCheck = z.infer<typeof evaluationCheckSchema>;

export const planEvaluationSchema = z.object({
  phase: z.literal("preflight").optional(),
  status: z.enum(["ready", "approval_required", "blocked"]),
  reason: z.string().min(1).max(500),
  checks: z.array(evaluationCheckSchema).length(4),
  evaluatorVersion: z.enum(["1", "2"]),
});
export type PlanEvaluation = z.infer<typeof planEvaluationSchema>;

export const outcomeEvaluationCheckSchema = z.object({
  id: z.enum([
    "run_terminal",
    "run_completed",
    "evidence_complete",
    "evidence_correlated",
    "step_outcomes_succeeded",
  ]),
  passed: z.boolean(),
  evidence: z.string().min(1).max(500),
});

export const executionOutcomeEvaluationSchema = z.object({
  phase: z.literal("postflight"),
  status: z.enum(["accepted", "rejected"]),
  reason: z.string().min(1).max(500),
  checks: z.array(outcomeEvaluationCheckSchema).length(5),
  evaluatorVersion: z.literal("2"),
});
export type ExecutionOutcomeEvaluation = z.infer<
  typeof executionOutcomeEvaluationSchema
>;

export const sha256DigestSchema = sha256ValueSchema;
export type Sha256Digest = z.infer<typeof sha256DigestSchema>;

export const artifactIntegritySchema = z.object({
  algorithm: z.literal("sha256"),
  digest: sha256DigestSchema,
  canonicalizationVersion: z.literal("1"),
});
export type ArtifactIntegrity = z.infer<typeof artifactIntegritySchema>;

export const capabilitySnapshotIdentitySchema = z.object({
  id: sha256DigestSchema,
  version: z.string().min(1).max(80),
  capabilityCount: z.number().int().min(1).max(1_000),
});
export type CapabilitySnapshotIdentity = z.infer<
  typeof capabilitySnapshotIdentitySchema
>;

export const orchestrationIntegrityPayloadSchema = z.object({
  request: orchestrationRequestSchema,
  registrySnapshot: capabilitySnapshotIdentitySchema,
  strategy: strategyDecisionSchema,
  plan: executionPlanSchema,
  evaluation: planEvaluationSchema,
});
export type OrchestrationIntegrityPayload = z.infer<
  typeof orchestrationIntegrityPayloadSchema
>;

export const orchestrationPreviewSchema = z
  .object({
    request: orchestrationRequestSchema,
    registryVersion: z.string().min(1).max(80),
    registrySnapshot: capabilitySnapshotIdentitySchema,
    strategy: strategyDecisionSchema,
    plan: executionPlanSchema,
    evaluation: planEvaluationSchema,
    planIntegrity: artifactIntegritySchema,
  })
  .refine(
    (preview) => preview.registryVersion === preview.registrySnapshot.version,
    {
      message: "Registry version must match the signed snapshot",
      path: ["registryVersion"],
    },
  );
export type OrchestrationPreview = z.infer<typeof orchestrationPreviewSchema>;

export const revalidationCheckSchema = z.object({
  id: z.enum(["registry_snapshot_matches", "plan_integrity_matches"]),
  passed: z.boolean(),
  evidence: z.string().min(1).max(500),
});
export type RevalidationCheck = z.infer<typeof revalidationCheckSchema>;

export const revalidationResultSchema = z.object({
  valid: z.boolean(),
  checks: z.array(revalidationCheckSchema).length(2),
  revalidationVersion: z.literal("1"),
});
export type RevalidationResult = z.infer<typeof revalidationResultSchema>;

export const executionRunStatusSchema = z.enum([
  "planned",
  "awaiting_approval",
  "approved",
  "running",
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "orphaned",
]);
export type ExecutionRunStatus = z.infer<typeof executionRunStatusSchema>;

export const executionRunSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  planId: z.string().uuid(),
  registrySnapshotId: sha256DigestSchema,
  planDigest: sha256DigestSchema,
  status: executionRunStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ExecutionRun = z.infer<typeof executionRunSchema>;

export const stepEvidenceSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().min(1).max(80),
  capabilityId: capabilityIdSchema,
  subsystem: subsystemKindSchema,
  capabilityVersion: z.string().min(1).max(40),
  outcome: z.enum(["succeeded", "failed", "cancelled", "timed_out"]),
  observedAt: z.iso.datetime(),
  summary: z.string().min(1).max(500),
  outputDigest: sha256DigestSchema.optional(),
});
export type StepEvidence = z.infer<typeof stepEvidenceSchema>;

export const providerTransportSchema = z.enum([
  "in_memory_stream",
  "stdio_jsonl",
  "http_stream",
]);
export type ProviderTransport = z.infer<typeof providerTransportSchema>;

export const providerBudgetSchema = z.object({
  maxInputBytes: z.number().int().min(1).max(1_048_576),
  maxOutputBytes: z.number().int().min(1).max(1_048_576),
  maxChunks: z.number().int().min(1).max(1_024),
  timeoutMs: z.number().int().min(10).max(300_000),
  maxCostMicrounits: z.number().int().nonnegative().max(1_000_000_000),
});
export type ProviderBudget = z.infer<typeof providerBudgetSchema>;

export const providerRequestInputSchema = z.object({
  prompt: z.string().trim().min(1).max(2_048),
  context: z.array(z.string().max(2_048)).max(64).default([]),
  maxInputBytes: z.number().int().min(1).max(1_048_576).default(65_536),
  maxOutputBytes: z.number().int().min(1).max(1_048_576).default(65_536),
  maxChunks: z.number().int().min(1).max(1_024).default(128),
  timeoutMs: z.number().int().min(10).max(300_000).default(30_000),
  maxCostMicrounits: z
    .number()
    .int()
    .nonnegative()
    .max(1_000_000_000)
    .default(0),
  scenario: z
    .enum(["normal", "slow", "error", "recoverable_error"])
    .default("normal"),
});
export type ProviderRequestInput = z.infer<typeof providerRequestInputSchema>;

export const providerContextItemSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
  bytes: z.number().int().nonnegative().max(1_048_576),
  digest: sha256DigestSchema,
  dataClass: z.enum(["instruction", "workspace_context", "user_context"]),
});
export type ProviderContextItem = z.infer<typeof providerContextItemSchema>;

export const providerContextPreviewSchema = z.object({
  destination: z.string().min(1).max(2_048),
  networkRequired: z.boolean(),
  promptBytes: z.number().int().positive().max(1_048_576),
  promptDigest: sha256DigestSchema,
  items: z.array(providerContextItemSchema).max(64),
  totalBytes: z.number().int().positive().max(1_048_576),
  redactionApplied: z.boolean(),
});
export type ProviderContextPreview = z.infer<
  typeof providerContextPreviewSchema
>;

export const providerExecutionPreviewSchema = z.object({
  schemaVersion: z.literal("1"),
  adapterId: z
    .string()
    .min(3)
    .max(120)
    .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u),
  providerId: z.string().min(1).max(80),
  operation: providerOperationSchema,
  transport: providerTransportSchema,
  context: providerContextPreviewSchema,
  budget: providerBudgetSchema,
  adapterVersion: z.string().min(1).max(40),
  adapterBuildDigest: sha256DigestSchema,
  requestDigest: sha256DigestSchema,
  contextDigest: sha256DigestSchema,
  recoveryPolicy: z.enum(["none", "single_checkpoint_retry"]),
});
export type ProviderExecutionPreview = z.infer<
  typeof providerExecutionPreviewSchema
>;

export const providerRecoveryCheckpointSchema = z.object({
  schemaVersion: z.literal("1"),
  requestDigest: sha256DigestSchema,
  nextChunkIndex: z.number().int().nonnegative().max(1_024),
  emittedBytes: z.number().int().nonnegative().max(1_048_576),
  recoveryCursor: z.string().min(1).max(256),
  checkpointDigest: sha256DigestSchema,
});
export type ProviderRecoveryCheckpoint = z.infer<
  typeof providerRecoveryCheckpointSchema
>;

export const providerCheckpointRecordSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().min(1).max(80),
  capabilityId: capabilityIdSchema,
  adapterId: z.string().min(3).max(120),
  providerId: z.string().min(1).max(80),
  requestDigest: sha256DigestSchema,
  checkpoint: providerRecoveryCheckpointSchema,
  status: z.enum(["active", "consumed"]),
  observedAt: z.iso.datetime(),
  consumedAt: z.iso.datetime().optional(),
});
export type ProviderCheckpointRecord = z.infer<
  typeof providerCheckpointRecordSchema
>;

export const providerAdapterErrorCodeSchema = z.enum([
  "invalid_request",
  "input_budget_exceeded",
  "output_budget_exceeded",
  "chunk_budget_exceeded",
  "cost_budget_exceeded",
  "timed_out",
  "cancelled",
  "transport_error",
  "protocol_error",
  "recovery_unavailable",
]);
export type ProviderAdapterErrorCode = z.infer<
  typeof providerAdapterErrorCodeSchema
>;

export const providerAdapterErrorSchema = z.object({
  code: providerAdapterErrorCodeSchema,
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});
export type ProviderAdapterError = z.infer<typeof providerAdapterErrorSchema>;

const providerStreamEventBase = {
  requestId: z.string().uuid(),
  sequence: z.number().int().nonnegative().max(1_000_000),
  observedAt: z.iso.datetime(),
};

export const providerStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ ...providerStreamEventBase, type: z.literal("started") }),
  z.object({
    ...providerStreamEventBase,
    type: z.literal("delta"),
    text: z.string().min(1).max(65_536),
  }),
  z.object({
    ...providerStreamEventBase,
    type: z.literal("usage"),
    inputBytes: z.number().int().nonnegative().max(1_048_576),
    outputBytes: z.number().int().nonnegative().max(1_048_576),
    chunks: z.number().int().nonnegative().max(1_024),
    costMicrounits: z.number().int().nonnegative().max(1_000_000_000),
  }),
  z.object({
    ...providerStreamEventBase,
    type: z.literal("checkpoint"),
    checkpoint: providerRecoveryCheckpointSchema,
  }),
  z.object({
    ...providerStreamEventBase,
    type: z.literal("completed"),
    finishReason: z.enum(["stop", "budget"]),
  }),
  z.object({
    ...providerStreamEventBase,
    type: z.literal("error"),
    error: providerAdapterErrorSchema,
    checkpoint: providerRecoveryCheckpointSchema.optional(),
  }),
]);
export type ProviderStreamEvent = z.infer<typeof providerStreamEventSchema>;

export const runtimeStreamEventSchema = z.object({
  runId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().min(1).max(80),
  capabilityId: capabilityIdSchema,
  event: providerStreamEventSchema,
  checkpointRecordId: z.string().uuid().optional(),
});
export type RuntimeStreamEvent = z.infer<typeof runtimeStreamEventSchema>;

export const providerUsageSchema = z.object({
  inputBytes: z.number().int().nonnegative().max(1_048_576),
  outputBytes: z.number().int().nonnegative().max(1_048_576),
  chunks: z.number().int().nonnegative().max(1_024),
  elapsedMs: z.number().int().nonnegative().max(300_000),
  estimatedInputTokens: z.number().int().nonnegative().max(1_048_576),
  estimatedOutputTokens: z.number().int().nonnegative().max(1_048_576),
  costMicrounits: z.number().int().nonnegative().max(1_000_000_000),
});
export type ProviderUsage = z.infer<typeof providerUsageSchema>;

export const providerExecutionProvenanceSchema = z.object({
  adapterId: z.string().min(3).max(120),
  adapterVersion: z.string().min(1).max(40),
  adapterBuildDigest: sha256DigestSchema,
  providerId: z.string().min(1).max(80),
  transport: providerTransportSchema,
  requestDigest: sha256DigestSchema,
  contextDigest: sha256DigestSchema,
  localOnly: z.boolean(),
  recoveredFromCheckpoint: z.boolean(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
});
export type ProviderExecutionProvenance = z.infer<
  typeof providerExecutionProvenanceSchema
>;

export const providerExecutionResultSchema = z.object({
  schemaVersion: z.literal("1"),
  requestId: z.string().uuid(),
  outcome: z.enum(["succeeded", "failed", "cancelled", "timed_out"]),
  response: z.string().max(1_048_576).optional(),
  usage: providerUsageSchema,
  provenance: providerExecutionProvenanceSchema,
  error: providerAdapterErrorSchema.optional(),
  finalCheckpoint: providerRecoveryCheckpointSchema.optional(),
});
export type ProviderExecutionResult = z.infer<
  typeof providerExecutionResultSchema
>;

export const executionDescriptorSchema = z
  .object({
    version: z.literal("1"),
    kind: z.enum(["internal", "process", "provider"]),
    capabilityId: capabilityIdSchema,
    capabilityVersion: z.string().min(1).max(40),
    subsystem: subsystemKindSchema,
    summary: z.string().min(1).max(500),
    executable: z.string().min(1).max(2_048).optional(),
    argv: z.array(z.string().max(8_192)).max(128),
    cwd: z.string().min(1).max(2_048).optional(),
    environmentNames: z
      .array(z.string().min(1).max(120))
      .max(64)
      .refine((names) => new Set(names).size === names.length, {
        message: "Environment names must be unique",
      }),
    environmentDigest: sha256DigestSchema,
    networkDestinations: z.array(z.string().min(1).max(2_048)).max(64),
    targets: z.array(z.string().min(1).max(2_048)).max(64),
    providerRequest: providerExecutionPreviewSchema.optional(),
  })
  .superRefine((descriptor, context) => {
    if (
      descriptor.kind === "process" &&
      (!descriptor.executable || descriptor.cwd === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Process descriptors require executable and cwd",
      });
    }
    if (
      descriptor.kind === "internal" &&
      (descriptor.executable ||
        descriptor.cwd ||
        descriptor.argv.length > 0 ||
        descriptor.providerRequest)
    ) {
      context.addIssue({
        code: "custom",
        message: "Internal descriptors cannot contain process fields",
      });
    }
    if (
      descriptor.kind === "process" &&
      descriptor.providerRequest !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Process descriptors cannot contain provider fields",
      });
    }
    if (
      descriptor.kind === "provider" &&
      (!descriptor.providerRequest ||
        descriptor.executable ||
        descriptor.cwd ||
        descriptor.argv.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Provider descriptors require providerRequest and cannot contain process fields",
      });
    }
  });
export type ExecutionDescriptor = z.infer<typeof executionDescriptorSchema>;

export const approvalStatusSchema = z.enum([
  "pending",
  "granted",
  "denied",
  "consumed",
  "expired",
]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalRecordSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().min(1).max(80),
  actionDigest: sha256DigestSchema,
  planDigest: sha256DigestSchema,
  rulesetVersion: z.string().min(1).max(40),
  descriptor: executionDescriptorSchema,
  status: approvalStatusSchema,
  requestedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().optional(),
  consumedAt: z.iso.datetime().optional(),
  actor: z.string().min(1).max(120).optional(),
});
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;

export const planExecutionBindingSchema = z.object({
  planId: z.string().uuid(),
  requestId: z.string().uuid(),
  registrySnapshotId: sha256DigestSchema,
  planDigest: sha256DigestSchema,
  evaluationStatus: z.enum(["ready", "approval_required", "blocked"]),
});
export type PlanExecutionBinding = z.infer<typeof planExecutionBindingSchema>;

export const auditEventTypeSchema = z.enum([
  "orchestration.preview_persisted",
  "approval.requested",
  "approval.granted",
  "approval.denied",
  "approval.consumed",
  "approval.expired",
  "execution.blocked",
  "execution.run_created",
  "execution.evidence_recorded",
  "execution.run_status_changed",
  "execution.outcome_evaluated",
  "provider.checkpoint_recorded",
  "provider.checkpoint_consumed",
  "memory.entry_stored",
  "memory.entry_deleted",
  "memory.expired_pruned",
  "persistence.recovery_entered",
  "privacy.retention_changed",
  "privacy.workspace_data_deleted",
]);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

const auditPayloadValueSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const auditPayloadSchema = z
  .record(z.string().min(1).max(80), auditPayloadValueSchema)
  .superRefine((payload, context) => {
    if (Object.keys(payload).length > 64) {
      context.addIssue({
        code: "custom",
        message: "Audit payloads cannot contain more than 64 fields",
      });
    }
  });
export type AuditPayload = z.infer<typeof auditPayloadSchema>;

export const auditEventSchema = z.object({
  sequence: z.number().int().positive(),
  id: z.string().uuid(),
  occurredAt: z.iso.datetime(),
  eventType: auditEventTypeSchema,
  subjectId: z.string().min(1).max(120),
  payload: auditPayloadSchema,
  previousDigest: sha256DigestSchema,
  eventDigest: sha256DigestSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const desktopWorkspaceSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  rootPath: z.string().min(1).max(2_048),
  fingerprint: sha256DigestSchema,
  capabilities: z.array(capabilityIdSchema).min(1).max(32),
  recoveredRuns: z.number().int().nonnegative().max(10_000),
  persistence: z.object({
    mode: z.enum(["readwrite", "readonly-recovery"]),
    databaseIntegrity: z.enum(["ok", "failed"]),
    auditValid: z.boolean(),
    privilegedActionsAvailable: z.boolean(),
    reason: z.string().min(1).max(500).optional(),
    recovery: z
      .object({
        incidentId: z.string().uuid(),
        detectedAt: z.iso.datetime(),
        reason: z.string().min(1).max(500),
        quarantineDirectory: z.string().min(1).max(2_048),
        files: z
          .array(
            z.object({
              name: z.string().min(1).max(255),
              size: z.number().int().nonnegative(),
              sha256: sha256DigestSchema,
            }),
          )
          .max(3),
      })
      .optional(),
  }),
});
export type DesktopWorkspace = z.infer<typeof desktopWorkspaceSchema>;

export const persistenceStatusResponseSchema =
  desktopWorkspaceSchema.shape.persistence.extend({
    recoveredRuns: z.number().int().nonnegative().max(10_000),
  });

export const workspaceSelectionResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("cancelled") }),
  z.object({
    status: z.literal("selected"),
    workspace: desktopWorkspaceSchema,
  }),
]);
export type WorkspaceSelectionResponse = z.infer<
  typeof workspaceSelectionResponseSchema
>;

const workspacePreviewBase = {
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  goal: z.string().trim().min(3).max(2_000),
  profile: policyProfileSchema,
  privacyMode: z.enum(["private", "standard"]).default("private"),
};

export const workspacePreviewRequestSchema = z
  .object({
    ...workspacePreviewBase,
    detail: z.string().trim().max(2_048).default(""),
    routeHint: capabilityIdSchema.optional(),
    maxAgents: z.number().int().min(1).max(3).default(3),
    maxProviderCalls: z.number().int().min(1).max(4).default(4),
    maxOutputBytes: z.number().int().min(256).max(65_536).default(65_536),
    maxMemoryItems: z.number().int().min(0).max(16).default(4),
    maxMemoryBytes: z.number().int().min(0).max(65_536).default(16_384),
    timeoutMs: z.number().int().min(100).max(60_000).default(10_000),
    maxReplans: z.number().int().min(0).max(1).default(1),
    retentionDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();
export type WorkspacePreviewRequest = z.infer<
  typeof workspacePreviewRequestSchema
>;

const approvalIdsSchema = z
  .record(z.string().min(1).max(80), z.string().uuid())
  .superRefine((value, context) => {
    if (Object.keys(value).length > 256) {
      context.addIssue({
        code: "custom",
        message: "Approval bindings cannot exceed 256 steps",
      });
    }
  });

export const workspaceExecutionStartRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.string().uuid(),
  approvalIds: approvalIdsSchema.optional(),
});
export type WorkspaceExecutionStartRequest = z.infer<
  typeof workspaceExecutionStartRequestSchema
>;

export const workspaceExecutionStartResponseSchema = z.object({
  runId: z.string().uuid(),
  status: z.literal("running"),
});
export type WorkspaceExecutionStartResponse = z.infer<
  typeof workspaceExecutionStartResponseSchema
>;

export const workspaceRunReferenceSchema = z.object({
  runId: z.string().uuid(),
});
export type WorkspaceRunReference = z.infer<typeof workspaceRunReferenceSchema>;

export const workspaceFileOutputSchema = z.object({
  kind: z.literal("file"),
  path: z.string().min(1).max(2_048),
  content: z.string().max(1_048_576),
  bytes: z.number().int().nonnegative().max(1_048_576),
  sha256: sha256DigestSchema,
});

export const workspaceSearchOutputSchema = z.object({
  kind: z.literal("search"),
  query: z.string().min(1).max(200),
  matches: z
    .array(
      z.object({
        path: z.string().min(1).max(2_048),
        line: z.number().int().positive(),
        column: z.number().int().positive(),
        preview: z.string().max(500),
      }),
    )
    .max(200),
  filesScanned: z.number().int().nonnegative().max(5_000),
  bytesScanned: z
    .number()
    .int()
    .nonnegative()
    .max(20 * 1_048_576),
  truncated: z.boolean(),
});

export const workspaceProviderOutputSchema = z.object({
  kind: z.literal("provider"),
  result: providerExecutionResultSchema,
});

export const workspaceWorkflowOutputSchema = z.object({
  kind: z.literal("workflow"),
  result: z.object({
    schemaVersion: z.literal("1"),
    outcome: z.enum(["accepted", "rejected"]),
    result: z.string().max(65_536),
    checks: z.array(
      z.object({
        id: z.string().min(1).max(80),
        passed: z.boolean(),
        evidence: z.string().min(1).max(500),
      }),
    ),
    workflowId: z.string().uuid(),
    memoryEntryId: z.string().uuid(),
    memoryContentDigest: sha256DigestSchema,
    agentTeamDigest: sha256DigestSchema,
    budget: z.object({
      maxAgents: z.number().int().min(1).max(3),
      maxProviderCalls: z.number().int().min(1).max(4),
      maxInputBytes: z.number().int().min(256).max(65_536),
      maxOutputBytes: z.number().int().min(256).max(65_536),
      maxMemoryItems: z.number().int().min(0).max(16),
      maxMemoryBytes: z.number().int().min(0).max(65_536),
      timeoutMs: z.number().int().min(100).max(60_000),
      maxCostMicrounits: z.number().int().nonnegative().max(1_000_000),
      maxReplans: z.number().int().min(0).max(1),
      retentionDays: z.number().int().min(1).max(365),
    }),
    usage: z.object({
      providerCalls: z.number().int().min(1).max(4),
      inputBytes: z.number().int().nonnegative(),
      outputBytes: z.number().int().nonnegative(),
      costMicrounits: z.number().int().nonnegative(),
      replansUsed: z.number().int().min(0).max(1),
      elapsedMs: z.number().int().nonnegative().max(60_000),
      memoryItems: z.number().int().nonnegative().max(16),
      memoryBytes: z.number().int().nonnegative().max(65_536),
    }),
    provenanceDigest: sha256DigestSchema,
  }),
});

export const workspaceExecutionOutputSchema = z.discriminatedUnion("kind", [
  workspaceFileOutputSchema,
  workspaceSearchOutputSchema,
  workspaceProviderOutputSchema,
  workspaceWorkflowOutputSchema,
]);
export type WorkspaceExecutionOutput = z.infer<
  typeof workspaceExecutionOutputSchema
>;

export const workspaceExecutionStatusSchema = z.enum([
  "running",
  "cancelling",
  "completed",
  "blocked",
  "approval_required",
  "failed",
  "cancelled",
  "timed_out",
  "orphaned",
]);

export const workspaceExecutionStateSchema = z.object({
  runId: z.string().uuid(),
  status: workspaceExecutionStatusSchema,
  reason: z.string().min(1).max(500),
  evidenceCount: z.number().int().nonnegative().max(256),
  stream: z.array(runtimeStreamEventSchema).max(256).optional(),
  output: workspaceExecutionOutputSchema.optional(),
  outputUnavailableReason: z.string().min(1).max(500).optional(),
  outcomeEvaluation: executionOutcomeEvaluationSchema.optional(),
});
export type WorkspaceExecutionState = z.infer<
  typeof workspaceExecutionStateSchema
>;

export const workspaceExecutionCancelResponseSchema = z.object({
  runId: z.string().uuid(),
  accepted: z.boolean(),
});

export const workspaceApprovalRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().min(1).max(80),
});
export type WorkspaceApprovalRequest = z.infer<
  typeof workspaceApprovalRequestSchema
>;

export const workspaceApprovalResponseSchema = z.object({
  approvalId: z.string().uuid(),
  planId: z.string().uuid(),
  stepId: z.string().min(1).max(80),
  actionSummary: z.string().min(1).max(500),
  policyReason: z.string().min(1).max(500),
  expiresAt: z.iso.datetime(),
  descriptor: executionDescriptorSchema,
});
export type WorkspaceApprovalResponse = z.infer<
  typeof workspaceApprovalResponseSchema
>;

export const workspaceApprovalDecisionRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  approvalId: z.string().uuid(),
  decision: z.enum(["grant", "deny"]),
});
export type WorkspaceApprovalDecisionRequest = z.infer<
  typeof workspaceApprovalDecisionRequestSchema
>;

export const workspaceApprovalDecisionResponseSchema = z.object({
  approvalId: z.string().uuid(),
  status: approvalStatusSchema,
});

export const workspaceHistoryRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(25),
});
export type WorkspaceHistoryRequest = z.infer<
  typeof workspaceHistoryRequestSchema
>;

export const workspaceHistoryEntrySchema = z.object({
  runId: z.string().uuid(),
  goal: z.string().min(3).max(2_000),
  strategyKind: strategyDecisionSchema.shape.kind,
  status: executionRunStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  evidenceCount: z.number().int().nonnegative().max(256),
});
export type WorkspaceHistoryEntry = z.infer<typeof workspaceHistoryEntrySchema>;

export const workspaceHistoryResponseSchema = z.object({
  entries: z.array(workspaceHistoryEntrySchema).max(100),
});
export type WorkspaceHistoryResponse = z.infer<
  typeof workspaceHistoryResponseSchema
>;

export const workspaceAuditRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const workspaceAuditResponseSchema = z.object({
  valid: z.boolean(),
  events: z.array(auditEventSchema).max(100),
});

export const workspaceRetentionRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  days: z.number().int().min(1).max(365),
});
export const workspaceRetentionResponseSchema = z.object({
  days: z.number().int().min(1).max(365),
  deletedRequests: z.number().int().nonnegative(),
});
export const workspaceDataRequestSchema = z.object({
  workspaceId: z.string().uuid(),
});
export const workspaceDataDeleteResponseSchema = z.object({
  status: z.enum(["deleted", "cancelled"]),
  deletedRequests: z.number().int().nonnegative(),
});
export const workspaceDataExportResponseSchema = z.object({
  status: z.enum(["saved", "cancelled"]),
});

export const ipcChannels = {
  providerConfigurationGet: "providers:configuration:get",
  providerConfigurationSave: "providers:configuration:save",
  diagnosticsGet: "diagnostics:get",
  persistenceStatusGet: "persistence:status:get",
  policyEvaluate: "policy:evaluate",
  orchestrationPreview: "orchestration:preview",
  workspaceSelect: "workspace:select",
  workspacePreview: "workspace:preview",
  workspaceExecutionStart: "workspace:execution:start",
  workspaceExecutionGet: "workspace:execution:get",
  workspaceExecutionCancel: "workspace:execution:cancel",
  workspaceHistoryGet: "workspace:history:get",
  workspaceAuditGet: "workspace:audit:get",
  workspaceRetentionGet: "workspace:retention:get",
  workspaceRetentionSave: "workspace:retention:save",
  workspaceDataDelete: "workspace:data:delete",
  workspaceDataExport: "workspace:data:export",
  workspaceApprovalRequest: "workspace:approval:request",
  workspaceApprovalDecide: "workspace:approval:decide",
} as const;

export * from "./provider-configuration.js";
