# Orchestration Engine

Estado: núcleo P0 implementado; verificación final en
`IMPLEMENTATION_STATUS.md`  
Fecha: 2026-09-12

## Responsabilidad

El Orchestration Engine transforma una intención validada en un plan explicable
y evaluado. Coordina subsistemas; no contiene un modelo de IA, no presenta un
IDE y no produce efectos por sí mismo.

```text
OrchestrationRequest
       │
       ▼
 Strategy Engine ──► StrategyDecision
       │
       ▼
Execution Planner ◄── Capability Registry snapshot
       │                    │
       │                    └── runtime · agent · provider · memory
       │                        workflow · workspace · tool
       ▼
 ExecutionPlan ──► Policy Engine por paso
       │
       ▼
Evaluation Engine ──► ready | approval_required | blocked
```

## Contratos de los componentes

### Strategy Engine

Entrada: objetivo, perfil, privacidad y snapshot del Registry. Cada capability
puede publicar `routing.objectiveTerms` y prioridad. Strategy v2 genera una ruta
candidata por capability enrutables, calcula coincidencias deterministas,
expande sus dependencias, descarta rutas no disponibles o incompatibles con
privacidad y ordena por puntuación e ID como desempate. Devuelve todas las
candidatas con motivo y la ruta seleccionada. Una solicitud explícita de
capacidades conserva compatibilidad con planes anteriores, pero la UI nueva
parte del objetivo. `direct`, `sequential` y `unavailable` están implementados;
`parallel` sigue reservado.

La coincidencia de términos es una heurística transparente, no interpretación
semántica por IA. Una intención ambigua o sin coincidencias queda `unavailable`;
el usuario revisa las rutas antes de ejecutar. Strategy no inspecciona archivos
ni consulta proveedores. Una capacidad ausente, deshabilitada o no disponible no
se sustituye silenciosamente.

### Execution Planner

Expande dependencias mediante un recorrido topológico acotado. Cada paso
referencia una capacidad, el subsistema responsable, dependencias de pasos, una
acción normalizada y su decisión de política. Duplicados se consolidan; ciclos,
dependencias faltantes o límites superados se expresan como issues bloqueantes.

El Planner acepta un generador de identificadores inyectado. Esto mantiene el
algoritmo testeable y evita acoplar el núcleo a Node o Electron.

### Capability Registry

Es un snapshot inmutable con versión explícita. Un descriptor declara:

- ID, versión y nombre legible;
- subsistema propietario;
- estado `available`, `degraded`, `unavailable` o `disabled`;
- modalidad `structured`, `interactive` o `external`;
- plantilla de acción y dependencias.

El Registry describe lo que existe; no autoriza. M2 usa snapshots de bootstrap.
El registro dinámico, la provenance firmada y el health refresh pertenecen a
fases posteriores.

### Evaluation Engine

Evalúa condiciones explícitas y entrega checks con evidencia legible:

- estrategia resoluble;
- plan sin issues y con al menos un paso;
- ningún paso denegado;
- aprobación requerida cuando al menos un paso lo indica.

La fase `preflight` no ejecuta: `blocked` prevalece sobre `approval_required`,
que prevalece sobre `ready`. La fase `postflight` acepta únicamente un run
completado con evidencia para todos los pasos, outcomes exitosos y correlación
de request, plan, snapshot y digest. Ambas fases tienen contratos versionados;
una aprobación no equivale a éxito posterior.

## API del núcleo

`preview(request)` produce request validado, identidad del snapshot, estrategia,
plan, evaluación preflight e integridad. `evaluateOutcome` evalúa el run y su
evidencia después del Runtime. No existe `execute()` en este paquete.

El Runtime recibe el artefacto canónico, revalida snapshot y digest y despacha
los pasos autorizados. Strategy, Planner y Evaluation no importan adaptadores
concretos.

## Integridad del artefacto

El artefacto autorizado contiene request, snapshot del Registry, strategy, plan
—incluidas las policies por paso— y evaluation. Se serializa mediante canonical
JSON versión `1` y se resume con SHA-256.

- las claves de objetos se ordenan;
- el orden de pasos y otras listas semánticas se conserva;
- capabilities, dependencies y action kinds del snapshot se normalizan;
- valores no JSON, ciclos y números no finitos se rechazan;
- el host inyecta SHA-256; el núcleo no importa Node ni Web Crypto;
- `registryVersion` permanece como alias compatible y debe coincidir con la
  versión del snapshot firmado.

`revalidate(preview)` comprueba por separado que el snapshot sigue vigente y que
el digest coincide. Una mutación de plan, policy, target, evaluación o Registry
falla cerrado y obliga a regenerar el preview.

Los contratos `ExecutionRun` y `StepEvidence` enlazan `requestId`, `planId`,
`registrySnapshotId`, `planDigest`, `runId`, `stepId`, capability/version,
resultado y timestamp; Runtime y Persistence los implementan.

## Límites y errores

- intención: 2.000 caracteres;
- capacidades explícitas: 0–64, sin duplicados; cero activa selección por
  objetivo;
- registry: 1–1.000 entradas;
- dependencias por capacidad: hasta 32;
- plan: hasta 256 pasos;
- IDs de capacidades con namespace estable y sin rutas/comandos.

Los payloads cruzan Zod en IPC y en la fachada. Los errores de configuración del
Registry fallan al iniciar; los problemas propios de una solicitud producen un
plan/evaluación bloqueados y explicables.

## Límites pendientes

La selección v2 compara metadatos declarativos, no entiende semánticamente el
objetivo ni garantiza la mejor ruta. Paralelismo, resolución de ambigüedad más
rica y replanning general requieren contratos y threat review propios. Los
proveedores externos continúan bloqueados por M5.
