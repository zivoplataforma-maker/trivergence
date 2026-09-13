import {
  executionOutcomeEvaluationSchema,
  planEvaluationSchema,
  type ExecutionOutcomeEvaluation,
  type ExecutionPlan,
  type ExecutionRun,
  type OrchestrationPreview,
  type PlanEvaluation,
  type StepEvidence,
} from "@trivergence/contracts";

export class EvaluationEngine {
  evaluatePreflight(plan: ExecutionPlan): PlanEvaluation {
    const strategyResolved = plan.strategy.kind !== "unavailable";
    const planValid = plan.issues.length === 0;
    const stepsPresent = plan.steps.length > 0;
    const denied = plan.steps.filter((step) => step.policy.decision === "deny");
    const approvals = plan.steps.filter(
      (step) => step.policy.decision === "require_approval",
    );
    const policySatisfied = denied.length === 0;

    const blocked =
      !strategyResolved || !planValid || !stepsPresent || !policySatisfied;
    const status = blocked
      ? "blocked"
      : approvals.length > 0
        ? "approval_required"
        : "ready";
    const reason = blocked
      ? "El plan está bloqueado; corrige capacidades, dependencias o políticas."
      : approvals.length > 0
        ? `${approvals.length} paso(s) requieren aprobación explícita.`
        : "El plan es viable y sus pasos están permitidos; todavía no se ejecutó.";

    return planEvaluationSchema.parse({
      phase: "preflight",
      status,
      reason,
      checks: [
        {
          id: "strategy_resolved",
          passed: strategyResolved,
          evidence: strategyResolved
            ? `Estrategia ${plan.strategy.kind} resuelta.`
            : plan.strategy.reason,
        },
        {
          id: "plan_valid",
          passed: planValid,
          evidence: planValid
            ? "No se detectaron issues de planificación."
            : `${plan.issues.length} issue(s) bloqueantes.`,
        },
        {
          id: "steps_present",
          passed: stepsPresent,
          evidence: `${plan.steps.length} paso(s) planificados.`,
        },
        {
          id: "policy_satisfied",
          passed: policySatisfied,
          evidence: policySatisfied
            ? `${approvals.length} paso(s) requieren aprobación; ninguno fue denegado.`
            : `${denied.length} paso(s) fueron denegados.`,
        },
      ],
      evaluatorVersion: "2",
    });
  }

  evaluate(plan: ExecutionPlan): PlanEvaluation {
    return this.evaluatePreflight(plan);
  }

  evaluateOutcome(
    preview: OrchestrationPreview,
    run: ExecutionRun,
    evidence: readonly StepEvidence[],
  ): ExecutionOutcomeEvaluation {
    const terminal = [
      "completed",
      "failed",
      "cancelled",
      "timed_out",
      "orphaned",
    ].includes(run.status);
    const completed = run.status === "completed";
    const expectedByStep = new Map(
      preview.plan.steps.map((step) => [step.id, step]),
    );
    const observedStepIds = new Set(evidence.map((item) => item.stepId));
    const evidenceComplete =
      evidence.length === preview.plan.steps.length &&
      preview.plan.steps.every((step) => observedStepIds.has(step.id));
    const correlated =
      run.id.length > 0 &&
      run.planId === preview.plan.id &&
      run.requestId === preview.request.id &&
      run.registrySnapshotId === preview.registrySnapshot.id &&
      run.planDigest === preview.planIntegrity.digest &&
      evidence.every((item) => {
        const step = expectedByStep.get(item.stepId);
        return (
          item.runId === run.id &&
          item.planId === preview.plan.id &&
          step?.capabilityId === item.capabilityId &&
          step?.subsystem === item.subsystem
        );
      });
    const outcomesSucceeded =
      evidenceComplete &&
      evidence.every((item) => item.outcome === "succeeded");
    const accepted =
      terminal &&
      completed &&
      evidenceComplete &&
      correlated &&
      outcomesSucceeded;

    return executionOutcomeEvaluationSchema.parse({
      phase: "postflight",
      status: accepted ? "accepted" : "rejected",
      reason: accepted
        ? "La ejecución terminó y toda la evidencia coincide con el plan aprobado."
        : "La ejecución o su evidencia no satisfacen el plan aprobado.",
      checks: [
        {
          id: "run_terminal",
          passed: terminal,
          evidence: terminal
            ? `Run en estado terminal ${run.status}.`
            : `Run todavía en estado ${run.status}.`,
        },
        {
          id: "run_completed",
          passed: completed,
          evidence: completed
            ? "El Runtime completó el plan."
            : `El Runtime terminó como ${run.status}.`,
        },
        {
          id: "evidence_complete",
          passed: evidenceComplete,
          evidence: `${evidence.length}/${preview.plan.steps.length} paso(s) con evidencia.`,
        },
        {
          id: "evidence_correlated",
          passed: correlated,
          evidence: correlated
            ? "Run, plan, capacidades y subsistemas están correlacionados."
            : "Hay evidencia que no corresponde al run o plan aprobado.",
        },
        {
          id: "step_outcomes_succeeded",
          passed: outcomesSucceeded,
          evidence: outcomesSucceeded
            ? "Todos los pasos finalizaron correctamente."
            : "Uno o más pasos no finalizaron correctamente.",
        },
      ],
      evaluatorVersion: "2",
    });
  }
}
