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
  workspaceAuditResponseSchema,
  workspaceRetentionResponseSchema,
  workspaceDataDeleteResponseSchema,
  workspaceDataExportResponseSchema,
  persistenceStatusResponseSchema,
  workspacePreviewRequestSchema,
  workspaceSelectionResponseSchema,
  type DesktopWorkspace,
  type Diagnostics,
  type OrchestrationPreview,
  type PolicyProfile,
  type WorkspaceApprovalResponse,
  type WorkspaceExecutionState,
  type WorkspaceHistoryEntry,
  type AuditEvent,
} from "@trivergence/contracts";

import "./styles.css";
import { ProviderSettings } from "./provider-settings.js";

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
  remote_state_unknown: "Estado remoto desconocido",
};

const messageFrom = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function App() {
  const [section, setSection] = useState("orquestacion");
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
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditValid, setAuditValid] = useState<boolean>();
  const [retentionDays, setRetentionDays] = useState(30);
  const [privacyMessage, setPrivacyMessage] = useState<string>();
  const [privacyError, setPrivacyError] = useState<string>();
  const [persistenceStatus, setPersistenceStatus] =
    useState<ReturnType<typeof persistenceStatusResponseSchema.parse>>();
  const [persistenceError, setPersistenceError] = useState<string>();
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
    let active = true;
    window.trivergence
      .getPersistenceStatus()
      .then((result) => {
        if (active)
          setPersistenceStatus(persistenceStatusResponseSchema.parse(result));
      })
      .catch((error) => {
        if (active)
          setPersistenceError(
            messageFrom(error, "No se pudo verificar la persistencia local."),
          );
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
      const retention = workspaceRetentionResponseSchema.parse(
        await window.trivergence.getWorkspaceRetention({
          workspaceId: selection.workspace.id,
        }),
      );
      setRetentionDays(retention.days);
      setPersistenceStatus(
        persistenceStatusResponseSchema.parse({
          ...selection.workspace.persistence,
          recoveredRuns: selection.workspace.recoveredRuns,
        }),
      );
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
      const audit = workspaceAuditResponseSchema.parse(
        await window.trivergence.getWorkspaceAudit({ workspaceId, limit: 50 }),
      );
      setAuditEvents(audit.events);
      setAuditValid(audit.valid);
      setHistoryError(undefined);
    } catch (error) {
      setHistory([]);
      setAuditEvents([]);
      setHistoryError(messageFrom(error, "No se pudo cargar el historial."));
    }
  }

  async function saveRetention() {
    if (!workspace) return;
    setPrivacyError(undefined);
    try {
      const result = workspaceRetentionResponseSchema.parse(
        await window.trivergence.saveWorkspaceRetention({
          workspaceId: workspace.id,
          days: retentionDays,
        }),
      );
      setPrivacyMessage(
        `Retención de ${result.days} día(s) guardada. ${result.deletedRequests} objetivo(s) vencido(s) eliminados.`,
      );
      await refreshHistory(workspace.id);
    } catch (error) {
      setPrivacyError(messageFrom(error, "No se pudo guardar la retención."));
    }
  }

  async function exportData() {
    if (!workspace) return;
    setPrivacyError(undefined);
    try {
      const result = workspaceDataExportResponseSchema.parse(
        await window.trivergence.exportWorkspaceData({
          workspaceId: workspace.id,
        }),
      );
      setPrivacyMessage(
        result.status === "saved"
          ? "Exportación JSON guardada. Guárdala en un lugar seguro: puede contener datos sensibles."
          : "Exportación cancelada.",
      );
    } catch (error) {
      setPrivacyError(messageFrom(error, "No se pudo exportar el workspace."));
    }
  }

  async function deleteData() {
    if (!workspace) return;
    setPrivacyError(undefined);
    try {
      const result = workspaceDataDeleteResponseSchema.parse(
        await window.trivergence.deleteWorkspaceData({
          workspaceId: workspace.id,
        }),
      );
      if (result.status === "cancelled") {
        setPrivacyMessage("Borrado cancelado. No se modificaron los datos.");
        return;
      }
      invalidatePreview();
      setPrivacyMessage(
        `${result.deletedRequests} objetivo(s) y sus datos activos eliminados. La cadena de auditoría permanece.`,
      );
      await refreshHistory(workspace.id);
    } catch (error) {
      setPrivacyError(messageFrom(error, "No se pudieron borrar los datos."));
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
        retentionDays,
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
  const terminalRun = Boolean(
    run && !["running", "cancelling"].includes(run.status),
  );
  const flowStages = [
    {
      label: "Objetivo",
      complete: Boolean(workspace && goal.trim().length >= 3),
    },
    { label: "Estrategia y plan", complete: Boolean(preview) },
    {
      label: "Preflight",
      complete: Boolean(preview && preview.evaluation.status !== "blocked"),
      blocked: preview?.evaluation.status === "blocked",
    },
    {
      label: "Aprobación",
      complete: Boolean(preview && approvalsReady),
      active: Boolean(preview && !approvalsReady),
    },
    {
      label: "Ejecución",
      complete: terminalRun,
      active: executionActive,
    },
    {
      label: "Postflight y evidencia",
      complete: Boolean(terminalRun && run?.outcomeEvaluation),
    },
  ];

  return (
    <div className="shell">
      <a className="skipLink" href="#main-content">
        Saltar al contenido principal
      </a>
      <aside className="navigation" aria-label="Navegación principal">
        <div className="brand" aria-label="Trivergence">
          <span className="brandMark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" focusable="false">
              <path
                d="M6 7L17 16L6 25M6 16H17M17 16H26"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6" cy="7" r="2" fill="currentColor" />
              <circle cx="6" cy="16" r="2" fill="currentColor" />
              <circle cx="6" cy="25" r="2" fill="currentColor" />
              <circle cx="26" cy="16" r="2.5" fill="currentColor" />
            </svg>
          </span>
          <span>
            Trivergence
            <small className="brandCaption">ORCHESTRATION SPACE</small>
          </span>
        </div>
        <nav>
          {[
            ["orquestacion", "◎", "Nuevo objetivo"],
            ["ejecucion", "▷", "Ejecución"],
            ["historial", "◷", "Historial"],
            ["privacidad", "◇", "Privacidad"],
            ["capacidades", "≡", "Diagnóstico"],
            ["proveedores", "⊞", "Proveedores"],
          ].map(([id, icon, label]) => (
            <a
              key={id}
              className={`navItem ${section === id ? "active" : ""}`}
              href={`#${id}`}
              aria-current={section === id ? "location" : undefined}
              onClick={() => setSection(id ?? "orquestacion")}
            >
              <span className="navIcon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </a>
          ))}
        </nav>
        <div className="privacyPill">
          {privacyMode === "private" ? "Privado" : "Estándar"} · {profile} · sin
          proveedor externo activo
        </div>
      </aside>

      <main id="main-content" className="content" tabIndex={-1}>
        {section === "proveedores" && <ProviderSettings />}
        <div hidden={section === "proveedores"}>
          {persistenceError && (
            <p className="error" role="alert">
              {persistenceError} No ejecutes acciones hasta revisarlo.
            </p>
          )}
          {persistenceStatus &&
            (persistenceStatus.recovery ||
              !persistenceStatus.privilegedActionsAvailable ||
              persistenceStatus.recoveredRuns > 0) && (
              <section
                className="panel"
                role="alert"
                aria-label="Estado de recuperación"
              >
                <h2>Atención: recuperación local</h2>
                <p>
                  {persistenceStatus.recovery
                    ? `Se aisló una base dañada (${persistenceStatus.recovery.incidentId.slice(0, 8)}) el ${new Date(persistenceStatus.recovery.detectedAt).toLocaleString()}. Motivo: ${persistenceStatus.recovery.reason}. Se preservaron ${persistenceStatus.recovery.files.map((file) => file.name).join(", ")} en ${persistenceStatus.recovery.quarantineDirectory}. La base activa puede no contener el historial anterior.`
                    : (persistenceStatus.reason ??
                      "La persistencia requiere revisión.")}
                </p>
                {persistenceStatus.recoveredRuns > 0 && (
                  <p>
                    {persistenceStatus.recoveredRuns} ejecución(es)
                    interrumpida(s) requieren revisión. Cuando un envío remoto
                    pudo ocurrir, Trivergence lo muestra como estado desconocido
                    y no lo reintenta automáticamente.
                  </p>
                )}
                <p>
                  Modo: {persistenceStatus.mode}. Auditoría:{" "}
                  {persistenceStatus.auditValid ? "íntegra" : "inválida"}.{" "}
                  {persistenceStatus.privilegedActionsAvailable
                    ? "Puedes continuar, pero revisa la pérdida potencial antes de ejecutar."
                    : "La ejecución y el borrado están bloqueados."}
                </p>
              </section>
            )}
          <div className="workbench">
            <div className="workbenchMain">
              <header id="orquestacion" className="pageHeader">
                <div>
                  <p className="eyebrow">TU ESPACIO DE ORQUESTACIÓN</p>
                  <h1>¿Qué quieres lograr?</h1>
                  <p className="subtitle">
                    Describe el objetivo. Trivergence compara rutas locales,
                    elige una estrategia y muestra el plan antes de ejecutar.
                  </p>
                </div>
                <div className="securityBadge">Control local</div>
              </header>

              <ol className="flowRail" aria-label="Flujo de orquestación">
                {flowStages.map((stage, index) => (
                  <li
                    key={stage.label}
                    className={
                      stage.blocked
                        ? "blocked"
                        : stage.complete
                          ? "complete"
                          : stage.active
                            ? "active"
                            : "pending"
                    }
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    {stage.label}
                  </li>
                ))}
              </ol>

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
                      La carpeta se elige con el diálogo del sistema.
                      Trivergence limita el acceso a esa carpeta y protege
                      secretos conocidos.
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
                  <details className="workspaceDetails">
                    <summary>Ver detalles y estado de la carpeta</summary>
                    <dl className="workspaceMeta">
                      <div>
                        <dt>Ruta canónica</dt>
                        <dd>
                          <code title={workspace.rootPath}>
                            {workspace.rootPath}
                          </code>
                        </dd>
                      </div>
                      <div>
                        <dt>Capacidades</dt>
                        <dd>
                          {workspace.capabilities.length} capacidades locales
                        </dd>
                      </div>
                      <div>
                        <dt>Recuperación</dt>
                        <dd>
                          {workspace.recoveredRuns > 0
                            ? `${workspace.recoveredRuns} ejecución(es) interrumpida(s) por revisar`
                            : "Sin ejecuciones interrumpidas"}
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
                  </details>
                )}
                {workspace?.persistence.recovery && (
                  <p className="notice" role="status">
                    Recuperación{" "}
                    {workspace.persistence.recovery.incidentId.slice(0, 8)}:{" "}
                    {workspace.persistence.recovery.reason}. Se preservaron{" "}
                    {workspace.persistence.recovery.files.length} archivo(s)
                    para revisión.
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
                        setPrivacyMode(
                          event.target.value as "private" | "standard",
                        );
                        invalidatePreview();
                      }}
                    >
                      <option value="private">Privado · rutas sin red</option>
                      <option value="standard">
                        Estándar · sujeto a policy
                      </option>
                    </select>
                  </div>
                  <div className="field fieldWide">
                    <label htmlFor="detail">
                      Detalle opcional del objetivo
                    </label>
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
                      Ruta relativa si quieres leer; texto literal si quieres
                      buscar. Para workflows es contexto opcional. No pegues
                      secretos.
                    </small>
                  </div>
                  <div className="formActions fieldWide">
                    <button
                      type="submit"
                      disabled={!workspace || planning || executionActive}
                    >
                      {planning
                        ? "Comparando rutas…"
                        : "Comparar rutas y crear plan"}
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
                      <p className="eyebrow">
                        ESTRATEGIA {preview.strategy.kind}
                      </p>
                      <h2 id="plan-title" ref={previewHeading} tabIndex={-1}>
                        Plan de ejecución propuesto
                      </h2>
                      <p>{preview.strategy.reason}</p>
                      {preview.strategy.candidates && (
                        <ol className="routeList" aria-label="Rutas comparadas">
                          {preview.strategy.candidates.map((candidate) => (
                            <li key={candidate.id}>
                              <strong>{candidate.id}</strong> ·{" "}
                              {candidate.status} · puntuación {candidate.score}
                              {preview.strategy.capabilityIds.includes(
                                candidate.id,
                              )
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

                  <div
                    className="evaluationGrid"
                    aria-label="Checks de evaluación"
                  >
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
                        <dd className="digest">
                          {preview.planIntegrity.digest}
                        </dd>
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
                            {approval.descriptor.targets.join(", ") ||
                              "Ninguno"}
                          </dd>
                        </div>
                        <div>
                          <dt>Executable</dt>
                          <dd>
                            {approval.descriptor.executable ??
                              "Operación interna"}
                          </dd>
                        </div>
                        <div>
                          <dt>Argumentos</dt>
                          <dd>
                            {approval.descriptor.argv.join(" ") || "Ninguno"}
                          </dd>
                        </div>
                        {approval.descriptor.providerRequest && (
                          <>
                            <div>
                              <dt>Proveedor / transporte</dt>
                              <dd>
                                {approval.descriptor.providerRequest.providerId}{" "}
                                ·{" "}
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
                          <dd>
                            {new Date(approval.expiresAt).toLocaleString()}
                          </dd>
                        </div>
                      </dl>
                      <div className="formActions">
                        <button
                          type="button"
                          onClick={() => decideApproval("grant")}
                        >
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
                      Solo se ejecuta el preview persistido. Cambiar la
                      intención exige planificar otra vez.
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
                {run?.status === "remote_state_unknown" && (
                  <p className="error" role="alert">
                    El proveedor pudo haber recibido o completado la operación.
                    Trivergence detuvo el workflow, preservó la evidencia y no
                    hará un reintento automático. Revisa la auditoría antes de
                    decidir el resultado.
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
                          run.outcomeEvaluation.checks.filter(
                            (check) => check.passed,
                          ).length
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
                          Workflow {run.output.result.outcome} ·{" "}
                          {privacyMode === "private"
                            ? "memoria temporal"
                            : "memoria local"}{" "}
                          {run.output.result.memoryEntryId.slice(0, 8)} ·
                          provenance{" "}
                          {run.output.result.provenanceDigest.slice(0, 12)}
                        </p>
                        <p className="quiet">
                          Uso: {run.output.result.usage.providerCalls}/
                          {run.output.result.budget.maxProviderCalls} llamadas ·{" "}
                          {run.output.result.usage.replansUsed}/
                          {run.output.result.budget.maxReplans} replan ·{" "}
                          {run.output.result.usage.outputBytes}/
                          {run.output.result.budget.maxOutputBytes} bytes de
                          salida · {run.output.result.usage.memoryItems}/
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
                                {check.passed ? "Verificado" : "Fallido"}:{" "}
                                {check.id}
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
                      Objetivos y ejecuciones anteriores, incluso tras reiniciar
                      la app.
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
                  <p className="quiet">
                    Todavía no hay ejecuciones registradas.
                  </p>
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
                          · {entry.strategyKind} · {entry.evidenceCount}{" "}
                          evidencia(s)
                        </span>
                        <small>
                          {new Date(entry.updatedAt).toLocaleString()} ·{" "}
                          {entry.runId.slice(0, 8)}
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
                {workspace && (
                  <div>
                    <h3>Eventos de auditoría</h3>
                    <p role="status">
                      Cadena:{" "}
                      {auditValid === undefined
                        ? "sin verificar"
                        : auditValid
                          ? "verificada"
                          : "inválida · no ejecutar"}
                      . Últimos {auditEvents.length} eventos de este workspace.
                    </p>
                    {auditEvents.length === 0 ? (
                      <p className="quiet">
                        No hay eventos consultables para este workspace.
                      </p>
                    ) : (
                      <ol
                        className="historyList"
                        aria-label="Eventos de auditoría"
                      >
                        {auditEvents.map((event) => (
                          <li key={event.id}>
                            <strong>{event.eventType}</strong>
                            <span>
                              #{event.sequence} · {event.subjectId.slice(0, 8)}{" "}
                              · hash {event.eventDigest.slice(0, 12)}
                            </span>
                            <small>
                              {new Date(event.occurredAt).toLocaleString()}
                            </small>
                            <details>
                              <summary>Metadatos del evento</summary>
                              <pre>
                                {JSON.stringify(event.payload, null, 2)}
                              </pre>
                            </details>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
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
                  En modo privado, el texto del objetivo y los argumentos de los
                  pasos no se conservan en la base; el plan se ejecuta en esta
                  sesión. El workflow privado usa memoria temporal y no recupera
                  memoria guardada. Metadatos y hashes siguen siendo locales; el
                  streaming es efímero.
                </p>
                <div className="field">
                  <label htmlFor="retentionDays">
                    Retención de historial y memoria
                  </label>
                  <select
                    id="retentionDays"
                    value={retentionDays}
                    disabled={!workspace || executionActive}
                    onChange={(event) => {
                      setRetentionDays(Number(event.target.value));
                      invalidatePreview();
                    }}
                  >
                    <option value={1}>1 día</option>
                    <option value={7}>7 días</option>
                    <option value={30}>30 días</option>
                    <option value={90}>90 días</option>
                    <option value={365}>365 días</option>
                  </select>
                </div>
                {workspace && (
                  <div className="panelActions">
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={
                        executionActive ||
                        !workspace.persistence.privilegedActionsAvailable
                      }
                      onClick={() => void saveRetention()}
                    >
                      Guardar retención
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => void exportData()}
                    >
                      Exportar JSON
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={
                        executionActive ||
                        !workspace.persistence.privilegedActionsAvailable
                      }
                      onClick={() => void deleteData()}
                    >
                      Borrar datos activos
                    </button>
                  </div>
                )}
                {privacyMessage && (
                  <p className="notice" role="status">
                    {privacyMessage}
                  </p>
                )}
                {privacyError && (
                  <p className="error" role="alert">
                    {privacyError}
                  </p>
                )}
                <p className="quiet">
                  El borrado no elimina la cadena de auditoría (identificadores
                  y hashes), backups, exportaciones anteriores ni archivos de
                  recuperación. Elige una ubicación segura para el JSON.
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
            </div>
            <aside
              className="contextRail"
              aria-label="Resumen de la orquestación"
            >
              <p className="eyebrow">BAJO TU CONTROL</p>
              <h2>Sesión local</h2>
              <p className="quiet">Del objetivo a un resultado verificable.</p>
              <ol className="journey">
                <li>
                  Objetivo
                  <span>
                    {workspace
                      ? "Carpeta seleccionada"
                      : "Elige una carpeta para empezar"}
                  </span>
                </li>
                <li>
                  Estrategia
                  <span>
                    {preview
                      ? `${preview.plan.steps.length} pasos planificados`
                      : "Compara rutas antes de actuar"}
                  </span>
                </li>
                <li>
                  Ejecución
                  <span>
                    {run ? RUN_LABELS[run.status] : "Nada en ejecución"}
                  </span>
                </li>
                <li>
                  Evidencia
                  <span>
                    {run
                      ? `${run.evidenceCount} registros`
                      : "Resultados y decisiones auditables"}
                  </span>
                </li>
              </ol>
              <div className="railFooter">
                <strong>Reference Provider</strong>
                <p className="quiet">
                  Pruebas locales. Sin IA externa conectada.
                </p>
                <a
                  href="#proveedores"
                  onClick={() => setSection("proveedores")}
                >
                  Configurar proveedores →
                </a>
              </div>
            </aside>
          </div>
        </div>
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
