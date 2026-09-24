# P3-E1 — informe de Durable Workflow State

Fecha: 2026-09-24  
Estado: `DONE`

## Resumen ejecutivo

P3-E1 agrega estado durable, local-first y versionado para workflows en SQLite.
Runtime conserva el ownership del lifecycle; Persistence conserva su
representación durable. Execution Gateway y Provider Gateway no adquirieron
estado propio. Reference Provider continúa siendo el único provider ejecutable.

La regla de seguridad es conservadora: dispatch sin terminal verificable queda
`unknown`, bloquea dependencias y no se reintenta. Un step nunca despachado
puede reanudar solo si plan, Project Context y entradas siguen verificables. Si
se perdió un output efímero de una dependencia, resume falla cerrado.

## Arquitectura y modelo durable

Migration `0009_durable_workflow_state` agrega:

- `durable_workflow_executions`: schema v1, run/workflow/plan digest, referencia
  de Project Context, workspace, lifecycle, revisión, budget, timestamps,
  expiración y razón terminal;
- `durable_workflow_steps`: identidad estable, dependencias, lifecycle,
  revisión, frontera de dispatch, effect class planificada y referencias a
  approval, provider attempt, evidence y output digest.

La identidad de workflow durable es la del plan ejecutable y su versión de
definición es la versión de Planner. El `WorkflowCandidate` producido por el
pipeline M6 dentro de un step conserva su propia identidad; no se convierte en
una segunda máquina de estados durable.

No se copian Project Context, Memory, Audit, Evidence, outputs ni recovery
payloads. Foreign keys, schemas y validación de bindings impiden referencias
cross-workspace o digests inconsistentes.

## Lifecycle y orden de escritura

Workflow usa `prepared`, `running`, `blocked`, `succeeded`, `failed` y
`cancelled`. Steps usan `pending`, `ready`, `running`, `blocked`, `unknown`,
`succeeded`, `failed`, `cancelled` y `timed_out`.

Runtime persiste `running` antes de llamar al dispatcher. El terminal y
`StepEvidence` comparten transacción; solo entonces se liberan dependencias. Un
workflow no puede quedar `succeeded` mientras un step requerido esté incompleto,
`unknown` o sin evidence.

## Restart, crash y resume

`recoverRunningRuns()` conserva terminales, marca como `unknown` los steps que
cruzaron dispatch sin terminal, bloquea su workflow, transforma el run en
`orphaned` y conserva evidencia/audit. Estados `ready` nunca despachados no se
convierten en UNKNOWN.

`resumeRunId` revalida preview, plan, Project Context y workspace. Solo reabre
un run `orphaned`/workflow `blocked` sin `running`, `unknown` o `blocked` steps
y sin dependencias cuyo output efímero se haya perdido. No ofrece exactly-once
ni re-prompting. Una resolución humana de provider registra un terminal
atribuido y Evidence, pero no inventa outputs.

La entrada de resume es una API de Runtime y requiere que el host suministre un
preview íntegro. La UI actual no reconstruye ni presenta esa acción tras
reinicio; esto limita la recuperación operativa del usuario y queda como deuda
de integración posterior, sin cambiar la semántica durable de P3-E1.

## Budgets, approvals y privacidad

El ledger durable conserva IDs despachados, provider calls y bytes observados.
Es monotónico y un replay interno no duplica dispatch ni saldo. Approval y
attempt se guardan por referencia; restart no regenera ni amplía approvals.

Private mode no crea workflow durable ni snapshots. Por tanto renuncia al resume
entre procesos para no persistir objetivos, argumentos, Context material u
outputs prohibidos. Modo estándar hereda retención, export y purge por
workspace.

## WorkflowExecutionSnapshot

Se difiere deliberadamente. El estado revisionado implementado no es el manifest
inmutable de ADR-0015. Hoy los outputs intermedios son efímeros; crear un
snapshot “reanudable” sin una referencia autoritativa copiaría datos o
prometería una capacidad falsa. ADR-0015 permanece
`ACCEPTED / implementation pending`. Branching, fork y time travel no se
implementaron.

## Tests

Las 20 pruebas nuevas cubren close/reopen SQLite, una nueva instancia de
Runtime, migración desde 0008, lifecycle durable y Evidence atómica, bindings
cross-workspace/context, estado terminal falsificado, success prematuro, replay
de dispatch, UNKNOWN y bloqueo tras restart, resume pre-dispatch, no retry
incierto, timeout, cancelación confirmada y no confirmada, excepción/resultado
inválido, budgets, approvals, provider attempts, private mode y retención. Las
suites existentes cubren Audit append-only, Memory sin duplicación, provider
recovery y Execution Gateway sin persistence.

Total final: **212 tests**.

## Gates

| Gate               | Resultado                                                                       |
| ------------------ | ------------------------------------------------------------------------------- |
| format             | PASS                                                                            |
| lint               | PASS                                                                            |
| build fresco       | PASS                                                                            |
| typecheck fresco   | PASS                                                                            |
| tests frescos      | PASS — 212/212                                                                  |
| Electron E2E       | PASS fuera del sandbox                                                          |
| Electron smoke     | PASS fuera del sandbox                                                          |
| security/audit     | PASS — sin vulnerabilidades conocidas                                           |
| SBOM               | PASS — 451 componentes                                                          |
| relative links     | PASS — 7 documentos revisados                                                   |
| whitespace         | PASS                                                                            |
| secret scan        | PASS                                                                            |
| scope verification | PASS — contratos, Runtime, persistence, wiring y documentación P3-E1 únicamente |

La prueba de terminación del árbol Windows y el renderer Electron fallan dentro
del sandbox por restricciones del entorno; los gates correspondientes pasaron
fuera del sandbox sin cambiar `ProcessSupervisor` ni Electron.

## Deuda técnica restante

- materializar `WorkflowExecutionSnapshot` cuando existan referencias durables
  legítimas para toda entrada requerida;
- ADR-0012 recovery envelope y ADR-0013 harness integrado siguen pendientes;
- ADR-0014 completo sigue pendiente; durable state consume la clasificación
  planificada existente y no la rebaja;
- resume después de un step confirmado con output efímero permanece bloqueado;
- la aplicación desktop todavía no ofrece resume de un run histórico desde la
  UI; requerirá reconstrucción y revalidación del preview estándar persistido;
- fan-out/fan-in y scheduler paralelo pertenecen a P3-B2.

## Siguiente paso mínimo

Detenerse. Tras verificar y commitear P3-E1, la siguiente fase del roadmap es
P3-B1 (Agent Profiles declarativos), en una tarea independiente.
