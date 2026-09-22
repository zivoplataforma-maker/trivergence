# Auditoría de coherencia del Prompt Maestro v2

Fecha de auditoría: 2026-09-22  
Base verificada: `ba69a26293aead9efaa2f06069a02e0be7d0f67c`  
Alcance: documentación gobernante, arquitectura, código, pruebas, Git y CI.  
Resultado global: **CONSISTENT_WITH_CORRECTIONS**.

Esta auditoría es deliberadamente descriptiva. No implementa P3, no modifica
contratos, no habilita proveedores y no corrige los documentos gobernantes.

## 1. Executive summary

La visión central es coherente con el producto real: Trivergence es un sistema
de orquestación provider-agnostic cuyo núcleo está compuesto por Strategy,
Planning, Capability Registry y Evaluation; Runtime, providers, agentes,
workflows, memoria y herramientas son subsistemas coordinados. El camino de
ejecución de providers pasa por `ProviderAdapter` y `AdapterHost`, y el único
provider ejecutable sigue siendo Reference Provider.

M5-B0 está implementado internamente. El repositorio representa incertidumbre
remota, persiste el límite de dispatch y evita convertir `UNKNOWN` en éxito o
fallo. La evidencia declarada de 149 tests, commit y CI Windows fue verificada.

No obstante, la documentación v2 mezcla estado actual con arquitectura objetivo
en selección de provider y varias capacidades P3. También existen cuatro
desajustes técnicos que deben resolverse antes de ampliar recovery: la regla de
`AdapterHost` para adapters con capabilities parciales, el checkpoint todavía
orientado al stream de Reference Provider, la responsabilidad real de la prueba
de interrupción en la conformance suite y la posibilidad de subclasificar el
efecto de una acción mediante una declaración explícita no conservadora.

Se contabilizan **9 contradicciones o desajustes** y se recomiendan **12
correcciones documentales**. No justifican iniciar P3 ni alterar M5/M7. El paso
mínimo siguiente debe ser una corrección exclusivamente documental, seguida de
un ADR acotado para los cuatro puntos de contrato que no pueden resolverse solo
con redacción.

## 2. Estado real verificado

### Hitos y providers

| Afirmación          | Resultado                                           | Evidencia                                                                  |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| P0, P1 y P2         | `DONE` documentado y compatible con el repositorio  | Estado, roadmap, paquetes y gates actuales                                 |
| M5                  | `PARTIAL`                                           | Ningún provider externo supera todos sus gates ni está habilitado          |
| M7                  | `PARTIAL`                                           | Existen hardening, smoke y SBOM; no hay evidencia suficiente para cerrarlo |
| Provider ejecutable | Solo Reference Provider                             | Registro de desktop y `AdapterHost`; provider local obligatorio para M6    |
| Providers externos  | No ejecutables                                      | Catálogo informativo; no hay adapters productivos registrados              |
| Trust store externo | Vacío                                               | `externalProviderTrustStore` no contiene entradas                          |
| API keys en UI      | Ausentes                                            | La configuración visible no contiene campos de claves de provider          |
| Funciones P3        | No iniciadas, salvo precursores identificados en §4 | Inspección de contratos, Runtime, UI, agents, workflows y persistence      |

### Verificación específica de M5-B0

| Invariante              | Resultado                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5-B0 interno           | `DONE`                                                                                                                                                   |
| Capabilities            | Existen exactamente `local_checkpoint`, `stream_reconnect`, `operation_query`, `operation_resume`, `idempotent_retry`, `remote_cancel`, `exact_recovery` |
| Lista vacía             | Válida                                                                                                                                                   |
| `recover`               | Opcional en `ProviderAdapter`                                                                                                                            |
| Retry automático        | Ninguna capability lo autoriza; Runtime no lo realiza                                                                                                    |
| Estado incierto         | Existe `remote_state_unknown` en contratos, persistencia, Runtime y UI                                                                                   |
| Persistencia previa     | El attempt se crea antes del dispatch y pasa a `dispatching` inmediatamente antes de invocar el dispatcher                                               |
| Evidencia durable       | Se conservan request/context digest, identidad del adapter, provenance, budget, effect class, capabilities y remote state                                |
| Honestidad de `UNKNOWN` | No se fabrica `StepEvidence` terminal ni se convierte en success/failure                                                                                 |
| Dependencias            | El workflow se detiene y la ejecución queda huérfana/pendiente de resolución                                                                             |
| Checkpoint              | No se consume ante estado remoto desconocido                                                                                                             |
| Resolución humana       | Requiere actor y genera auditoría `provider.remote_state_resolved`                                                                                       |
| Conformance             | Siguen definidos exactamente 14 checks                                                                                                                   |

La taxonomía y los invariantes están alineados con
[ADR-0011](../architecture/adr/0011-recovery-semantics.md), con las salvedades
de contrato descritas en §5.

### Evidencia Git y CI

- `HEAD` y `origin/main` apuntan al commit
  `ba69a26293aead9efaa2f06069a02e0be7d0f67c`.
- La ejecución Windows `35608108255` corresponde a ese SHA y terminó
  `completed/success` el 2026-09-21.
- URL verificada:
  <https://github.com/zivoplataforma-maker/trivergence/actions/runs/35608108255>.
- El árbol no estaba limpio al comenzar porque las tres nuevas versiones de
  `TRIVERGENCE_PROMPT_MAESTRO_CODEX.md`, `IMPLEMENTATION_STATUS.md` y
  `ROADMAP.md` aún no forman parte del commit base. Esta condición es esperada
  por el encargo y no se alteró.

## 3. Matriz CURRENT vs código

| Área declarada                       | Código real                                                                                                            | Evaluación                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Orchestration Core                   | Strategy compara rutas; Planner construye pasos; Registry publica capabilities; Evaluation separa preflight/postflight | `IMPLEMENTED`                                                            |
| Runtime, Policy, Approval y Evidence | Runtime, policy profiles, approvals, evidencia, audit y persistencia existen y están probados                          | `IMPLEMENTED`                                                            |
| Provider Gateway                     | `ProviderAdapter` + `AdapterHost` + dispatcher forman una frontera única                                               | `IMPLEMENTED`, con desajustes C-02/C-03                                  |
| Recovery semantics                   | Capabilities, attempts, remote state, resolución humana y UI existen                                                   | `IMPLEMENTED`, con desajustes C-02/C-03/C-04/C-08                        |
| Workflows, agentes y memoria         | Flujo M6 completo con roles fijos, workflow secuencial, memoria con retención y evaluación                             | `IMPLEMENTED` en alcance M6; no equivale a perfiles dinámicos ni fan-out |
| Private mode                         | Bloquea red, aplica retención/borrado/exportación y hace visible recuperación                                          | `IMPLEMENTED` en alcance actual                                          |
| Historial, auditoría y provenance    | Consultables y persistentes; IDs y digests enlazan ejecución                                                           | `IMPLEMENTED`, sin modelo unificado de Trace P3                          |
| Selección integral de provider       | Strategy no pondera autenticación, gate, latency, recovery, provenance ni preferencia de provider                      | `PARTIALLY_IMPLEMENTED`; la lista completa es objetivo, no estado actual |
| Memory/Knowledge Graph               | Memoria M6 existe; knowledge graph de producto no existe                                                               | `PARTIALLY_IMPLEMENTED` + `PLANNED_ONLY`                                 |

La documentación no debe usar `CURRENT/CORE` para inferir que cada criterio
enumerado ya interviene en una decisión del Strategy Engine. En particular, la
preferencia guardada en configuración no modifica el routing actual.

## 4. Matriz de arquitectura P3

| Componente                             | Clasificación            | Estado observado y límite                                                                                                    |
| -------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Orchestration Core                     | `IMPLEMENTED`            | Es el núcleo actual; P3 debe extenderlo sin desplazarlo                                                                      |
| Provider Gateway                       | `IMPLEMENTED`            | Nombre paraguas de la frontera existente; recrearlo sería `REDUNDANT`                                                        |
| Project Context                        | `PARTIALLY_IMPLEMENTED`  | Hay request, workspace session, privacidad, budgets, memoria e historial; falta un contrato versionado y auditable único     |
| Project Intelligence / Knowledge Layer | `PLANNED_ONLY`           | No hay índice incremental, context packs con citas ni detector de drift                                                      |
| Agent Profiles                         | `PARTIALLY_IMPLEMENTED`  | Hay roles fijos planner/critic/synthesizer; faltan perfiles declarativos y equipos configurables                             |
| fan-out/fan-in                         | `PLANNED_ONLY`           | `AgentTeam` ejecuta roles secuencialmente                                                                                    |
| Tool Gateway MCP                       | `PLANNED_ONLY`           | No existe gateway MCP de producto                                                                                            |
| Agent Gateway A2A                      | `PLANNED_ONLY`           | No existe gateway A2A de producto                                                                                            |
| Execution/Sandbox Gateway              | `PARTIALLY_IMPLEMENTED`  | Process supervisor y dispatcher aportan base; falta backend pluggable con selección por política                             |
| Durable Workflow Runtime               | `PARTIALLY_IMPLEMENTED`  | Hay runs, attempts, evidence, persistencia y crash recovery; falta estado durable general para pausa, resume y ramas         |
| Trivergence Trace                      | `PARTIALLY_IMPLEMENTED`  | Audit, evidence, provenance e IDs existen; falta vista/modelo unificado                                                      |
| OpenTelemetry export                   | `PLANNED_ONLY`           | No debe entrar en el core; sería un export adapter                                                                           |
| Memory evolution                       | `PARTIALLY_IMPLEMENTED`  | TTL, budgets, purge, private mode y provenance existen; faltan tiers y modelos de hechos/decisiones/eventos                  |
| knowledge graph                        | `PLANNED_ONLY`           | `graphify-out` es tooling de desarrollo, no una capability del producto                                                      |
| browser/web automation                 | `PLANNED_ONLY`           | Debe modelarse como tools/capabilities fuera del core                                                                        |
| Capability Discovery                   | `PARTIALLY_IMPLEMENTED`  | Registry estático y detecciones/configuración existen; falta descubrimiento dinámico normalizado                             |
| branching desde checkpoints            | `CONFLICT` + `NEEDS_ADR` | “Checkpoint” es ambiguo frente al checkpoint de recovery del provider; necesita un snapshot de workflow distinto e inmutable |

## 5. Conflictos encontrados

### C-01 — Selección de provider presentada como capacidad actual

El Prompt Maestro dice que la selección debe considerar instalación,
autenticación, gate, límites, latencia, recovery, provenance y preferencia del
usuario. El `StrategyEngine` actual puntúa términos, prioridad, disponibilidad
de capability, dependencias y privacidad/red. La selección integral de provider
es objetivo futuro. Impacto: sobrestima `CURRENT/CORE` y puede inducir a creer
que una preferencia de UI decide ejecución.

### C-02 — Capability parcial obliga a implementar `recover`

ADR-0011 indica que el adapter implementa `recover` cuando una capability lo
justifica. `AdapterHost` rechaza cualquier lista no vacía si el adapter no tiene
`recover`. Esto acopla `remote_cancel` —y potencialmente una capability solo de
consulta— al método de recovery aunque su operación natural sea otra. El
contrato necesita una decisión explícita; no debe acomodarse a un proveedor.

### C-03 — Checkpoint general modelado como cursor de stream local

`ProviderRecoveryCheckpoint` exige `nextChunkIndex`, `emittedBytes` y
`recoveryCursor`. Es apropiado para Reference Provider, pero no representa de
forma neutral un operation ID, query, resume o idempotency key. La taxonomía es
provider-agnostic; el payload durable todavía no lo es completamente.

### C-04 — La conformance suite sobredeclara su prueba de frontera `UNKNOWN`

La suite exige una callback `verifyInterruptedRecoveryBoundary`, pero no crea ni
observa por sí misma el Runtime. El fixture sin recovery solo demuestra que el
callback fue llamado. Los tests de Runtime sí comprueban `UNKNOWN`, ausencia de
retry, resolución humana, provenance y budgets, por lo que la garantía del
repositorio existe; atribuirla enteramente a la suite reusable es impreciso.

### C-05 — Expedientes de providers conservan conclusiones de recovery previas

Los dossiers, resúmenes, matrices y threat models mantienen filas donde la falta
de exact recovery aparece como bloqueo universal, mientras sus addenda
posteriores adoptan ADR-0011. Las conclusiones contractuales y de autenticación
no cambian, pero la dimensión técnica/recovery tiene dos lecturas simultáneas.
La matriz comparativa, además, superó su fecha de renovación declarada.

### C-06 — Metadata informativa de provider no refleja la decisión vigente

El catálogo/manifests describe la interfaz Anthropic como “ant CLI” y exporta
`recommendedFirstProviderId = "codex"`. Los gates posteriores tratan Claude Code
inalterado como mejor vía Anthropic y no declaran ganador externo. Aunque esta
metadata no habilita ejecución, contradice la gobernanza actual.

### C-07 — “Branching desde checkpoints” usa un término incompatible

Prompt y roadmap dicen que los checkpoints pertenecen a la orquestación, pero el
contrato actual `ProviderRecoveryCheckpoint` pertenece a una ejecución de
provider. Una rama no puede partir de él sin confundir output confirmado con
estado remoto posiblemente incierto. Debe existir otro concepto, por ejemplo un
snapshot inmutable de workflow verificado, sujeto a ADR.

### C-08 — La clasificación explícita puede ser menos conservadora

`classifyOperationEffect` devuelve `effectClass` antes de comprobar riesgo
`destructive` o kind `delete`. Un descriptor podría declarar `pure` para una
acción destructiva. Policy conserva defensas independientes, pero el attempt y
la política de recovery registrarían una clasificación subestimada, contraria al
principio conservador de ADR-0011.

### C-09 — El orden P3 lineal no sigue las dependencias durables

El roadmap coloca fan-out/fan-in antes del estado durable de workflows y MCP
antes de formalizar el gateway de ejecución. Eso favorece ramas efímeras y
duplica lifecycle/isolation de procesos. Project Context e Intelligence también
están agrupados aunque el contrato de contexto es prerequisito y el índice
inteligente no lo es para todos los perfiles.

## 6. Duplicaciones arquitectónicas

| Riesgo de duplicación                 | Frontera recomendada                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Crear un nuevo Provider Gateway       | Tratar “Provider Gateway” como nombre de `ProviderAdapter` + `AdapterHost` + dispatcher                               |
| Crear otra fuente de Project Context  | Componer request, workspace, privacy, memory y persistence; el context pack es un snapshot derivado y versionado      |
| Confundir Intelligence con Memory     | El índice es cache derivada/reconstruible; Memory conserva conocimiento gobernado; Audit conserva hechos de ejecución |
| Nuevo motor de procesos dentro de MCP | Execution Gateway reutiliza ProcessSupervisor y policy; MCP solo adapta protocolo/capabilities                        |
| Scheduler dentro de `workflows`       | Runtime/persistence poseen estado y transiciones; workflows posee definiciones y semántica de dominio                 |
| Segundo almacén para Trace            | Trace es una proyección de audit/evidence/provenance, no una nueva autoridad                                          |
| Discovery fuera del Registry          | Detectores publican observaciones; Capability Registry normaliza el estado consumido por Strategy/Planner             |
| Acoplar MCP, A2A u OTel al core       | Mantenerlos como adapters/gateways/exporters reemplazables                                                            |
| Convertir web automation en Runtime   | Modelarla como tools/capabilities con policy, approvals y sandbox                                                     |

## 7. Riesgos

1. **Falsa capacidad actual.** Etiquetas `CURRENT/CORE` amplias pueden hacer que
   producto o UI prometan decisiones que Strategy aún no toma.
2. **Retry o resolución inseguros.** C-02, C-03 y C-08 pueden provocar futuras
   interpretaciones incompatibles si se añade un provider antes del ADR.
3. **Conformance aparente.** Un adapter podría “pasar” una callback provista por
   él sin demostrar la integración real con Runtime.
4. **Drift contractual.** Dossiers vencidos o con dos conclusiones de recovery
   dificultan saber cuál es la vigente; esto no autoriza ningún provider.
5. **Private mode erosionado.** Project Intelligence, MCP, A2A, OTel o browser
   automation podrían exfiltrar contexto si no heredan la política de destino y
   retención antes de recibir datos.
6. **Provenance fragmentada.** Context packs, índices, ramas y traces deben
   enlazarse a digests existentes; crear IDs paralelos rompería auditabilidad.
7. **Feature creep/IDE drift.** Un editor, file tree o terminal como centro de
   la experiencia desplazaría el modelo goal-first. Los archivos y procesos
   deben seguir siendo recursos coordinados, no convertir Trivergence en un IDE.
8. **Core protocol-bound.** Incorporar tipos MCP/A2A/OTel al dominio central
   dificultaría sustituirlos y violaría la independencia del orquestador.
9. **Paralelismo antes de durabilidad.** Una caída durante fan-out puede dejar
   branches sin estado verificable, duplicar budgets o perder provenance.

## 8. Dependencias reales

La cadena mínima derivada del código actual es:

1. Corregir la taxonomía documental y aprobar ADRs de contexto, recovery
   payload/conformance/effect classification y snapshot de workflow.
2. Definir un contrato mínimo de Project Context sobre fuentes existentes.
3. Definir el contrato de Execution Backend/Gateway sobre ProcessSupervisor y
   policy, antes de incorporar transportes de tools.
4. Hacer durable el estado general del workflow antes de ejecutar ramas en
   paralelo o reanudarlas.
5. Introducir Agent Profiles declarativos contra Project Context; su esquema
   puede avanzar en paralelo con el diseño durable, pero fan-out no.
6. Añadir MCP como adapter una vez estabilizadas capability, approval, budget,
   provenance y lifecycle de ejecución.
7. Añadir Project Intelligence como capa derivada después del contrato de
   contexto. No es requisito absoluto para el primer Agent Profile.
8. Proyectar Trivergence Trace sobre IDs y estados ya estables; OTel es el
   último exportador, no la fuente de verdad.

MCP, A2A, OTel, browser automation, knowledge graph y branching avanzado
permanecen fuera del core y requieren sus propios gates/ADRs/threat models.

## 9. Validación del orden P3

El orden propuesto `A → B → C → D → E → F` **no es técnicamente correcto como
secuencia estricta**.

- `P3-A` debe dividirse: el contrato mínimo de Project Context va primero;
  Project Intelligence puede evolucionar después y en paralelo.
- `P3-B` también debe dividirse: el esquema de Agent Profiles puede seguir al
  Context, pero fan-out/fan-in debe esperar a durable workflow state.
- `P3-D` debe definir el backend de ejecución antes de `P3-C`, para que MCP no
  cree su propio supervisor, sandbox o semántica de cancelación.
- La base de `P3-E` debe preceder al paralelismo de `P3-B`; pausa/resume y ramas
  necesitan transiciones persistentes y contabilidad durable.
- `P3-F` sigue al estabilizar IDs y transiciones. OTel permanece al final.

Orden recomendado para una futura decisión, sin iniciarlo ahora:

`P3-0 documentación/ADRs → A1 Context → D0 Execution contract → E1 durable state → B1 Profiles → B2 fan-out/fan-in → C MCP → A2 Intelligence → F Trace → OTel`.

`B1`, el diseño de `E1` y la investigación de `A2` pueden solaparse, pero no
deben producir ejecución paralela ni transportes externos antes de sus fronteras
estables.

## 10. Resultado de gates

| Gate fresco     | Resultado | Evidencia/observación                                                                                                                                    |
| --------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format          | **FAIL**  | Solo fallan los tres documentos gobernantes sustituidos: Prompt Maestro, Status y Roadmap. No se reformatearon porque esta ejecución prohíbe corregirlos |
| Lint            | PASS      | Todos los workspaces                                                                                                                                     |
| Typecheck       | PASS      | 12 proyectos                                                                                                                                             |
| Build           | PASS      | 12 proyectos                                                                                                                                             |
| Tests           | PASS      | 149/149 en Windows normal                                                                                                                                |
| Electron E2E    | PASS      | Workspace, Reference Provider, M6 y configuración; el rechazo Zod de `executionEnabled` hostil es esperado                                               |
| Desktop smoke   | PASS      | Arranque y flujo smoke                                                                                                                                   |
| Security        | PASS      | Sin vulnerabilidades conocidas; requirió red fuera del sandbox                                                                                           |
| SBOM            | PASS      | CycloneDX verificado, 451 componentes                                                                                                                    |
| CI Windows base | PASS      | Run `35608108255`, SHA `ba69a2…`                                                                                                                         |

La primera ejecución de tests dentro del sandbox produjo un falso negativo en la
confirmación de cierre del árbol de procesos. La repetición en el entorno
Windows normal pasó 149/149; el comportamiento coincide con la CI verde. El
primer intento de security falló solo por restricción de red y pasó al
ejecutarse con acceso normal.

El conjunto fresco **no está totalmente verde** porque format detecta las tres
nuevas versiones documentales. Esto es una regresión documental verificable, no
una regresión de código, y debe corregirse en la fase documental siguiente.

## 11. Correcciones documentales recomendadas

Se recomiendan **12 correcciones**, sin aplicarlas en esta auditoría:

1. Separar en el Prompt Maestro los criterios de provider ya implementados de
   los criterios `NEXT/PLANNED`.
2. Corregir y formatear los tres documentos gobernantes para recuperar el gate
   de format sin cambiar su intención.
3. Añadir a ADR-0011 una decisión sobre qué capabilities requieren realmente el
   método `recover` y cómo se expresa `remote_cancel`.
4. Abrir un ADR para un envelope de recovery versionado y discriminado, dejando
   el cursor/chunks como variante local, no como contrato universal.
5. Precisar que la garantía de interrupted recovery pertenece a la integración
   AdapterHost + Runtime y definir cómo la conformance suite la prueba sin una
   callback autoatestiguada.
6. Añadir al ADR de effect classification la regla de elevación conservadora:
   una declaración explícita no puede rebajar `destructive/delete/system`.
7. Consolidar la conclusión vigente de recovery en cada dossier y mover la
   evaluación pre-ADR a una sección histórica.
8. Renovar la matriz comparativa vencida sin volver a investigar contratos; la
   revisión solo debe incorporar evidencia ya aprobada y ADR-0011.
9. Alinear catálogo, manifests y arquitectura con los nombres vigentes y
   eliminar la recomendación codificada de un “primer provider” mientras no haya
   uno aprobado.
10. Definir “workflow snapshot” como concepto distinto de
    `ProviderRecoveryCheckpoint` antes de volver a mencionar branching.
11. Dividir P3-A, P3-B y P3-E en entregas con dependencias explícitas y reflejar
    el orden validado en §9.
12. Añadir una tabla única de ownership que mantenga Project Context,
    Intelligence, Memory, Audit, Trace, Runtime, Registry y gateways sin fuentes
    de verdad duplicadas.

## 12. Recomendación del siguiente paso mínimo

Ejecutar una fase **P3-0 exclusivamente documental**, sin iniciar P3 funcional:

1. aplicar las correcciones 1, 2, 7, 8, 9, 11 y 12;
2. redactar —sin implementar— los ADRs de las correcciones 3, 4, 5, 6 y 10;
3. volver a ejecutar format, links relativos, whitespace, secret scan y scope
   verification;
4. someter esos ADRs a aprobación antes de modificar contratos o Runtime.

Hasta esa aprobación deben permanecer sin cambios `ProviderAdapter`,
`AdapterHost`, Runtime, trust store, autenticación, providers externos y M7. M5
continúa **PARTIAL** y M7 continúa **PARTIAL**.
