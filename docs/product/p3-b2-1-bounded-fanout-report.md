# Informe P3-B2.1 — bounded fan-out/fan-in + context slicing

Fecha: 2026-09-25  
Resultado: `DONE`  
P3-B2 general: `PARTIAL`; P3-B2.2: `PLANNED`

## Resumen ejecutivo

P3-B2.1 incorpora al `RuntimeEngine` la capacidad de ejecutar un `BranchGroup`
confirmado con cantidad y concurrencia separadas, estado durable por rama,
cancelación granular, budget jerárquico y fan-in verificable. La implementación
reutiliza dispatchers, Provider Gateway, Execution Gateway, Policy/Approval,
durable workflows, Audit y Evidence existentes; no crea otro Runtime ni habilita
providers.

`ContextSliceBuilder` deriva manifests v1 acotados desde un Project Context
exacto. Los slices contienen referencias, nunca contenido fuente ni permisos.
Cada rama queda ligada por digest a su slice, workspace, objective, perfil,
capability, policy, plan y descriptor de ejecución.

Strategy Deliberation no se implementó. No existen todavía proposal, critique,
evaluation deliberativa, synthesis, voting, debate, judge ni selección
multi-modelo.

## Arquitectura implementada

```text
Confirmed plan + BranchGroup + ContextSliceManifest[]
  → Runtime validation (plan/context/profile/capability/policy/budget/effect)
  → deterministic bounded workers (branchId order, maxConcurrency)
  → existing dispatcher → Provider Gateway | Execution Gateway | subsystem
  → Evidence + durable branch transition
  → deterministic FanInResult by exact branch/evidence references
  → verified dependent plan steps
```

Ownership permanece:

- Planner describe ramas y dependencias; no ejecuta.
- Runtime es el único owner de scheduling/lifecycle.
- Persistence materializa estado durable; no decide transiciones.
- Policy/Approval conserva authority; capability nunca equivale a permiso.
- Project Context es la fuente; el slice es derivado.
- Agent Profile Catalog conserva identidad; no se resuelve `latest`.
- Provider/Execution Gateways siguen siendo las únicas fronteras de dispatch.
- Audit/Evidence conservan hechos y prueba; fan-in solo los referencia.

## Contratos v1

- `BranchGroup`: plan/context binding, cardinalidad, concurrencia, depth uno,
  policy de fan-in, budget agregado, ramas y digest.
- `BranchDescriptor`: branch/step/parent, dependencias, perfil exacto, contexto,
  slice, capabilities, budget, policy/approval binding, target abstracto,
  contrato de resultado y provenance.
- `ContextSliceManifest`: contexto/workspace/objective/group/branch/fase,
  referencias de fuentes/capabilities/upstream Evidence, expiración, provenance
  y digest.
- `BranchExecutionState`: lifecycle, revisión, dispatch, consumo, Evidence y
  terminal reason.
- `FanInResult`: outcome explícito y lista ordenada de referencias por rama.

Los contratos no contienen provider/model IDs y no conceden autoridad.

## Fan-out y concurrencia

Runtime ordena ramas elegibles por `branchId` y las consume con un pool fijo de
workers. `maxConcurrency` es independiente del total de ramas; no se usa un
`Promise.all` ilimitado. IDs de branch/dispatch son estables. La reserva durable
ocurre antes del dispatch y una rama no puede entrar dos veces.

La primera versión acepta únicamente operaciones cuya clasificación efectiva y
naturaleza sean `PURE`/`READ_ONLY` y lectura intrínseca. `SIDE_EFFECTFUL`,
`IRREVERSIBLE`, declaraciones que rebajan riesgo y nested fan-out fallan
cerrado. Profundidad máxima: uno.

## Fan-in y degradación

Fan-in no concatena outputs. Ordena y referencia lifecycles, Evidence y output
digests. Sus outcomes son `confirmed`, `degraded`, `blocked`, `failed`,
`cancelled` o `budget_exhausted`.

- todas succeeded → `confirmed`;
- partial permitido y umbral satisfecho → `degraded`, visible y nunca reportado
  como run exitoso;
- UNKNOWN relevante → `blocked`;
- cancelación o fallo insuficiente → terminal explícito.

Solo un fan-in confirmado habilita los steps dependientes. Esos steps reciben
los outputs efímeros de dependencias declaradas, no resultados laterales.

## Context slicing

El builder ordena referencias, calcula canonical JSON + SHA-256, limita el
manifest a 12 KiB y lo congela. La verificación falla ante digest, revisión,
workspace, objective, group, branch, expiración, fuente o capability
incompatibles. Dos ramas no comparten slice implícitamente. Una rama no dispone
de API para ampliar su slice; una futura ampliación debe producir un nuevo
artefacto gobernado.

## Persistencia y migration

Migration: `0011_bounded_branch_execution`.

- `context_slice_manifests`: manifests inmutables, expirables y referenciales;
- `branch_groups`: límites, consumo, cancel request, lifecycle y fan-in;
- `branch_executions`: step/slice/approval/dispatch/Evidence y consumo por rama.

`durable_workflow_steps` continúa siendo el estado durable autoritativo de cada
step. Las tablas nuevas no copian Project Context, Memory, perfiles, Evidence u
outputs. Exportación, retención y purge incluyen las nuevas filas respetando
foreign keys.

## Budgets

La jerarquía es `run → group → branch`. Antes del dispatch se verifica:

```text
branch allocation ≤ group allocation ≤ Project Context run limit
sum(branch allocations) ≤ group allocation
```

Reserva y consumo durable se serializan con `BEGIN IMMEDIATE`; provider calls y
output bytes son monotónicos y restart/cancel no devuelven saldo. Tokens y coste
solo podrán contabilizarse cuando un dispatcher entregue medición confiable; no
se inventan.

## Cancelación y recovery

`cancelBranch` y `cancelBranchGroup` son idempotentes para el estado durable.
Cancelar un grupo impide nuevos dispatches, marca no iniciadas honestamente y
propaga `AbortSignal` a activas. `cancel_requested` no es terminal. Si el
dispatcher/provider no confirma el terminal, la rama pasa a `unknown`.

Tras crash/restart:

- terminal confirmado permanece terminal;
- nunca despachada conserva elegibilidad durable;
- `running`/`cancel_requested` pasa a `unknown`;
- el grupo y workflow quedan bloqueados;
- no se regeneran IDs, approvals o budget;
- no existe retry automático.

## Policy, Approval y Agent Profiles

Cada branch revalida Policy, descriptor, capability y perfiles exactos. El
binding de acción debe coincidir con el digest actual. Una approval solo se
consume si su plan/step/action/ruleset/descriptor cubre esa rama; nunca se copia
desde parent o sibling. P3-B1 conserva `profileId/revision/digest`; Runtime no
sustituye perfiles para ocupar slots.

## Private mode

Private mode solo admite fan-out efímero con capacidades locales sin red. No
crea durable workflow, context slices ni branch state; tampoco amplía logs o
retención. Esta elección renuncia honestamente al resume durable.

## Seguridad

Las mitigaciones implementadas cubren branch/slice/profile/backend substitution,
cross-workspace/cross-objective leakage, stale refs, capability y policy
spoofing, approval replay, double dispatch, lost updates, budget races, fan-in
prematuro, cancel race, restart race, recursive delegation y efectos no seguros.
UNKNOWN nunca se convierte en success/failure.

Riesgos residuales: compromiso total del proceso/SQLite, dispatcher que ignora
cancelación, terminación remota no consultable y métricas de token/coste no
atestiguadas. Se exponen o fallan cerrado; no se ocultan.

## Pruebas

Se añadieron 50 pruebas:

- 15 de construcción/verificación de slices;
- 35 de Runtime integrado: 2/N ramas, límites 1/2, orden, no double dispatch,
  fan-in confirmado/degradado/fallido/bloqueado, timeout, cancelación por rama y
  grupo, sustituciones, budgets, private mode, continuación dependiente y
  close/reopen SQLite con UNKNOWN.

Total del repositorio: 290 tests. Regresiones de P3-A1, P3-D0, P3-E1, P3-B1,
Reference Provider, workflow secuencial, Policy/Approval y private mode forman
parte del barrido completo.

## Gates

- format: `PASS`;
- lint: `PASS`;
- typecheck: `PASS`;
- build: `PASS`;
- tests: `PASS`, 290/290 fuera del sandbox Windows;
- Electron E2E: `PASS`;
- Electron smoke: `PASS`;
- security: `PASS`;
- SBOM: `PASS`;
- relative links: `PASS`;
- whitespace: `PASS`;
- secret scan: `PASS`;
- scope: `PASS`.

Dentro del sandbox, el test de ProcessSupervisor conserva honestamente
`treeTerminationConfirmed=false` porque `taskkill /T` no puede atestiguar el
árbol. El mismo gate se repitió fuera del sandbox sin modificar Runtime.
Electron E2E tampoco pudo iniciar su proceso gráfico dentro del sandbox
(`launch-failed` del proceso GPU); la misma prueba pasó fuera del sandbox, al
igual que Electron smoke. Seguridad requirió acceso de red al registro oficial y
pasó sin vulnerabilidades conocidas.

## Estado y deuda restante

- Reference Provider continúa siendo el único provider ejecutable.
- M5 y M7 permanecen `PARTIAL`.
- P3-B2 general permanece `PARTIAL`.
- ADR-0012/0013/0014/0015 no se implementaron incidentalmente más allá de la
  compatibilidad requerida por durable branch state.
- B2.2 debe materializar Strategy Deliberation sobre este substrate, sin reabrir
  sus garantías.
- No hay UI nueva, provider externo, MCP, A2A, Project Intelligence, Trace,
  OpenTelemetry, browser automation ni branching de snapshots.

## Siguiente paso mínimo

P3-B2.2: implementar exclusivamente el protocolo deliberativo aceptado en
ADR-0016 usando `BranchGroup` y `ContextSliceManifest`, manteniendo Reference
Provider como único ejecutable y sin confundir varias ramas locales con
diversidad multi-IA real.
