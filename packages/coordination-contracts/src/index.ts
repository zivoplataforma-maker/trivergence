import { z } from "zod";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const boundedTextSchema = z.string().max(65_536);

export const coordinationCapabilityIds = {
  memoryRecall: "memory.local.recall",
  agentTeam: "agent.reference.team",
  workflowSynthesis: "workflow.local.synthesis",
  memoryCommit: "memory.local.commit",
  workflowEvaluation: "workflow.local.evaluate",
} as const;

export const coordinationBudgetSchema = z.object({
  maxAgents: z.number().int().min(1).max(3).default(3),
  maxProviderCalls: z.number().int().min(1).max(4).default(4),
  maxInputBytes: z.number().int().min(256).max(65_536).default(16_384),
  maxOutputBytes: z.number().int().min(256).max(65_536).default(65_536),
  maxMemoryItems: z.number().int().min(0).max(16).default(4),
  maxMemoryBytes: z.number().int().min(0).max(65_536).default(16_384),
  timeoutMs: z.number().int().min(100).max(60_000).default(10_000),
  maxCostMicrounits: z.number().int().nonnegative().max(1_000_000).default(0),
  maxReplans: z.number().int().min(0).max(1).default(1),
  retentionDays: z.number().int().min(1).max(365).default(30),
});
export type CoordinationBudget = z.infer<typeof coordinationBudgetSchema>;

export const coordinationInputSchema = coordinationBudgetSchema.partial();
export type CoordinationInput = z.infer<typeof coordinationInputSchema>;

export const memoryProvenanceSchema = z.object({
  sourceRunId: z.string().uuid(),
  sourcePlanId: z.string().uuid(),
  sourceStepId: z.string().min(1).max(80),
  workflowId: z.string().uuid(),
  workflowVersion: z.string().min(1).max(40),
  agentTeamDigest: digestSchema,
  providerId: z.literal("reference"),
  providerLocalOnly: z.literal(true),
});
export type MemoryProvenance = z.infer<typeof memoryProvenanceSchema>;

export const memoryItemSchema = z.object({
  id: z.string().uuid(),
  content: boundedTextSchema,
  contentDigest: digestSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  provenance: memoryProvenanceSchema,
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const memoryRecallResultSchema = z.object({
  schemaVersion: z.literal("1"),
  namespace: z.string().min(1).max(120),
  items: z.array(memoryItemSchema).max(16),
  bytes: z.number().int().nonnegative().max(65_536),
  truncated: z.boolean(),
  provenanceDigest: digestSchema,
});
export type MemoryRecallResult = z.infer<typeof memoryRecallResultSchema>;

export const agentRoleSchema = z.enum(["planner", "critic", "synthesizer"]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentContributionSchema = z.object({
  role: agentRoleSchema,
  response: boundedTextSchema,
  responseDigest: digestSchema,
  requestDigest: digestSchema,
  contextDigest: digestSchema,
  inputBytes: z.number().int().nonnegative(),
  outputBytes: z.number().int().nonnegative(),
  costMicrounits: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative().max(60_000),
  providerId: z.literal("reference"),
  localOnly: z.literal(true),
});
export type AgentContribution = z.infer<typeof agentContributionSchema>;

export const agentTeamResultSchema = z.object({
  schemaVersion: z.literal("1"),
  teamId: z.string().uuid(),
  goalDigest: digestSchema,
  contributions: z.array(agentContributionSchema).min(1).max(3),
  providerCalls: z.number().int().min(1).max(4),
  inputBytes: z.number().int().nonnegative(),
  outputBytes: z.number().int().nonnegative(),
  costMicrounits: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative().max(60_000),
  memoryItems: z.number().int().nonnegative().max(16),
  memoryBytes: z.number().int().nonnegative().max(65_536),
  memoryDigest: digestSchema,
  provenanceDigest: digestSchema,
});
export type AgentTeamResult = z.infer<typeof agentTeamResultSchema>;

export const workflowCandidateSchema = z.object({
  schemaVersion: z.literal("1"),
  workflowId: z.string().uuid(),
  definitionId: z.literal("workflow.local.team-memory-evaluation"),
  workflowVersion: z.literal("1.0.0"),
  stages: z
    .array(z.enum(["recall", "team", "synthesize", "commit", "evaluate"]))
    .length(5),
  candidate: boundedTextSchema,
  candidateDigest: digestSchema,
  agentTeamDigest: digestSchema,
  initialEvaluation: z.object({
    passed: z.boolean(),
    checks: z.array(z.string().min(1).max(160)).min(1).max(8),
  }),
  replansUsed: z.number().int().min(0).max(1),
  replanContribution: agentContributionSchema.optional(),
  budget: coordinationBudgetSchema,
  usage: z.object({
    providerCalls: z.number().int().min(1).max(4),
    inputBytes: z.number().int().nonnegative(),
    outputBytes: z.number().int().nonnegative(),
    costMicrounits: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative().max(60_000),
    memoryItems: z.number().int().nonnegative().max(16),
    memoryBytes: z.number().int().nonnegative().max(65_536),
  }),
  provenanceDigest: digestSchema,
});
export type WorkflowCandidate = z.infer<typeof workflowCandidateSchema>;

export const memoryCommitResultSchema = z.object({
  schemaVersion: z.literal("1"),
  entry: memoryItemSchema,
  candidate: workflowCandidateSchema,
  provenanceDigest: digestSchema,
});
export type MemoryCommitResult = z.infer<typeof memoryCommitResultSchema>;

export const workflowEvaluationResultSchema = z.object({
  schemaVersion: z.literal("1"),
  outcome: z.enum(["accepted", "rejected"]),
  result: boundedTextSchema,
  checks: z.array(
    z.object({
      id: z.string().min(1).max(80),
      passed: z.boolean(),
      evidence: z.string().min(1).max(500),
    }),
  ),
  workflowId: z.string().uuid(),
  memoryEntryId: z.string().uuid(),
  memoryContentDigest: digestSchema,
  agentTeamDigest: digestSchema,
  budget: coordinationBudgetSchema,
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
  provenanceDigest: digestSchema,
});
export type WorkflowEvaluationResult = z.infer<
  typeof workflowEvaluationResultSchema
>;
