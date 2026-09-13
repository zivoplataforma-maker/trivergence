import { StrictMode, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  diagnosticsSchema,
  orchestrationPreviewSchema,
  workspaceApprovalDecisionResponseSchema,
  workspaceApprovalResponseSchema,
  workspaceExecutionCancelResponseSchema,
  workspaceExecutionStartResponseSchema,
  workspaceExecutionStateSchema,
  workspaceHistoryResponseSchema,
  workspacePreviewRequestSchema,
  workspaceSelectionResponseSchema,
  type DesktopWorkspace,
  type Diagnostics,
  type OrchestrationPreview,
  type PolicyProfile,
  type WorkspaceApprovalResponse,
  type WorkspaceExecutionState,
  type WorkspaceHistoryEntry,
} from "@trivergence/contracts";

import "./styles.css";

const STATUS_LABELS: Record<string, string> = {
  installed_unverified: "Instalado · sin verificar",
  not_installed: "No detectado",
  unhealthy: "Diagnóstico incompleto",
};

const EVALUATION_LABELS: Record<
  OrchestrationPreview["evaluation"]["status"],
  string
> = {
  ready: "Plan listo · sin ejecutar",
  approval_required: "Requiere aprobación",
  blocked: "Plan bloqueado",
};

const RUN_LABELS: Record<WorkspaceExecutionState["status"], string> = {
  running: "Ejecutando",
  cancelling: "Cancelando",
  completed: "Ejecución completada",
  blocked: "Ejecución bloqueada",
  approval_required: "Falta aprobación",
  failed: "Ejecución fallida",
  cancelled: "Ejecución cancelada",
  timed_out: "Tiempo agotado",
  orphaned: "Ejecución huérfana",
};

const messageFrom = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function App() {
  const [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const [diagnosticsError, setDiagnosticsError] = useState<string>();
  const [workspace, setWorkspace] = useState<DesktopWorkspace>();
  const [selectionState, setSelectionState] = useState<
    "idle" | "selecting" | "cancelled"
  >("idle");
  const [goal, setGoal] = useState("Leer un archivo del workspace");
  const [profile, setProfile] = useState<PolicyProfile>("observer");
  const [privacyMode, setPrivacyMode] = useState<"private" | "standard">(
    "private",
  );
  const [detail, setDetail] = useState("README.md");
  const [history, setHistory] = useState<WorkspaceHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string>();
  const [preview, setPreview] = useState<OrchestrationPreview>();
  const [previewError, setPreviewError] = useState<string>();
  const [planning, setPlanning] = useState(false);
  const [run, setRun] = useState<WorkspaceExecutionState>();
  const [executionError, setExecutionError] = useState<string>();
  const [executionStarting, setExecutionStarting] = useState(false);
  const [approval, setApproval] = useState<WorkspaceApprovalResponse>();
  const [approvalIds, setApprovalIds] = useState<Record<string, string>>({});
  const [approvalMessage, setApprovalMessage] = useState<string>();
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    window.trivergence
      .getDiagnostics()
      .then((result: unknown) => {
        if (active) setDiagnostics(diagnosticsSchema.parse(result));
      })
      .catch(() => {
        if (active)
          setDiagnosticsError("No fue posible obtener el diagnóstico local.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);

  useEffect(() => {
    if (
      run &&
      !["running", "cancelling"].includes(run.status) &&
      resultHeading.current
    ) {
      resultHeading.current.focus();
    }
  }, [run]);

  useEffect(() => {
    if (!run?.runId) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next = workspaceExecutionStateSchema.parse(
          await window.trivergence.getWorkspaceExecution({ runId: run.runId }),
        );
        if (!active) return;
        setRun(next);
        if (["running", "cancelling"].includes(next.status)) {
          timer = window.setTimeout(poll, 180);
        }
      } catch (error) {
        if (!active) return;
        setExecutionError(
          messageFrom(error, "No fue posible actualizar la ejecución."),
        );
        timer = window.setTimeout(poll, 500);
      }
    };
    timer = window.setTimeout(poll, 180);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [run?.runId]);

  useEffect(() => {
    if (run?.status === "approval_required") {
      setApprovalIds({});
      setApprovalMessage(
        "La aprobación ya no es utilizable. Revisa el paso nuevamente.",
      );
    }
  }, [run?.status]);

  function invalidatePreview() {
    setPreview(undefined);
    setRun(undefined);
    setPreviewError(undefined);
    setExecutionError(undefined);
    setApproval(undefined);
    setApprovalIds({});
    setApprovalMessage(undefined);
  }

  async function selectWorkspace() {
    setSelectionState("selecting");
    setPreviewError(undefined);
    try {
      const selection = workspaceSelectionResponseSchema.parse(
        await window.trivergence.selectWorkspace(),
      );
      if (selection.status === "cancelled") {
        setSelectionState("cancelled");
        return;
      }
      setWorkspace(selection.workspace);
      setSelectionState("idle");
      invalidatePreview();
      await refreshHistory(selection.workspace.id);
    } catch (error) {
      setSelectionState("idle");
      setPreviewError(
        messageFrom(
          error,
          "La carpeta elegida no puede usarse como workspace.",
        ),
      );
    }
  }

  async function refreshHistory(workspaceId: string) {
    try {
      const response = workspaceHistoryResponseSchema.parse(
        await window.trivergence.getWorkspaceHistory({
          workspaceId,
          limit: 25,
        }),
      );
      setHistory(response.entries);
      setHistoryError(undefined);
    } catch (error) {
      setHistory([]);
      setHistoryError(messageFrom(error, "No se pudo cargar el historial."));
    }
  }

  useEffect(() => {
    if (workspace && run && !["running", "cancelling"].includes(run.status)) {
      void refreshHistory(workspace.id);
    }
  }, [workspace?.id, run?.runId, run?.status]);

  async function generatePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setPlanning(true);
    setPreviewError(undefined);
    setExecutionError(undefined);
    setRun(undefined);
    try {
      const base = {
        workspaceId: workspace.id,
        requestId: crypto.randomUUID(),
        goal,
        profile,
        privacyMode,
        detail,
      };
      const request = workspacePreviewRequestSchema.parse(base);
      const result = await window.trivergence.previewWorkspace(request);
      setPreview(orchestrationPreviewSchema.parse(result));
      setApproval(undefined);
      setApprovalIds({});
      setApprovalMessage(undefined);
    } catch (error) {
      setPreview(undefined);
      setPreviewError(
        messageFrom(
          error,
          "No fue posible generar el preview. No se ejecutó ninguna acción.",
        ),
      );
    } finally {
      setPlanning(false);
    }
  }

  async function startExecution() {
    if (!workspace || !preview) return;
    setExecutionStarting(true);
    setExecutionError(undefined);
    try {
      const started = workspaceExecutionStartResponseSchema.parse(
        await window.trivergence.startWorkspaceExecution({
          workspaceId: workspace.id,
          planId: preview.plan.id,
          ...(Object.keys(approvalIds).length > 0 ? { approvalIds } : {}),
        }),
      );
      setRun({
        runId: started.runId,
        status: "running",
        reason: "La ejecución comenzó.",
        evidenceCount: 0,
      });
    } catch (error) {
      setExecutionError(
        messageFrom(error, "No fue posible iniciar la ejecución."),
      );
    } finally {
      setExecutionStarting(false);
    }
  }

  async function cancelExecution() {
    if (!run) return;
    try {
      const response = workspaceExecutionCancelResponseSchema.parse(
        await window.trivergence.cancelWorkspaceExecution({ runId: run.runId }),
      );
      if (response.accepted) {
        setRun({
          ...run,
          status: "cancelling",
          reason: "Cancelación solicitada.",
        });
      }
    } catch (error) {
      setExecutionError(
        messageFrom(error, "No fue posible cancelar la ejecución."),
      );
    }
  }

  async function reviewApproval(stepId: string) {
    if (!workspace || !preview) return;
    setApprovalMessage(undefined);
    try {
      setApproval(
        workspaceApprovalResponseSchema.parse(
          await window.trivergence.requestWorkspaceApproval({
            workspaceId: workspace.id,
            planId: preview.plan.id,
            stepId,
          }),
        ),
      );
    } catch (error) {
      setApprovalMessage(
        messageFrom(error, "No fue posible preparar la aprobación."),
      );
    }
  }

  async function decideApproval(decision: "grant" | "deny") {
    if (!workspace || !approval) return;
    try {
      const response = workspaceApprovalDecisionResponseSchema.parse(
        await window.trivergence.decideWorkspaceApproval({
          workspaceId: workspace.id,
          approvalId: approval.approvalId,
          decision,
        }),
      );
      if (response.status === "granted") {
        setApprovalIds((current) => ({
          ...current,
          [approval.stepId]: approval.approvalId,
        }));
        setApprovalMessage("Aprobación concedida una vez para este paso.");
      } else {
        setApprovalMessage("Aprobación denegada. El paso no se ejecutará.");
      }
      setApproval(undefined);
    } catch (error) {
      setApprovalMessage(
        messageFrom(error, "No fue posible registrar la decisión."),
      );
    }
  }

  const approvalSteps =
    preview?.plan.steps.filter(
      (step) => step.policy.decision === "require_approval",
    ) ?? [];
  const approvalsReady = approvalSteps.every((step) => approvalIds[step.id]);
  const executionActive =
    executionStarting ||
    Boolean(run && ["running", "cancelling"].includes(run.status));
  const canExecute =
    preview !== undefined &&
    preview.evaluation.status !== "blocked" &&
    approvalsReady &&
    !executionActive;

  return (
    <div className="shell">
      <a className="skipLink" href="#main-content">
        Saltar al contenido principal
      </a>
      <aside className="navigation" aria-label="Navegación principal">
        <div className="brand" aria-label="Trivergence">
          <span className="brandMark" aria-hidden="true">
            T
          </span>
          <span>Trivergence</span>
        </div>
        <nav>
          <a
            className="navItem active"
            href="#orquestacion"
            aria-current="page"
          >
            Orquestación
          </a>
          <a className="navItem" href="#ejecucion">
            Ejecución
          </a>
          <a className="navItem" href="#historial">
            Historial
          </a>
          <a className="navItem" href="#privacidad">
            Privacidad
          </a>
          <a className="navItem" href="#capacidades">
            Capacidades
          </a>
        </nav>
        <div className="privacyPill">
          {privacyMode === "private" ? "Privado" : "Estándar"} · {profile} · sin
          proveedor externo activo
        </div>
      </aside>

      <main id="main-content" className="content" tabIndex={-1}>
        <header id="orquestacion" className="pageHeader">
          <div>
            <p className="eyebrow">ORQUESTACIÓN LOCAL M4–M6</p>
            <h1>¿Qué quieres lograr?</h1>
            <p className="subtitle">
              Describe el objetivo. Trivergence compara rutas locales, elige una
              estrategia y muestra el plan antes de ejecutar.
            </p>
          </div>
          <div className="securityBadge">Control local</div>
        </header>

        <section className="panel" aria-labelledby="workspace-title">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">WORKSPACE</p>
              <h2 id="workspace-title">
                {workspace
                  ? workspace.displayName
                  : "Ninguna carpeta seleccionada"}
              </h2>
              <p>
                La carpeta se elige con el diálogo del sistema. Trivergence
                canoniza la raíz y bloquea escapes y secretos conocidos.
              </p>
            </div>
            <button
              type="button"
              className="secondaryButton"
              onClick={selectWorkspace}
              disabled={selectionState === "selecting" || executionActive}
            >
              {selectionState === "selecting"
                ? "Abriendo selector…"
                : workspace
                  ? "Cambiar carpeta"
                  : "Elegir carpeta"}
            </button>
          </div>
          {selectionState === "cancelled" && (
            <p className="notice" role="status">
              Selección cancelada. No se cambió el workspace.
            </p>
          )}
          {workspace && (
            <dl className="workspaceMeta">
              <div>
                <dt>Ruta canónica</dt>
                <dd>
                  <code title={workspace.rootPath}>{workspace.rootPath}</code>
                </dd>
              </div>
              <div>
                <dt>Capacidades</dt>
                <dd>{workspace.capabilities.length} capacidades locales</dd>
              </div>
              <div>
                <dt>Recuperación</dt>
                <dd>
                  {workspace.recoveredRuns > 0
                    ? `${workspace.recoveredRuns} run(s) marcados orphaned`
                    : "Sin runs huérfanos"}
                </dd>
              </div>
              <div>
                <dt>Persistencia</dt>
                <dd>
                  {workspace.persistence.privilegedActionsAvailable
                    ? "Íntegra · ejecución disponible"
                    : `Solo lectura · ${workspace.persistence.reason ?? "revisión necesaria"}`}
                </dd>
              </div>
            </dl>
          )}
          {workspace?.persistence.recovery && (
            <p className="notice" role="status">
              Recuperación{" "}
              {workspace.persistence.recovery.incidentId.slice(0, 8)}:{" "}
              {workspace.persistence.recovery.reason}. Se preservaron{" "}
              {workspace.persistence.recovery.files.length} archivo(s) para
              revisión.
            </p>
          )}
        </section>

        <section className="panel" aria-labelledby="intent-title">
          <p className="eyebrow">INTENCIÓN</p>
          <h2 id="intent-title">Definir el objetivo</h2>
          <form className="intentForm" onSubmit={generatePreview}>
            <div className="field fieldWide">
              <label htmlFor="goal">Objetivo</label>
              <textarea
                id="goal"
                value={goal}
                maxLength={2_000}
                rows={3}
                aria-describedby="goal-hint"
                disabled={!workspace || planning || executionActive}
                onChange={(event) => {
                  setGoal(event.target.value);
                  setDetail("");
                  invalidatePreview();
                }}
              />
              <small id="goal-hint">Entre 3 y 2.000 caracteres.</small>
            </div>
            <div className="field">
              <label htmlFor="profile">Perfil</label>
              <select
                id="profile"
                value={profile}
                disabled={!workspace || planning || executionActive}
                onChange={(event) => {
                  setProfile(event.target.value as PolicyProfile);
                  invalidatePreview();
                }}
              >
                <option value="observer">Observador</option>
                <option value="assistant">Asistente</option>
                <option value="developer">Desarrollador</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="privacyMode">Privacidad</label>
              <select
                id="privacyMode"
                value={privacyMode}
                disabled={!workspace || planning || executionActive}
                onChange={(event) => {
                  setPrivacyMode(event.target.value as "private" | "standard");
                  invalidatePreview();
                }}
              >
                <option value="private">Privado · rutas sin red</option>
                <option value="standard">Estándar · sujeto a policy</option>
              </select>
            </div>
            <div className="field fieldWide">
              <label htmlFor="detail">Detalle opcional del objetivo</label>
              <input
                id="detail"
                value={detail}
                maxLength={2_048}
                aria-describedby="detail-hint"
                disabled={!workspace || planning || executionActive}
                onChange={(event) => {
                  setDetail(event.target.value);
                  invalidatePreview();
                }}
              />
              <small id="detail-hint">
                Ruta relativa si quieres leer; texto literal si quieres buscar.
                Para workflows es contexto opcional. No pegues secretos.
              </small>
            </div>
            <div className="formActions fieldWide">
              <button
                type="submit"
                disabled={!workspace || planning || executionActive}
              >
                {planning ? "Planificando…" : "Generar preview"}
              </button>
              {!workspace && <span>Primero selecciona una carpeta.</span>}
            </div>
          </form>
          {previewError && (
            <p className="error" role="alert">
              {previewError}
            </p>
          )}
        </section>

        {preview && (
          <section className="panel" aria-labelledby="plan-title">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">ESTRATEGIA {preview.strategy.kind}</p>
                <h2 id="plan-title" ref={previewHeading} tabIndex={-1}>
                  Plan de ejecución propuesto
                </h2>
                <p>{preview.strategy.reason}</p>
                {preview.strategy.candidates && (
                  <ol className="routeList" aria-label="Rutas comparadas">
                    {preview.strategy.candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <strong>{candidate.id}</strong> · {candidate.status} ·
                        puntuación {candidate.score}
                        {preview.strategy.capabilityIds.includes(candidate.id)
                          ? " · seleccionada"
                          : ""}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <span className={`stateBadge ${preview.evaluation.status}`}>
                {EVALUATION_LABELS[preview.evaluation.status]}
              </span>
            </div>

            <ol className="planList">
              {preview.plan.steps.map((step) => (
                <li className="planStep" key={step.id}>
                  <div className="stepIndex" aria-hidden="true">
                    {step.id.replace("step-", "")}
                  </div>
                  <div>
                    <h3>{step.action.summary}</h3>
                    <p>
                      {step.capabilityId} · subsistema {step.subsystem}
                    </p>
                    <small>
                      {step.dependsOn.length > 0
                        ? `Depende de ${step.dependsOn.join(", ")}`
                        : "Sin dependencias"}
                    </small>
                  </div>
                  <span className={`policyState ${step.policy.decision}`}>
                    {step.policy.decision === "allow"
                      ? "Permitido"
                      : step.policy.decision === "require_approval"
                        ? "Requiere aprobación"
                        : "Denegado"}
                  </span>
                </li>
              ))}
            </ol>

            <div className="evaluationGrid" aria-label="Checks de evaluación">
              {preview.evaluation.checks.map((check) => (
                <div key={check.id}>
                  <strong>
                    {check.passed ? "✓ Verificado" : "× Bloqueado"}
                  </strong>
                  <span>{check.evidence}</span>
                </div>
              ))}
            </div>
            <details className="technicalDetails">
              <summary>Detalles de integridad</summary>
              <dl>
                <div>
                  <dt>Registry</dt>
                  <dd>{preview.registryVersion}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{preview.plan.id}</dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd className="digest">{preview.planIntegrity.digest}</dd>
                </div>
              </dl>
            </details>
          </section>
        )}

        {preview && approvalSteps.length > 0 && (
          <section
            className="panel approvalCenter"
            aria-labelledby="approval-title"
          >
            <p className="eyebrow">APROBACIONES</p>
            <h2 id="approval-title">Revisar efectos paso por paso</h2>
            {approvalSteps.map((step) => (
              <div className="approvalStep" key={step.id}>
                <div>
                  <strong>{step.action.summary}</strong>
                  <p>{step.policy.reason}</p>
                </div>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => reviewApproval(step.id)}
                  disabled={Boolean(approvalIds[step.id])}
                >
                  {approvalIds[step.id]
                    ? "Aprobado una vez"
                    : "Revisar aprobación"}
                </button>
              </div>
            ))}
            {approval && (
              <div
                className="approvalReview"
                role="group"
                aria-label="Detalle de aprobación"
              >
                <h3>{approval.actionSummary}</h3>
                <p>{approval.policyReason}</p>
                <dl>
                  <div>
                    <dt>Targets</dt>
                    <dd>
                      {approval.descriptor.targets.join(", ") || "Ninguno"}
                    </dd>
                  </div>
                  <div>
                    <dt>Executable</dt>
                    <dd>
                      {approval.descriptor.executable ?? "Operación interna"}
                    </dd>
                  </div>
                  <div>
                    <dt>Argumentos</dt>
                    <dd>{approval.descriptor.argv.join(" ") || "Ninguno"}</dd>
                  </div>
                  {approval.descriptor.providerRequest && (
                    <>
                      <div>
                        <dt>Proveedor / transporte</dt>
                        <dd>
                          {approval.descriptor.providerRequest.providerId} ·{" "}
                          {approval.descriptor.providerRequest.transport}
                        </dd>
                      </div>
                      <div>
                        <dt>Destino y red</dt>
                        <dd>
                          {
                            approval.descriptor.providerRequest.context
                              .destination
                          }{" "}
                          ·{" "}
                          {approval.descriptor.providerRequest.context
                            .networkRequired
                            ? "requiere red"
                            : "sin red"}
                        </dd>
                      </div>
                      <div>
                        <dt>Contexto / presupuesto</dt>
                        <dd>
                          {
                            approval.descriptor.providerRequest.context
                              .totalBytes
                          }{" "}
                          bytes · máximo{" "}
                          {
                            approval.descriptor.providerRequest.budget
                              .maxOutputBytes
                          }{" "}
                          bytes de salida
                        </dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>Expira</dt>
                    <dd>{new Date(approval.expiresAt).toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="formActions">
                  <button type="button" onClick={() => decideApproval("grant")}>
                    Permitir una vez
                  </button>
                  <button
                    type="button"
                    className="dangerButton"
                    onClick={() => decideApproval("deny")}
                  >
                    Denegar
                  </button>
                </div>
              </div>
            )}
            {approvalMessage && (
              <p className="notice" role="status">
                {approvalMessage}
              </p>
            )}
          </section>
        )}

        <section
          id="ejecucion"
          className="panel"
          aria-labelledby="execution-title"
        >
          <div className="panelHeader">
            <div>
              <p className="eyebrow">RUNTIME</p>
              <h2 id="execution-title">Ejecución y evidencia</h2>
              <p>
                Solo se ejecuta el preview persistido. Cambiar la intención
                exige planificar otra vez.
              </p>
            </div>
            {run && (
              <span
                className={`stateBadge ${run.status}`}
                role="status"
                aria-live="polite"
              >
                {RUN_LABELS[run.status]}
              </span>
            )}
          </div>
          <div className="formActions">
            <button
              type="button"
              onClick={startExecution}
              disabled={!canExecute}
            >
              {executionStarting
                ? "Iniciando ejecución…"
                : "Ejecutar plan aprobado"}
            </button>
            {run && ["running", "cancelling"].includes(run.status) && (
              <button
                type="button"
                className="dangerButton"
                onClick={cancelExecution}
                disabled={run.status === "cancelling"}
              >
                {run.status === "cancelling"
                  ? "Cancelando…"
                  : "Cancelar ejecución"}
              </button>
            )}
          </div>
          {!preview && (
            <p className="quiet">
              Genera un preview para habilitar la ejecución.
            </p>
          )}
          {executionError && (
            <p className="error" role="alert">
              {executionError}
            </p>
          )}
          {run && (
            <ol className="timeline" aria-label="Timeline de ejecución">
              <li>Plan persistido y ligado al Registry.</li>
              <li>
                {RUN_LABELS[run.status]}: {run.reason}
              </li>
              <li>{run.evidenceCount} evidencia(s) registradas.</li>
              {run.outcomeEvaluation && (
                <li>
                  Evaluación posterior: {run.outcomeEvaluation.status} ·{" "}
                  {
                    run.outcomeEvaluation.checks.filter((check) => check.passed)
                      .length
                  }
                  /5 comprobaciones.
                </li>
              )}
            </ol>
          )}
          {run?.stream && run.stream.length > 0 && (
            <p className="notice" role="status" aria-live="polite">
              Stream local: {run.stream.length} evento(s),{" "}
              {
                run.stream.filter((event) => event.event.type === "delta")
                  .length
              }{" "}
              fragmento(s).
            </p>
          )}
          {run && !["running", "cancelling"].includes(run.status) && (
            <div className="result" aria-live="polite">
              <h3 ref={resultHeading} tabIndex={-1}>
                Resultado de la ejecución
              </h3>
              {run.outputUnavailableReason && (
                <p>{run.outputUnavailableReason}</p>
              )}
              {run.output?.kind === "file" && (
                <div>
                  <p>
                    {run.output.path} · {run.output.bytes} bytes · SHA-256{" "}
                    {run.output.sha256.slice(0, 12)}
                  </p>
                  <pre
                    tabIndex={0}
                    aria-label={`Contenido de ${run.output.path}`}
                  >
                    {run.output.content}
                  </pre>
                </div>
              )}
              {run.output?.kind === "search" && (
                <div>
                  <p>
                    {run.output.matches.length} coincidencias en{" "}
                    {run.output.filesScanned} archivos
                    {run.output.truncated ? " · resultado acotado" : ""}
                  </p>
                  <ol className="matchList">
                    {run.output.matches.map((match, index) => (
                      <li
                        key={`${match.path}:${match.line}:${match.column}:${index}`}
                      >
                        <strong>
                          {match.path}:{match.line}:{match.column}
                        </strong>
                        <span>{match.preview}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {run.output?.kind === "provider" && (
                <div>
                  <p>
                    {run.output.result.provenance.providerId} ·{" "}
                    {run.output.result.provenance.transport} ·{" "}
                    {run.output.result.usage.chunks} fragmentos ·{" "}
                    {run.output.result.usage.outputBytes} bytes · coste{" "}
                    {run.output.result.usage.costMicrounits}
                  </p>
                  {run.output.result.response && (
                    <pre
                      tabIndex={0}
                      aria-label="Respuesta del proveedor local"
                    >
                      {run.output.result.response}
                    </pre>
                  )}
                  {run.output.result.error && (
                    <p className="error" role="alert">
                      {run.output.result.error.code}:{" "}
                      {run.output.result.error.message}
                    </p>
                  )}
                </div>
              )}
              {run.output?.kind === "workflow" && (
                <div>
                  <p>
                    Workflow {run.output.result.outcome} · memoria{" "}
                    {run.output.result.memoryEntryId.slice(0, 8)} · provenance{" "}
                    {run.output.result.provenanceDigest.slice(0, 12)}
                  </p>
                  <p className="quiet">
                    Uso: {run.output.result.usage.providerCalls}/
                    {run.output.result.budget.maxProviderCalls} llamadas ·{" "}
                    {run.output.result.usage.replansUsed}/
                    {run.output.result.budget.maxReplans} replan ·{" "}
                    {run.output.result.usage.outputBytes}/
                    {run.output.result.budget.maxOutputBytes} bytes de salida ·{" "}
                    {run.output.result.usage.memoryItems}/
                    {run.output.result.budget.maxMemoryItems} memorias
                  </p>
                  <pre
                    tabIndex={0}
                    aria-label="Resultado auditable del workflow"
                  >
                    {run.output.result.result}
                  </pre>
                  <ol
                    className="matchList"
                    aria-label="Evaluación del workflow"
                  >
                    {run.output.result.checks.map((check) => (
                      <li key={check.id}>
                        <strong>
                          {check.passed ? "Verificado" : "Fallido"}: {check.id}
                        </strong>
                        <span>{check.evidence}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </section>

        <section
          id="historial"
          className="panel"
          aria-labelledby="history-title"
        >
          <div className="panelHeader">
            <div>
              <p className="eyebrow">AUDITORÍA</p>
              <h2 id="history-title">Historial del workspace</h2>
              <p>
                Objetivos y ejecuciones anteriores, incluso tras reiniciar la
                app.
              </p>
            </div>
            {workspace && (
              <button
                type="button"
                className="secondaryButton"
                onClick={() => void refreshHistory(workspace.id)}
              >
                Actualizar historial
              </button>
            )}
          </div>
          {historyError && (
            <p className="error" role="alert">
              {historyError}
            </p>
          )}
          {!workspace && (
            <p className="quiet">
              Selecciona un workspace para ver su historial.
            </p>
          )}
          {workspace && history.length === 0 && !historyError && (
            <p className="quiet">Todavía no hay ejecuciones registradas.</p>
          )}
          {history.length > 0 && (
            <ol className="historyList">
              {history.map((entry) => (
                <li key={entry.runId}>
                  <strong>{entry.goal}</strong>
                  <span>
                    {RUN_LABELS[
                      entry.status as WorkspaceExecutionState["status"]
                    ] ?? entry.status}{" "}
                    · {entry.strategyKind} · {entry.evidenceCount} evidencia(s)
                  </span>
                  <small>
                    {new Date(entry.updatedAt).toLocaleString()} ·{" "}
                    {entry.runId.slice(0, 8)}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section
          id="privacidad"
          className="panel"
          aria-labelledby="privacy-title"
        >
          <p className="eyebrow">CONTROL DE DATOS</p>
          <h2 id="privacy-title">Privacidad y recuperación</h2>
          <p>
            Modo {privacyMode === "private" ? "privado" : "estándar"}:{" "}
            {privacyMode === "private"
              ? "el Strategy Engine descarta cualquier ruta que declare red."
              : "las rutas siguen sujetas a disponibilidad, policy y aprobaciones."}{" "}
            Ningún proveedor externo está habilitado.
          </p>
          <p>
            Los objetivos, metadatos de ejecución y memoria M6 se guardan
            localmente. Los resultados de proveedores y el streaming son
            efímeros; la evidencia conserva hashes.
          </p>
          {workspace && (
            <p className="quiet">
              Base de datos: {workspace.persistence.mode} · integridad{" "}
              {workspace.persistence.databaseIntegrity}
              {workspace.persistence.recovery
                ? ` · incidente ${workspace.persistence.recovery.incidentId.slice(0, 8)}`
                : " · sin recuperación de base de datos en este inicio"}
            </p>
          )}
        </section>

        <section
          id="capacidades"
          className="panel"
          aria-labelledby="providers-title"
        >
          <div className="panelHeader">
            <div>
              <h2 id="providers-title">Evidencia de subsistemas</h2>
              <p>
                Detectar una instalación no habilita automatización ni
                credenciales.
              </p>
            </div>
            {diagnostics && (
              <span className="quiet">
                {diagnostics.platform} · {diagnostics.arch}
              </span>
            )}
          </div>
          {diagnosticsError && (
            <p className="error" role="alert">
              {diagnosticsError}
            </p>
          )}
          {!diagnostics && !diagnosticsError && (
            <p className="quiet" role="status">
              Comprobando el sistema…
            </p>
          )}
          {diagnostics && (
            <div className="providerGrid">
              {diagnostics.providers.map((provider) => (
                <article className="providerCard" key={provider.id}>
                  <div className="providerInitial" aria-hidden="true">
                    {provider.displayName.slice(0, 1)}
                  </div>
                  <h3>{provider.displayName}</h3>
                  <p className="providerStatus">
                    {STATUS_LABELS[provider.status] ?? provider.status}
                  </p>
                  <p>{provider.reason}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Renderer root is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
