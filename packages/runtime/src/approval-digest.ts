import {
  sha256DigestSchema,
  type ExecutionDescriptor,
  type OrchestrationPreview,
  type PlannedStep,
} from "@trivergence/contracts";
import {
  canonicalizeJson,
  type DigestFunction,
} from "@trivergence/orchestration-engine";

export const createApprovalDigest = (
  preview: OrchestrationPreview,
  step: PlannedStep,
  descriptor: ExecutionDescriptor,
  sha256: DigestFunction,
): string =>
  sha256DigestSchema.parse(
    sha256(
      canonicalizeJson({
        version: "1",
        requestId: preview.request.id,
        planId: preview.plan.id,
        planDigest: preview.planIntegrity.digest,
        registrySnapshotId: preview.registrySnapshot.id,
        stepId: step.id,
        rulesetVersion: step.policy.rulesetVersion,
        descriptor,
      }),
    ),
  );
