# Estado de implementación

Última actualización: 2026-09-25

Leyenda: `DONE` verificado, `PARTIAL` existe pero no cumple toda la aceptación,
`PLANNED` no iniciado, `BLOCKED` requiere una decisión o dependencia externa.

| Hito                                     | Estado    | Evidencia / bloqueo                                                                                                     |
| ---------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| M0 — especificación y riesgos            | `DONE`    | Documentos reencuadrados: orquestación como núcleo, ADR-0002, seguridad, UI, datos y roadmap coherentes.                |
| M1 — foundation segura                   | `DONE`    | Shell seguro, IPC nominal, diagnóstico, Policy Engine, build, smoke y E2E aislado verificados.                          |
| M2 — kernel de orquestación              | `DONE`    | Cuatro motores, contratos y preview verificados de renderer a UI sobre el build real de Electron.                       |
| M3 — Runtime, aprobación y audit         | `DONE`    | Plan persistido, aprobación de un uso, supervisión, evidencia, timeout/cancel y orphan recovery verificados.            |
| M4 — workspace/capacidades reales        | `DONE`    | Selección, preview, ejecución/cancelación, resultado y evidencia read-only verificados desde la UI.                     |
| M5 — primer conector                     | `PARTIAL` | Contrato/Reference Provider local verificados; ningún proveedor externo superó aún su gate.                             |
| M6 — workflows, agentes y memoria        | `DONE`    | Pipeline local de cinco pasos, budgets, provenance, memoria, evaluación, auditoría, E2E y build verificados.            |
| M7 — hardening/distribución              | `PARTIAL` | Controles y paquete unsigned verificados localmente; faltan reproducibilidad NSIS, firma y matriz limpia Windows 10/11. |
| P3-0 — documentación y ADRs              | `DONE`    | Normalización documental, ownership y cuatro ADRs; sin cambios de código ni inicio funcional de P3.                     |
| P3-0.1 — revisión técnica de ADRs        | `DONE`    | ADR-0012 a ADR-0015 aceptados con correcciones documentales; implementación pendiente.                                  |
| P3-A1 — Project Context mínimo           | `DONE`    | Snapshot v1 determinista, builder, persistencia privada/estándar, Strategy, threat model y tests verificados.           |
| P3-D0 — Execution Gateway                | `DONE`    | Contrato v1, backend local supervisado, Policy/Approval/Context bindings, límites y tests verificados.                  |
| P3-E1 — Durable Workflow State           | `DONE`    | Estado/steps SQLite, restart conservador, budgets/approvals y resume seguro verificados.                                |
| P3-B1 — Agent Profiles                   | `DONE`    | Perfiles v1 declarativos, selección/validación, refs durables, provenance y regresiones verificadas.                    |
| P3-B2.0 — Strategy Deliberation Contract | `DONE`    | ADR-0016 y arquitectura aceptados; no hay contratos ejecutables, concurrencia ni deliberación en Runtime.               |
| P3-B2.1 — bounded fan-out/fan-in         | `DONE`    | Runtime acotado, slices v1, estado durable, budgets, cancelación, UNKNOWN y 50 tests nuevos verificados.                |
| P3-B2 — deliberación y fan-out/fan-in    | `PARTIAL` | B2.0 y substrate B2.1 completos; Strategy Deliberation B2.2 permanece `PLANNED`.                                        |
| P3 — evolución arquitectónica            | `PARTIAL` | P3-A1, P3-D0, P3-E1, P3-B1, P3-B2.0 y P3-B2.1 completos; fases posteriores pendientes.                                  |

## P3-B2.1 — bounded fan-out/fan-in + context slicing (2026-09-25)

Estado: `DONE`. P3-B2 general continúa `PARTIAL`; B2.2 no comenzó.

- `RuntimeEngine` conserva ownership de scheduling y ejecuta grupos v1 con
  cantidad y concurrencia separadas, orden estable por `branchId` y profundidad
  máxima uno. No existe `ParallelRuntime`, scheduler de agente ni delegación
  recursiva.
- `ContextSliceBuilder` produce manifests inmutables, canónicos, acotados y
  ligados a Project Context, workspace, objective, group y branch exactos. Cada
  branch recibe solo su referencia; cualquier sustitución o ampliación falla
  cerrado.
- Migration `0011_bounded_branch_execution` persiste slices, grupos y bindings
  de ramas por referencias/digests. El lifecycle autoritativo sigue en Runtime y
  `durable_workflow_steps`; no se copian outputs, Memory, Evidence, perfiles ni
  Project Context.
- Los budgets `run → group → branch` se validan antes del dispatch y se cargan
  en transacciones `BEGIN IMMEDIATE`; contadores y dispatch IDs no se regeneran
  tras restart. `RUNNING` interrumpido pasa a `UNKNOWN`, bloquea fan-in y nunca
  produce retry automático.
- Cancelación por rama/grupo separa request de terminal confirmado. Fan-in
  referencia Evidence y expresa `confirmed`, `degraded`, `blocked`, `failed` o
  `cancelled`; nunca convierte `UNKNOWN` en fallo.
- Solo efectos efectivamente `PURE`/`READ_ONLY` y de lectura intrínseca son
  elegibles inicialmente. Capability, Policy y Approval permanecen fronteras
  distintas; approvals no se clonan.
- Private mode permite únicamente ejecución efímera local compatible: no crea
  filas durables de workflow, ramas ni slices y continúa bloqueando red.
- Evidencia: 50 tests nuevos y 290 tests totales, incluido fan-out real, límite
  concurrente, fan-in y continuación dependiente, cancelación y crash/reopen.
  Ver [informe P3-B2.1](docs/product/p3-b2-1-bounded-fanout-report.md).

No se implementaron proposals, critiques, evaluación deliberativa, synthesis,
voting ni selección multi-modelo. Reference Provider continúa siendo el único
provider ejecutable; M5 y M7 permanecen `PARTIAL`.

## P3-B2.0 — Strategy Deliberation Contract (2026-09-25)

Estado: `DONE` exclusivamente como decisión arquitectónica. P3-B2.1 implementa
el substrate; P3-B2.2 no comenzó.

- ADR-0016 fija un protocolo de dos planes: un `DeliberationPlan` preliminar
  pasa por Planner, Policy/Approval, Runtime y Provider Gateway; solo su outcome
  evaluado vuelve a Strategy para producir la decisión que alimenta al plan
  final.
- Strategy nunca llama providers. Proposal, critique y synthesis son datos no
  confiables; no conceden autoridad ni convierten mayoría, marca o confianza
  autodeclarada en evidencia.
- La identidad lógica de modelo/capability se separa de la ruta de provider para
  impedir falso consenso. Los participantes se filtran por elegibilidad,
  privacidad, budget y Policy antes de cualquier dispatch futuro.
- `DIRECT` conserva el flujo actual. `DELIBERATIVE` permanece sin implementar
  hasta P3-B2.2.
- Evidencia:
  [ADR-0016](docs/architecture/adr/0016-strategy-deliberation-contract.md),
  [informe P3-B2.0](docs/product/p3-b2-0-strategy-deliberation-report.md) y
  [threat model](docs/security/threat-model-p3-b2.md).

M5 y M7 continúan `PARTIAL`; Reference Provider sigue siendo el único provider
ejecutable.

## P3-B1 --- Agent Profiles (2026-09-25)

Estado: `DONE`. P3-B2.0 y B2.1 están cerrados; B2.2 no comenzó.

- El catálogo v1 convierte los roles M6 existentes en perfiles declarativos
  `planning`, `critique` y `synthesis`; ninguno contiene provider ID, modelo,
  backend, credencial o permiso. Reference Provider sigue siendo el único
  ejecutable por el gate M6 existente, no por definición de perfil.
- Cada perfil tiene identidad, revisión y digest canónico; Strategy comprueba
  elegibilidad de capabilities reales y Planner fija las referencias al step.
  Runtime valida contra el catálogo exacto y nunca sustituye por `latest`.
- Migration `0010_agent_profile_references` conserva refs ID/revisión/digest en
  plan y durable workflow, con comparación fail-closed tras restart. No se creó
  store de perfiles ni se duplicó Capability Registry o Project Context.
- Los límites medibles de input/output/tiempo/coste restringen el budget global.
  Policy/Approval siguen siendo autoridad; perfiles y guidance no la amplían.
  Private mode no crea workflow durable.
- Evidencia y límites:
  [`docs/product/p3-b1-agent-profiles-report.md`](docs/product/p3-b1-agent-profiles-report.md).
  M5 y M7 siguen `PARTIAL`; no se habilitó provider externo.

## P3-E1 --- Durable Workflow State (2026-09-24)

Estado: `DONE`. Esta base durable permanece vigente y P3-B1 ya está `DONE`.

- migration `0009_durable_workflow_state` agrega ejecuciones y steps
  normalizados con lifecycle/revisión, dependencias y referencias a
  plan/Context/approval/attempt/evidence;
- Runtime persiste `ready → running` antes del dispatch y el terminal junto con
  StepEvidence; un resultado ausente o inválido queda `unknown` y bloquea el
  workflow sin retry automático;
- startup recovery conserva terminales, transforma dispatches interrumpidos en
  `unknown` y mantiene steps nunca despachados reanudables solo cuando no falta
  un output efímero autoritativo;
- `resumeRunId` está probado con cierre/reapertura real de SQLite y nueva
  instancia de Runtime; la UI no ofrece todavía una acción de resume;
- budgets no se reinician: quedan dispatch IDs, provider calls y output bytes;
  approvals consumidas permanecen ligadas a su step y nunca se regeneran;
- private mode no crea durable workflow state ni snapshots, por lo que no
  promete resume tras cierre; retención y purge incluyen el nuevo estado;
- `WorkflowExecutionSnapshot` permanece pendiente: materializarlo sin outputs
  durables legítimos duplicaría fuentes de verdad. `ProviderRecoveryCheckpoint`
  continúa separado y ADR-0012/0013/0014 no fueron implementados.

Evidencia completa en
[`docs/product/p3-e1-durable-workflow-report.md`](docs/product/p3-e1-durable-workflow-report.md).
M5 y M7 permanecen `PARTIAL`; Reference Provider continúa siendo el único
provider ejecutable.

## P3-D0 --- Execution Gateway Contract (2026-09-22)

Estado: `DONE`. Al cerrar esta fase, P3-E1 todavía no había comenzado; su estado
actual se registra arriba.

- `ExecutionBackendManifest`, `ExecutionRequest`, `ExecutionPreparation` y
  `ExecutionResult` forman el contrato v1 y exponen capabilities, acceso host,
  aislamiento real (`none`), límites, lifecycle y provenance;
- `ExecutionGateway` valida backend/capabilities, Project Context, descriptor,
  evaluación de efecto planificada, Policy, approval consumida, privacidad y
  budgets antes del dispatch;
- `LocalSupervisedBackend` reutiliza la instancia existente de
  `ProcessSupervisor`; no existe un segundo supervisor, sandbox o camino de
  ejecución;
- `ProcessStepDispatcher` conserva su descriptor aprobado y delega la operación
  al gateway; Runtime sigue siendo owner del run y trata terminación de árbol no
  confirmada como `orphaned`;
- el gateway es efímero: no persiste argumentos ni extiende retención. Private
  mode continúa bloqueando red y el manifest no afirma confinamiento de
  filesystem o destino de red inexistentes;
- la severidad se consume desde `step.action.effectClass` como puente
  `planned-action-v1`; la implementación completa de ADR-0014 sigue pendiente.

Evidencia y gates completos en
[`docs/product/p3-d0-execution-gateway-report.md`](docs/product/p3-d0-execution-gateway-report.md).
M5 y M7 permanecen `PARTIAL`; Reference Provider continúa siendo el único
provider ejecutable.

## P3-A1 --- Project Context mínimo (2026-09-22)

Estado: `DONE`. P3-D0 no comenzó.

- `ProjectContextSnapshot` v1 representa objetivo por digest, identidad opaca de
  workspace, governance, referencias acotadas de capabilities, límites de budget
  y fuentes autorizadas con provenance;
- `ProjectContextBuilder` es el único constructor: normaliza orden, verifica
  workspace/capabilities/referencias, excluye material con forma de credencial,
  aplica 16 KiB y publica SHA-256 sobre JSON canónico;
- Strategy consume el snapshot y solo considera rutas incluidas en su contexto;
  Planner, Policy, Runtime, Registry, Memory, Audit y Evidence conservan su
  ownership;
- SQLite migration `0008_project_context` persiste snapshots inmutables solo en
  modo estándar, aplica expiración/retención y permite reapertura; private mode
  no crea una fila durable de contexto;
- el artefacto de preview liga Project Context a request, workspace, Registry y
  plan integrity; no contiene path raíz, objetivo en claro, consumos Runtime,
  credenciales ni contenido de recursos;
- 16 tests nuevos prueban determinismo, revisión/digest, orden canónico,
  aislamiento entre workspaces, privacidad, credenciales, fail-closed, tamaño,
  provenance, budgets, Policy, datos no confiables, Reference Provider y
  reapertura.

Evidencia local final: format, lint, build y typecheck frescos de 12 proyectos;
**165/165 tests** fuera del sandbox; Electron E2E y smoke; auditoría sin
vulnerabilidades conocidas; SBOM CycloneDX verificado con 451 componentes;
enlaces relativos, whitespace y secret scan sin hallazgos.

M5 y M7 permanecen `PARTIAL`; ningún provider externo fue habilitado y Reference
Provider continúa siendo el único ejecutable. Evidencia completa en
[`docs/product/p3-a1-project-context-report.md`](docs/product/p3-a1-project-context-report.md).

## P3-0 --- normalización documental (2026-09-22)

Estado: `DONE` exclusivamente para el alcance documental. P3-A1 no comenzó.

- Prompt Maestro separa selección actual de rutas de selección integral futura
  de providers;
- Roadmap adopta el orden
  `P3-A1 → P3-D0 → P3-E1 → P3-B1 → P3-B2.0 → P3-B2.1 → P3-B2.2 → P3-C → P3-A2 → P3-F1 → P3-F2`;
- ownership normativo evita fuentes de verdad duplicadas entre Context,
  Intelligence, Memory, Audit, Evidence, Trace, Runtime, Registry y gateways;
- ADR-0011 registra que una lista de recovery capabilities no exige
  automáticamente `recover()` y documenta la validación actual de AdapterHost
  como deuda técnica;
- ADR-0012 a ADR-0015 fueron propuestos en P3-0 y aceptados posteriormente en
  P3-0.1; esta aceptación no los implementa;
- dossiers de providers usan ADR-0011 como conclusión vigente sin cambiar gates
  contractuales, autenticación, distribución o billing.
- catálogo/manifests históricos aún nombran "Anthropic ant CLI" y recomiendan
  Codex en código; como ningún provider superó todos los gates, esa metadata no
  gobierna routing y queda registrada como deuda técnica posterior.

No se modificaron contratos ejecutables, Runtime, ProviderAdapter, AdapterHost,
trust store, autenticación ni providers. Reference Provider continúa siendo el
único ejecutable. M5 y M7 permanecen `PARTIAL`.

## P3-0.1 --- revisión técnica de ADRs (2026-09-22)

Estado: `DONE` para revisión y decisión documental. P3-A1 no comenzó.

- ADR-0012 `ACCEPTED`: separa identidad remota, continuación e idempotencia en
  un envelope versionado; el checkpoint local actual sigue sin migrar.
- ADR-0013 `ACCEPTED`: conserva exactamente 14 checks y reserva el veredicto de
  `interrupted_recovery` para un harness integrado observable; la callback
  autoatestiguada actual sigue como deuda.
- ADR-0014 `ACCEPTED`: separa severity de compensation assurance; Planner será
  owner de una evaluación efectiva versionada. El enum y clasificador actuales
  no cambiaron.
- ADR-0015 `ACCEPTED`: define un manifest inmutable de referencias/digests para
  estado confirmado. No existe schema ni persistencia de snapshots todavía y
  branching continúa experimental.

Se documentó la única contradicción normativa: `REVERSIBLE` deja de ser un
escalón ordinal y se preserva solo como representación ejecutable histórica
equivalente a `SIDE_EFFECTFUL + DEFINED`. ADR-0011 fue aclarado sin cambiar sus
garantías de UNKNOWN/retry.

No se modificó código, configuración, contratos ejecutables, tests,
autenticación ni trust store. Ningún provider fue habilitado; Reference Provider
continúa siendo el único ejecutable. M5 y M7 permanecen `PARTIAL`.

## M5-B0 --- contrato de recovery (2026-09-21)

Estado: `DONE` para la revisión y refactorización interna; M5 continúa
`PARTIAL`. [ADR-0011](docs/architecture/adr/0011-recovery-semantics.md) separa
recovery exacto del provider de recuperación segura de la orquestación.

- `ProviderAdapter` declara capabilities explícitas y `recover` es opcional;
- Runtime persiste el attempt antes del dispatch con request digest, clase de
  efecto, budget y estado remoto;
- pérdida de respuesta, stream o confirmación de cancelación produce
  `remote_state_unknown`, detiene dependencias y nunca dispara retry automático;
- checkpoints solo se consumen después de resultado terminal verificado;
- UNKNOWN requiere resolución humana atribuida y deja audit trail;
- UI e historial muestran la incertidumbre sin convertirla en éxito o fallo;
- las 14 comprobaciones se mantienen: providers sin exact recovery deben probar
  el límite UNKNOWN del sistema, no simular una reanudación;
- Codex, Claude y Vertex pierden únicamente el bloqueo técnico universal por
  exact recovery; sus gates externos permanecen intactos. Gemini Interactions
  conserva capabilities candidatas sujetas a adapter y pruebas reales.

Reference Provider continúa siendo el único ejecutable. No se construyó ni
habilitó ningún provider externo, no cambió autenticación/trust store y M7 no se
tocó.

Evidencia local final: formato, lint, build y typecheck de 12 proyectos; **149
tests**; Electron E2E y smoke; auditoría sin vulnerabilidades conocidas; SBOM
CycloneDX verificado con 451 componentes. CI Windows run `35608108255`:
`success`. Commit de cierre: `ba69a26293aead9efaa2f06069a02e0be7d0f67c`; `main`
y `origin/main` quedaron sincronizados (`0/0`) y el árbol limpio.

## M5-A --- Gate definitivo de Codex App Server (2026-09-15)

Resultado global: `UNRESOLVED`. La interfaz técnica oficial, `stdio`, schemas,
streaming, cancelación y login gestionado son candidatos viables, pero el
comando figura experimental/no soportado para producción y no existe una
respuesta contractual inequívoca para una aplicación open-source de terceros con
cuentas Plus/Pro. No hay recovery documentado del mismo turn; bajo ADR-0011 esto
es una capability ausente manejable mediante el límite UNKNOWN, no un bloqueo
técnico universal.

Se creó el expediente, las preguntas para OpenAI y el threat model específico.
No se creó adapter ni spike, no se habilitó Codex, no cambió el trust store y M5
permanece `PARTIAL`.

## M5-A2 --- Gate de Claude/Anthropic (2026-09-15)

Resultado global: `UNRESOLVED`. Anthropic permite ejecutar Claude Code oficial e
inalterado dentro de productos y documenta `claude -p` con JSONL, cancelación,
sesiones y budgets. El login permanece en el cliente oficial: Trivergence no
ofrece OAuth ni lee credenciales. Pro, Max, Team y Enterprise pueden consumir
hoy sus límites de suscripción; Free no incluye Claude Code. Claude Platform
mediante `ant` queda como alternativa sin clave manual y billing API separado.

La ausencia de exact recovery fue un bloqueo técnico bajo el contrato anterior;
M5-B0 eliminó ese requisito universal y ahora una interrupción sin primitive
suficiente falla seguro mediante `remote_state_unknown`. El gate contractual
sigue abierto porque debe confirmarse que el uso exacto como provider cae dentro
de la autorización aplicable y no introduce un login/rate-limit propio no
permitido. Se crearon expediente, preguntas y threat model; no se creó adapter
ni spike, no se habilitó Claude, no cambió el trust store y M5 permanece
`PARTIAL`.

## M5-A3 --- Gate de Google/Gemini (2026-09-15)

Resultado global: `UNRESOLVED`. Gemini CLI con login Google y Gemini Code Assist
se rechazan como mecanismos de provider: Google prohíbe el piggyback del OAuth
del CLI, el entitlement no es transferible y el acceso consumidor
Individual/Google AI Pro/Ultra terminó el 18 de junio de 2026. No se leyeron ni
reutilizaron credenciales.

Gemini Developer API Interactions es una API oficial de terceros y documenta
streaming, background execution, cancelación, interaction IDs y reconexión;
queda `CONDITIONALLY_APPROVED` solo como alternativa futura porque exige
key/auth key, proyecto y billing separados. No se añadió soporte de keys ni se
autorizó su implementación.

Vertex AI mediante ADC/OAuth/IAM y proyecto facturable del usuario permanece
`UNRESOLVED`. Tras M5-B0, la ausencia de exact recovery de inferencia online ya
no es un bloqueo técnico universal: puede operar bajo el límite seguro UNKNOWN.
Aún faltan aprobar custodia ADC, binding cuenta/proyecto, billing, contrato y
evidencia real de las capabilities declarables. Se crearon expediente, preguntas
y threat model. No hubo adapter, spike, cambios de ProviderAdapter/trust store
ni activación; Reference Provider continúa siendo el único ejecutable. M5 y M7
permanecen `PARTIAL`.

## P2 --- product hardening y preparación de M5 (2026-09-15)

Estado: `DONE` para el alcance interno P2. Los gates locales finales y la
[CI Windows 34966426691](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34966426691)
del commit `b77af20c79806e2b9fd9806bca1ab7b3fc8a2e64` pasaron. No habilita
proveedores ni cambia M5/M7.

- Auditoría desde `6f81f26`: línea base sin caché, E2E, smoke, seguridad y SBOM
  pasaron antes de modificar; P1 ya figuraba cerrado en la documentación.
- El flujo objetivo primero se presenta como una secuencia única desde Strategy
  y preflight hasta postflight, evidencia e historial. No se añadió una función
  de producto ni una superficie de IDE.
- `ProviderStepDispatcher` exige un `AdapterHost` explícito; se eliminó la vía
  heredada que construía hosts privados. Desktop mantiene un host por sesión.
- Suite de conformidad exportada con 14 checks: capability, prepare, execute,
  stream, cancelación, recovery, interrupción, timeout, fallos tipados, budgets,
  provenance, aprobación, respuesta malformada y proveedor no alojado. Reference
  Provider pasa; no representa una IA externa.
- Configuración separa disponibilidad de instalación, autenticación, gate,
  habilitación y bloqueo, y rechaza combinaciones imposibles.
- Runtime evita persistir summaries o excepciones de dispatchers en modo
  privado. La regresión verifica objetivo, argumentos, error, export y
  auditoría.
- Seis capturas reales y sanitizadas se generan mediante Electron en
  `docs/assets/screenshots/`; no se insertó nada en el README público.
- Hallazgos, decisiones y riesgos remanentes: `docs/product/p2-audit.md`.

Evidencia local final: formato y lint; build y typecheck de 12 proyectos; **142
tests**; Electron E2E y smoke; auditoría sin vulnerabilidades conocidas; SBOM
CycloneDX verificado con 451 componentes. CI Windows repitió instalación limpia,
gates sin cache, E2E, smoke y seguridad con resultado `success`.

## P1 transversal hacia v1.0 (2026-09-14)

Estado: `DONE` para el alcance P1 descrito aquí. Gates locales frescos `PASS` y
CI Windows del commit `cf2146fb329d3cd06ca57994fbd9fd9c77ea14ff`
[run 34903034199](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34903034199)
`success`: instalación limpia, check sin Turbo cache, E2E, smoke y seguridad. M5
y M7 siguen `PARTIAL`.

- Historial persistido y eventos de auditoría consultables por workspace desde
  la UI, con estado visible de la cadena y exportación JSON.
- Recuperación mostrada al arrancar, incluso antes de elegir carpeta: motivo,
  archivos, ubicación de cuarentena, modo de la base y ejecuciones huérfanas. Un
  fallo que impida abrir o preservar la base muestra error modal y cierra.
- Modo privado no persiste nuevos textos de objetivo ni argumentos de pasos; el
  workflow no recuerda memoria guardada ni persiste su resultado temporal. El
  modo estándar conserva la memoria funcional con retención acotada.
- Retención de 1--365 días solo tras guardarla explícitamente, borrado
  confirmado de datos activos por workspace y vaciado de contenido/provenance de
  memoria eliminada o expirada. La cadena append-only, backups y exportaciones
  no se borran; no se afirma eliminación forense.
- El journal de archivos M7 se documenta como SHA-256 no autenticado. El número
  de versión se declara únicamente en `apps/desktop/package.json`; SBOM y
  verificación de paquete lo leen de esa fuente.
- Licencia Apache-2.0 y notices del repositorio añadidos al paquete de ensayo.
  La revisión exhaustiva de dependencias y sus obligaciones sigue en M7.
- Evidencia local: `pnpm check:fresh` pasó con formato, lint, build/typecheck de
  12 proyectos y 139 tests; `pnpm e2e:desktop`, `pnpm smoke:desktop`,
  `pnpm sbom:generate` y `pnpm security` pasaron. No se detectaron
  vulnerabilidades conocidas; SBOM verificado con 451 componentes.
- `pnpm package:win` generó el instalador unsigned; en `win-unpacked/resources`
  se verificó presencia de `LICENSE`, `NOTICE` y `THIRD_PARTY_NOTICES.md`. Esto
  no satisface firma, reproducibilidad ni licencias transitivas de M7.

## Orchestration Space y preparación de proveedores (2026-09-14)

Estado: interfaz y configuración local `DONE`; conexión y ejecución externa
siguen `PARTIAL` dentro de M5. Ninguna evidencia de este cambio cierra M7.

- Rediseño de navegación, superficie objetivo primero, resumen de sesión y
  sección separada Proveedores. Los detalles técnicos de la carpeta siguen
  disponibles bajo desplegable. La vista de Proveedores distingue instalación,
  autenticación, gate, ejecución y bloqueo con razones explícitas.
- Preferencias locales versionadas y validadas: proveedor preferido, dirección
  loopback y nombre de modelo Ollama. No hay campos de key/token/password, login
  ni conexión de red. Guardar no altera el Registry, AdapterHost, Strategy
  Engine ni las attestations. La preferencia todavía no enruta ejecuciones.
- Archivo de preferencias con límite, rechazo de campos desconocidos, temporal
  exclusivo y rename; corrupción preservada en modo solo lectura. Modelos cloud
  de Ollama no se ejecutan. APIs con key quedan como extensión futura aislada.
- Evidencia local fresca: `pnpm check:fresh` pasa con formato, lint,
  compilación, typecheck y **138 tests**. En el sandbox, la prueba de
  terminación de árbol Windows falla por restricciones del entorno; fuera del
  sandbox pasa. `pnpm e2e:desktop` pasa el workflow completo y el
  guardado/rechazo de gate falsificado. axe WCAG AA y zoom 200 % pasan en ambas
  vistas. También pasan `pnpm smoke:desktop`, `pnpm sbom:generate` y
  `pnpm security`; npm no informa vulnerabilidades conocidas y el SBOM
  verificado contiene 451 componentes.
- Detalle de diseño, límites y amenaza: `docs/design/orchestration-space.md` y
  `docs/architecture/provider-configuration.md`.

## Evolución arquitectónica investigada (2026-09-21)

Estado: `PLANNED` / `EXPERIMENTAL`. Esta sección **no describe funciones
implementadas** y no modifica M5, M6 ni M7.

Se consolidaron funciones útiles para una futura P3 sin adoptar como núcleo los
sistemas usados durante la investigación:

- `DONE` P3-A1: Project Context mínimo, versionado por workspace;
- `DONE` P3-D0: contrato de Execution Gateway sobre ejecución supervisada;
- `DONE` P3-E1: estado durable de workflows, restart conservador y resume
  acotado; snapshots confirmados siguen pendientes;
- `DONE` P3-B1: perfiles declarativos por capabilities, contexto y budgets
  restrictivos, sin autoridad propia;
- `DONE` P3-B2.0: contrato arquitectónico de Strategy Deliberation, sin
  implementación ejecutable;
- `DONE` P3-B2.1: fan-out/fan-in con concurrencia, cancelación, context slicing,
  budget agregado, durable branch state y provenance;
- `PLANNED` P3-B2.2: proposals, crítica, Evaluation y selección/síntesis antes
  del plan ejecutable;
- `PLANNED` P3-C: Tool Gateway mediante MCP bajo Registry → Policy → Approval →
  Runtime → Evidence;
- `PLANNED` P3-A2: Project Intelligence derivada con citas, provenance, context
  packs y detector de deriva con revisión humana;
- `PLANNED` P3-F1: Trivergence Trace como proyección correlacionada;
- `PLANNED` P3-F2: exporter OpenTelemetry opt-in y sanitizado;
- `EXPERIMENTAL`: Agent Gateway mediante A2A;
- `EXPERIMENTAL`: automatización web con niveles de riesgo y approvals;
- `EXPERIMENTAL`: knowledge graph relacional/temporal, embeddings opcionales y
  branching desde `WorkflowExecutionSnapshot` confirmado, nunca desde un
  `ProviderRecoveryCheckpoint`;
- `OUT OF SCOPE` para el compromiso actual: marketplace público de código no
  auditado, autonomía destructiva, IDE completo y modelo fundacional propio.

La arquitectura objetivo y el orden están documentados en
`TRIVERGENCE_PROMPT_MAESTRO_CODEX.md` y `ROADMAP.md`. Ninguna capacidad de esta
sección puede marcarse `DONE` sin implementación y evidencia propias.

## Ampliación arquitectónica investigada (2026-09-25)

Estado: `PLANNED` / `EXPERIMENTAL`. **No describe capacidades implementadas** y
no modifica M5, M7 ni el hecho de que Reference Provider sea el único provider
ejecutable.

La revisión de providers, routers y herramientas modernas refuerza la dirección
del producto: Trivergence recibe un objetivo y debe poder resolver, sin exigir
selección manual en cada tarea, la combinación elegible de modelo/capacidad,
ruta de provider, Agent Profile, tools y backend de ejecución. La resolución
automática solo puede considerar opciones disponibles, compatibles,
gate-authorized y permitidas por Policy/Approval, privacidad, budgets y
restricciones del usuario.

Quedan registradas como dirección futura, sin marcar `DONE`:

- resolución separada `modelo/capacidad → provider route`, con fallback solo
  entre rutas autorizadas y provenance completo;
- rutas cloud, CLI oficial, empresariales, locales u open-weight sin acoplar el
  core a una marca;
- Strategy Deliberation: proposals independientes, crítica/contraste, Evaluation
  y selección/síntesis antes de ejecución;
- delegación dinámica acotada, context slicing y fan-out/fan-in evaluado;
- research como familia de capabilities de búsqueda, retrieval, citas y
  análisis;
- artifacts versionados con identidad, digest, productor, Evidence y estado;
- capabilities multimodales para diseño, voz, imagen y video;
- Tool Gateway/MCP bajo Registry → Policy → Approval → Runtime → Evidence;
- routers/meta-providers como rutas opcionales sujetas a los mismos gates.

No se añadieron adapters, providers ejecutables, tools, credenciales ni
dependencias por documentar esta dirección.

## Alineación conceptual de Strategy Deliberation (2026-09-25)

Estado: `DONE` como decisión arquitectónica, `PENDING` como capacidad
deliberativa ejecutable. P3-B1 y el substrate P3-B2.1 están `DONE`; B2.2 no
comenzó; M5 y M7 continúan `PARTIAL`; Reference Provider sigue siendo el único
provider ejecutable.

La definición de producto queda alineada así:

`objetivo → contexto/elegibilidad → [propuestas independientes → crítica → evaluación → selección/síntesis] → estrategia → plan → policy/approval → ejecución → verificación → resultado/evidence`.

Para objetivos sustanciales o cuando el usuario lo solicite, Trivergence debe
poder pedir soluciones estructuradas a varias inteligencias elegibles,
contrastarlas y producir una decisión explicable. La IA que proponga la
estrategia elegida no se convierte automáticamente en ejecutora o verificadora.
Tareas triviales podrán usar ruta directa para respetar budget, latencia y
privacidad.

P3-B2 queda dividido en tres subfases: `P3-B2.0`, contrato de Strategy
Deliberation ya aceptado; `P3-B2.1`, bounded fan-out/fan-in, context slicing y
estado durable de ramas; `P3-B2.2`, proposals/critique/evaluation/synthesis
sobre ese substrate. Las dos últimas continúan `PLANNED`.

Proposal, critique y synthesis serán `untrusted_data`; no conceden permisos,
Approval, Policy ni verdad. La decisión usa criterios verificables y budgets, no
mayoría simple, identidad de marca ni confianza autodeclarada. Dos rutas hacia
el mismo modelo no son automáticamente dos opiniones independientes.

No se añadieron contratos ejecutables, migrations, providers, adapters, tools,
credenciales, tests o dependencias por esta alineación documental.

## Entorno de descubrimiento

- Windows 11, PowerShell 5.1.
- Node `v24.14.0`.
- pnpm configurado y verificado en `11.19.0`.
- Git `2.53.0.windows.1`.
- Codex detectado; Claude Code detectado; Gemini CLI no detectado.
- El directorio inicial no era un repositorio Git.
- `npm.ps1` está bloqueado por la execution policy local; los scripts usarán
  `pnpm` y no alterarán la política del sistema.

## P0 de la auditoría v1.0

Estado: `DONE` para el alcance P0. Los gates frescos pasaron localmente y la CI
Windows del commit `bf80d3213895ff080dfc6057f423182abe0909cb` terminó verde
([run 34871238822](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34871238822)).
No implica cierre de M5 ni M7.

- `DONE` en código local: Strategy v2 genera/compara/selecciona rutas a partir
  del objetivo y metadatos del Registry; mantiene selección explícita por
  compatibilidad. Privacidad filtra rutas con red y Runtime vuelve a comprobar.
- `DONE` en código local: un `AdapterHost` por sesión aloja el Reference
  Provider; Runtime y equipo de agentes M6 pasan por él. Verifica identidad de
  preview, stream y provenance. No hay adaptadores externos registrados.
- `DONE` en código local: Evaluation Engine separa preflight y postflight;
  postflight comprueba run, snapshot, digest, evidencia y outcomes, y se audita.
- `DONE` en código local: IDs de proveedor extensibles y validados; el trust
  store externo continúa vacío.
- `DONE` en código local: UI objetivo primero, rutas comparadas, privacidad,
  historial acotado por workspace, estado de persistencia y recuperación.
- `DONE`: Git en `main`, commit publicado y workflow Windows de gates frescos
  ejecutado en GitHub Actions.
- Evidencia final: ver sección de auditoría P0 al final de este documento.
  Electron E2E/smoke y Runtime process-tree necesitan ejecutarse fuera del
  sandbox de Codex; dentro de él Chromium y `taskkill /T` son bloqueados.
  `sandbox: true` permanece intacto en el producto.

## Evidencia histórica M1--M7 (2026-09-11)

- `pnpm install --frozen-lockfile`: verificado con política de madurez y scripts
  permitidos por paquete.
- `pnpm lint`: pasa sin warnings.
- `pnpm typecheck`: pasa en los doce paquetes/aplicaciones.
- `pnpm test`: 115 pruebas pasan; 14 corresponden al Orchestration Engine, 12 a
  persistencia/auditoría, 15 al Runtime, 11 al Workspace, 14 a contratos
  estables, 2 a contratos de coordinación, 22 a gate/Provider Adapters/Reference
  Provider, 8 a policy, 3 a agentes, 1 a memoria, 3 a workflows y 10 al desktop.
- `pnpm build`: genera main ESM, preload CJS mínimo y renderer Vite.
- `pnpm smoke:desktop`: Electron usa un perfil de prueba aislado, carga y cierra
  con código 0.
- `pnpm e2e:desktop`: selecciona un workspace real, persiste previews, ejecuta
  una lectura, muestra evidencia, cancela una búsqueda y completa el flujo del
  Reference Provider con preview de contexto, aprobación de un uso, stream y
  resultado; además ejecuta el workflow M6 completo de cinco pasos con tres
  aprobaciones de un uso, resultado/budget/provenance visibles, cinco
  evidencias, axe, teclado y reflow al 200 %.
- `pnpm audit`: cero vulnerabilidades conocidas al 2026-09-11; se fijaron
  `nanoid` 3.3.18 y Vitest 4.1.11 por advisories detectados durante M7.
- Preview: intención de diagnóstico → strategy secuencial → dos pasos
  dependency-first → policy por paso → evaluación `ready` → SHA-256 canónico,
  sin ejecutar.
- Revalidación: mutaciones de plan, policy, target o Capability Registry
  invalidan el artefacto; canonicalization version desconocida se rechaza.
- Persistencia: migraciones/checksum, vínculo run-plan-snapshot-digest,
  auditoría append-only, único escritor, backup/restore y recovery read-only
  verificados.
- Runtime: allow/deny, aprobación granted/denied/expired/consumed, descriptor
  inmutable, timeout, cancelación, árbol Windows y orphan recovery verificados.
- Provider Adapter: puente genérico, transporte streaming, cancelación, budgets,
  preview de contexto, provenance y errores tipados verificados; el uso parcial
  y el último checkpoint válido sobreviven a fallos/cancelación.
- Recuperación histórica del Reference Provider: checkpoint local persistido y
  ligado a plan/paso/adapter, reinicio de Runtime, aprobación nueva, reanudación
  y consumo único verificados. M5-B0 reemplazó la generalización de este
  mecanismo por capabilities explícitas y `remote_state_unknown` para providers
  reales.
- Workspace: raíz canónica e identidad revalidada, exclusiones obligatorias y
  del usuario, `.gitignore` conservador, UTF-8/tamaño, traversal, ADS, rutas
  absolutas y junction externo verificados.
- Git read-only: ejecutable absoluto, repo root local, environment/argv
  acotados, porcelain NUL, diff por path explícito y rechazo de helpers,
  includes, object alternates y metadata externa verificados.
- Flujo local: parámetros ligados al hash del plan → Registry → Runtime →
  resultado efímero → evidencia con digest; auditoría no contiene el contenido.
- Desktop: IPC nominal sin bus genérico para selección, preview, ejecución,
  consulta, cancelación y aprobaciones; Main conserva raíz canónica, Registry y
  artefactos, mientras el renderer solo envía intención y referencias opacas.
- Accesibilidad: cero violaciones axe en el flujo crítico, skip link, foco
  visible, controles de 44 px, estados textuales y reflow al 200 %. Narrator
  queda como validación humana previa a beta.
- Proveedores externos: expediente comparativo y attestations candidatas
  creados; el trust store está vacío y las tres capabilities se publican
  `unavailable`. Ninguna versión, auth, login, dispatcher o ejecución externa
  está habilitada. El Reference Provider es local, sin red ni credenciales y no
  forma parte de ese trust store.
- M6: `memory.local.recall` → `agent.reference.team` →
  `workflow.local.synthesis` → `memory.local.commit` → `workflow.local.evaluate`
  se expande por dependencias sin cambios en Strategy, Planner, Registry ni
  Evaluation Engine.
- Agentes: roles planner/critic/synthesizer sin autoridad de policy/tools,
  restringidos por manifest al Reference Provider local y por budgets agregados
  de llamadas, input, output, coste y tiempo.
- Workflows: definición `workflow.local.team-memory-evaluation@1.0.0`, checks
  deterministas y como máximo una reparación usando únicamente budget remanente.
- Memoria: namespace de workspace, límites de cantidad/bytes, TTL, borrado,
  poda, contenido/provenance inmutables salvo redacción al borrar y eventos de
  auditoría content-free.
- Provenance: digests encadenan contribuciones, equipo, candidato, memoria y
  evaluación; alteración falla antes de persistir o produce rechazo.
- Runtime: dispatchers solo ven copias profundas e inmutables de outputs de sus
  dependencias directas; un test impide mutación y acceso lateral.
- Archivos M7: watcher acotado, snapshot de contenido/metadata/digest, rechazo
  de symlink/hardlink, temp en el mismo volumen, `fsync`, rename, journal con
  SHA-256 **no autenticado**, rollback y recovery que no pisan contenido
  inesperado.
- Persistencia M7: una base ilegible se preserva con SQLite/WAL/SHM y hashes en
  cuarentena antes de crear una base sana; un backup solo se activa tras
  SHA-256, `quick_check` y audit chain válidos, preservando la base desplazada.
- Update M7: manifest canónico Ed25519, key id fijado, HTTPS y host allowlist,
  anti-downgrade y verificación de tamaño/digest probados. La red de updates
  permanece deshabilitada (`externalUpdatesEnabled = false`).
- Paquete M7: Electron Builder 26.15.3 + NSIS x64, ASAR integrity y fuses; SBOM
  CycloneDX 1.7 de 451 componentes y manifest de artefactos SHA-256.
- Ensayo local Windows: instalador one-click unsigned instala, arranca el smoke
  empaquetado y desinstala con código 0. Esto no sustituye una VM limpia.
- Gate de reproducibilidad: `app.asar` fue idéntico en dos builds consecutivos
  (`d8848f…cd61`), pero NSIS no (`d8168b…a6e6` frente a `f29beb…62dd`); el
  control queda automatizado y M7 no se cierra hasta resolverlo y repetirlo en
  un segundo host.
- Artefacto final local: `Trivergence-0.7.0-windows-x64-UNSIGNED.exe`, SHA-256
  `f29beb67c82a6df2d8050e4714b5acb878c6d3c1c02e9e536a94dad87cb862dd`;
  instalación, arranque empaquetado y desinstalación `PASS`, firma `NotSigned`.
- Gate final M7: `pnpm check`, `pnpm e2e:desktop`, `pnpm smoke:desktop`,
  `pnpm security`, SBOM y manifest de 79 artefactos pasan el 2026-09-11. M5
  continúa `PARTIAL` y el trust store externo vacío.

## Afirmaciones todavía no permitidas

- No afirmar que existe deliberación multi-IA de producción: Strategy
  Deliberation permanece `PLANNED` y no hay providers externos ejecutables.
- No presentar consenso/votación entre modelos como criterio implementado o
  autoridad.

- Existen flujos locales read-only y de coordinación M6 accesibles de extremo a
  extremo, pero no el MVP completo con proveedor externo, distribución y
  validación humana final.
- Hay un paquete Windows instalable solo para ensayo local, marcado `UNSIGNED`;
  no es una release distribuible y no existe canal de actualización habilitado.
- El centro de aprobación está validado con el Reference Provider local; aún
  falta validarlo contra la interfaz real de un proveedor después de su gate.
- Ningún proveedor externo está integrado o aprobado. Codex App Server y Claude
  Code oficial tienen gates `UNRESOLVED`; Claude Platform mediante `ant` es una
  alternativa y Gemini Vertex conserva su gate empresarial separado.
- No se ha realizado revisión legal ni de marca.
- No hay firma Authenticode, evidencia de Windows 10/11 limpios ni instalador
  byte-reproducible; por ello M7 permanece `PARTIAL`.

## Auditoría final P0 --- 2026-09-12

- `pnpm check:fresh`: `PASS` sin Turbo cache; Prettier, ESLint, typecheck de los
  12 proyectos, 123 tests de 12 proyectos y build directo de 12 proyectos.
- `pnpm e2e:desktop`: `PASS` tras rebuild directo; workspace, lectura,
  búsqueda/cancelación, Reference Provider y workflow M6, incluidas rutas,
  historial, privacidad y evaluación posterior.
- `pnpm smoke:desktop`: `PASS` con perfil aislado.
- `pnpm sbom:generate` + `pnpm security`: `PASS`; sin vulnerabilidades conocidas
  y SBOM CycloneDX verificado con 451 componentes.
- `graphify update .`: `PASS`; grafo AST actualizado (1.942 nodos, 2.753
  relaciones). Los archivos generados están ignorados por Git.
- Electron/Runtime: los fallos iniciales dentro del sandbox de Codex se
  reprodujeron como restricciones de procesos del entorno; fuera de ese sandbox,
  Runtime 15/15, Electron E2E y smoke pasaron. No se deshabilitó `sandbox: true`
  de Electron ni se incorporó `--no-sandbox` al producto.
- Git: al corte de esta auditoría (2026-09-12) aún no había commit ni remoto.
  Posteriormente se publicó `bf80d321` y la CI Windows pasó en el run
  [34871238822](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34871238822),
  cerrando el alcance P0 sin cambiar M5 ni M7.
- Gates no cubiertos por este P0: reproducibilidad/firma/VM limpia de M7,
  revisión humana/legal y conector oficial de M5. Ambos hitos permanecen
  `PARTIAL`.
