# P3-D0 — informe de Execution Gateway Contract

Fecha: 2026-09-22  
Estado: `DONE`

## Resumen ejecutivo

P3-D0 introduce una frontera de ejecución v1 pequeña y explícita. El gateway
valida una operación ya planificada y autorizada, selecciona un backend por
identidad/version/capabilities y delega la ejecución. No decide Strategy, no
construye planes, no concede permisos, no registra approvals, no persiste estado
de Runtime y no supervisa procesos por sí mismo.

El único backend es `trivergence.local-supervised`. Reutiliza la instancia de
`ProcessSupervisor` que recibe `ProcessStepDispatcher`; por tanto no duplica
spawn, timeout, AbortSignal, `taskkill /T`, límites de salida ni confirmación
del árbol. Reference Provider y Provider Gateway no fueron modificados.

## Auditoría previa y solapamientos evitados

| Primitive existente  | Ownership conservado                               | Decisión P3-D0                                       |
| -------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `RuntimeEngine`      | lifecycle global, orden, evidence y estado del run | el gateway solo prepara/normaliza una operación      |
| `ProcessSupervisor`  | validación concreta, spawn, timeout/cancel y árbol | se inyecta la misma instancia en el backend local    |
| `DispatcherRegistry` | resolución capability/subsystem y descriptor       | `ProcessStepDispatcher` sigue siendo su adapter      |
| Policy Engine        | decisión allow/deny/approval                       | el gateway consume decisión y digest; no reevalúa    |
| Approval persistence | emisión, grant, expiración y consumo único         | Runtime consume; gateway valida el binding consumido |
| Capability Registry  | verdad de capabilities del producto                | manifest de backend solo declara aptitud técnica     |
| Audit/Evidence       | hechos y prueba terminal                           | Runtime conserva escritura y correlación             |
| Provider Gateway     | ejecución de providers                             | permanece como `ProviderAdapter` + host + dispatcher |
| Project Context      | contexto operativo versionado                      | solo se transportan ID, revisión, digest y bindings  |

`GitReadClient` continúa como primitive especializada y endurecida de lectura de
workspace. Migrarla no era necesaria para definir el contrato y habría ampliado
el alcance; cualquier convergencia futura deberá preservar sus garantías
específicas.

## Contratos implementados

- `ExecutionBackendManifest`: identidad/version, modo, capabilities, acceso a
  filesystem/red, supervisión, cancelación, timeout, persistencia, aislamiento,
  límites y provenance.
- `ExecutionRequest`: referencias de objetivo/run/plan/step/Project Context,
  digests de plan/Registry/descriptor/acción/Policy, approval consumida cuando
  aplica, requisitos, private mode y límites cuyo consumo pertenece a Runtime.
- `ExecutionPreparation`: attestación efímera de que request/backend/descriptor
  fueron validados; no es autorización ni estado de Runtime.
- `ExecutionGatewayLifecycle`: vocabulario normalizado. Runtime sigue siendo el
  owner de transiciones; el backend local solo entrega terminales verificables.
- `ExecutionResult`: terminal local, límites aplicados, confirmación del árbol y
  provenance correlacionada.

El request no contiene environment values ni una copia de Project Context. Los
argumentos permanecen en la operación efímera ya cubierta por el descriptor y se
comparan inmediatamente antes de ejecutar.

## Backend local supervisado

El manifest declara `mode=local_supervised`, `isolation.level=none` y
`sandboxed=false`. `cwd`, executable y nombres/valores de environment se validan
con las allowlists del supervisor. El proceso child no está confinado por el SO
y el destino efectivo de red no se filtra. P3-D0 hace estas limitaciones
observables; no las disfraza como sandbox.

El gateway rechaza antes de spawn:

- backend/version/capability ausente o manifest inválido;
- Policy deny o approval requerida ausente/no coincidente;
- Project Context, workspace, plan, descriptor o digest inconsistentes;
- evaluación de efecto no proveniente del paso planificado;
- red no autorizada o red en private mode;
- confinement de filesystem que este backend no puede garantizar;
- límites incompatibles y operación distinta del descriptor;
- request/result adulterado o schema inválido.

## Effect Assessment

ADR-0014 continúa pendiente de implementación integral. P3-D0 no reclasifica.
Consume el `effectClass` que Planner fijó en `step.action` y lo liga a la acción
mediante `planned-action-v1` + digest. Este puente es explícito y no permite al
gateway reducir severity; será reemplazado por `EffectiveEffectAssessment`
versionado cuando ADR-0014 se implemente.

## Policy, Approval, privacidad y provenance

Runtime revalida Policy, consume la approval de un uso y entrega al dispatcher
un snapshot inmutable. El gateway verifica Policy digest, plan/descriptor,
ruleset y action digest cubierto por approval. Una mutación material deja de
coincidir antes del spawn.

El gateway no tiene store ni logs propios. Private mode mantiene la prohibición
de red y no amplía retención. El resultado conserva request digest, descriptor
digest y build digest del backend; Audit/Evidence continúan en Runtime.

## Tests

Se añadieron 27 pruebas del gateway: preparación sin dispatch, ejecución real,
backend/capability inexistentes, separación capability/permiso, Policy deny,
approval ausente/adulterada, bindings de Context/workspace, red/private mode,
filesystem incompatible, timeout, cancelación, árbol no confirmado, provenance,
budgets, minimización del request, manifest/result inválidos, duplicados,
descriptor/spec, effect assessment, tampering, capability requerida omitida,
approval inesperada y reutilización de la misma instancia del runner.

La suite existente verifica además Runtime, approvals, Reference Provider,
Electron y terminación Windows. Total final: **192/192 tests**.

## Seguridad y riesgo residual

El threat model general incorpora backend/capability spoofing, approval replay,
digest mismatch, escalada filesystem/red, result/provenance spoofing y cruce de
workspace. Siguen siendo riesgos explícitos:

- no existe aislamiento de filesystem para el child;
- no existe enforcement del destino efectivo de red;
- un executable permitido puede ser sustituido fuera de las garantías actuales;
- `treeTerminationConfirmed=false` es posible y produce `orphaned`;
- la clasificación conservadora completa de ADR-0014 sigue pendiente.

## Gates y evidencia

| Gate                                               | Resultado              |
| -------------------------------------------------- | ---------------------- |
| format                                             | PASS                   |
| lint                                               | PASS                   |
| typecheck fresco                                   | PASS                   |
| build fresco                                       | PASS                   |
| tests                                              | PASS — 192/192         |
| Electron E2E                                       | PASS                   |
| Electron smoke                                     | PASS                   |
| security/audit                                     | PASS                   |
| SBOM                                               | PASS — 451 componentes |
| relative links                                     | PASS                   |
| whitespace                                         | PASS                   |
| secret scan                                        | PASS                   |
| scope verification                                 | PASS                   |
| Windows process-tree termination fuera del sandbox | PASS                   |

## Alcance y estado

No se implementaron MCP, A2A, Durable Workflows, snapshots, ADR-0012/0013/0014
completo/0015, sandbox, containers, VM, ejecución remota, browser, providers ni
M7. Ningún provider externo fue habilitado. M5 y M7 siguen `PARTIAL`.

## Siguiente paso mínimo

Detenerse. En una tarea independiente, iniciar P3-E1 usando el contrato aceptado
de `WorkflowExecutionSnapshot` sin convertir el gateway en owner de durable
state ni reutilizar provider checkpoints como estado confirmado.
