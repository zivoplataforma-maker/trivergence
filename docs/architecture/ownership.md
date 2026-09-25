# Ownership arquitectónico de Trivergence

Estado: **normativo; Project Context, Execution Gateway y durable state
implementados**  
Fecha: 2026-09-22

## Propósito

Esta tabla evita que la evolución P3 cree autoridades paralelas. Un componente
puede consumir o proyectar datos de otro, pero no asumir su responsabilidad
principal. Toda proyección conserva identidad, provenance y vínculo con su
fuente.

| Componente             | Responsabilidad principal                                                          | Fuente o entrada                                                              | Salida o proyección                                         | Prohibición de ownership                                               |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| Project Context        | Snapshot versionado del contexto operativo permitido para una decisión o ejecución | objetivo, workspace, policy, Registry, Memory, budgets e historial autorizado | context snapshot identificado y auditable                   | no persiste conocimiento como Memory ni reemplaza Audit                |
| Project Intelligence   | Índice derivado y reconstruible de fuentes autorizadas                             | workspace, documentación, código, ADRs, runs y evidence permitidos            | búsquedas, citas, context packs y señales de drift          | no es verdad del proyecto ni autoedita documentos gobernantes          |
| Memory                 | Conocimiento persistido y gobernado                                                | resultados explícitamente admitidos, provenance, TTL y retención              | recall acotado y elementos persistidos                      | no registra todos los hechos de ejecución ni suplanta Audit            |
| Audit                  | Registro append-only de hechos de ejecución                                        | transiciones y decisiones observadas                                          | eventos verificables y exportables                          | no es una base mutable ni almacena contenido sensible por conveniencia |
| Evidence               | Prueba verificable de resultados o acciones                                        | outcome, digests, attestations y observaciones                                | artefacto de evidencia asociado a plan/run/step             | no inventa estados ni reemplaza el historial                           |
| Trace                  | Proyección correlacionada de Audit, Evidence y provenance                          | IDs y eventos ya persistidos                                                  | vista objetivo→resultado y, en el futuro, export sanitizado | no crea una segunda autoridad de ejecución                             |
| Runtime                | Estado y transiciones de ejecución autorizada                                      | plan íntegro, policy, approvals, dispatchers y persistence                    | attempts, outcomes, estados remotos y evidence              | no selecciona estrategia ni declara capabilities                       |
| Workflow durable state | Representación revisionada del lifecycle autoritativo de Runtime                   | run/plan/steps, referencias, transiciones y budgets                           | estado recuperable y bloqueo explícito tras restart         | no es snapshot, provider recovery, Audit, Evidence ni output store     |
| Effect Assessment      | Evaluación efectiva versionada de severidad y compensación producida por Planner   | kind, risk/destructive, destino, declaración y policy metadata                | severity, compensation, versión y digest                    | no permite que Runtime, Policy o adapters reclasifiquen por separado   |
| Capability Registry    | Estado normalizado de capabilities observadas                                      | publicaciones versionadas, health y disponibilidad                            | inventario que consumen Strategy y Planner                  | no ejecuta, autentica ni concede confianza implícita                   |
| Agent Profile Catalog  | Configuración declarativa versionada de responsabilidades y límites                | perfiles locales y referencias a capabilities del Registry                    | ID/revisión/digest seleccionados para el plan               | no concede capabilities, Policy, Approval ni identidad de provider     |
| Provider Gateway       | Frontera existente formada por `ProviderAdapter`, `AdapterHost` y dispatcher       | request preparado, manifest, aprobación y budget                              | eventos/resultados normalizados y provenance                | no existe un segundo camino directo Runtime→provider                   |
| Execution Gateway      | Frontera normalizada hacia backends de ejecución                                   | acción autorizada, effect assessment, Policy, Approval y backend              | preparación, resultado, límites y provenance                | no reemplaza Runtime, Policy, Approval, Registry ni supervisor         |
| Tool Gateway           | Adaptación futura de tools/resources/prompts a capabilities                        | protocolos de tools y configuración allowlisted                               | descriptors y resultados normalizados                       | no implementa supervisor, sandbox o autoridad propios                  |
| Workflow Snapshot      | Manifest inmutable de un punto confirmado de orquestación                          | referencias versionadas a run/plan/budget/Memory/Context/Audit/Evidence       | punto de resume validable con identidad y digest            | no copia fuentes de verdad ni representa estado remoto incierto        |

## Reglas de composición

1. Project Context referencia Memory, Registry, Audit/Evidence y fuentes; no las
   copia como nueva verdad mutable.
2. Project Intelligence es cache derivada. Debe poder invalidarse y
   reconstruirse sin pérdida de hechos autoritativos.
3. Trace se calcula a partir de IDs y eventos existentes. OpenTelemetry será un
   exporter opt-in, nunca el almacenamiento primario.
4. Tool Gateway reutiliza Execution Gateway para lifecycle de procesos y Runtime
   para efectos. MCP no puede crear una vía paralela.
5. Discovery publica observaciones en Capability Registry; Strategy y Planner no
   consultan detectores externos directamente.
6. Browser/web automation y A2A, si se aprueban, entran como gateways o
   capabilities externas y permanecen fuera del Orchestration Core.
7. `ProviderRecoveryCheckpoint` pertenece al recovery de provider. Un futuro
   `WorkflowExecutionSnapshot` pertenece al estado confirmado de orquestación;
   son conceptos incompatibles e intercambiarlos es un error de contrato.
8. Planner produce una única evaluación efectiva de efectos. Policy, Approval,
   Runtime, Recovery y Audit la consumen o revalidan contra el plan; no crean
   una clasificación alternativa.
9. Un workflow snapshot referencia fuentes autoritativas. Si una referencia
   expira, el snapshot queda degradado/no reanudable en vez de copiar contenido
   o extender retención.

## Estado de implementación

Project Context está implementado desde P3-A1 como manifest v1 de referencias,
digests y límites. Execution Gateway está implementado desde P3-D0 como frontera
v1 sobre el supervisor local existente; no es un sandbox ni una segunda máquina
de estados. Durable workflow state está implementado desde P3-E1 como
representación SQLite del lifecycle de Runtime; no convierte ese estado mutable
en `WorkflowExecutionSnapshot`. P3-B1 añade un catálogo estático versionado de
perfiles, no una segunda fuente de capabilities: las referencias de plan y
workflow durable identifican la configuración usada, pero Registry, Policy y
Approval conservan su autoridad. Esta definición no afirma que Project
Intelligence, Tool Gateway, Workflow Snapshot o Trace estén implementados. El
estado verificable permanece en `IMPLEMENTATION_STATUS.md` y el orden en
`ROADMAP.md`.
