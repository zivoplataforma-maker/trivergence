# Roadmap de Trivergence

Última revisión: 2026-09-22

El roadmap usa puertas de evidencia, no porcentajes subjetivos. Trivergence
evoluciona desde un núcleo de orquestación verificable hacia una capa
interoperable de providers, agentes, tools, conocimiento y ejecución. Ninguna
extensión futura debe retrasar artificialmente un gate independiente ni entrar
al core sin ADR, budgets, policy, threat model y aceptación proporcional al
riesgo.

## Estado resumido

| Hito                                   | Estado    |
| -------------------------------------- | --------- |
| M0 — especificación y riesgos          | `DONE`    |
| M1 — foundation segura                 | `DONE`    |
| M2 — kernel de orquestación            | `DONE`    |
| M3 — Runtime, aprobaciones y auditoría | `DONE`    |
| M4 — workspace/capacidades reales      | `DONE`    |
| M5 — primer conector estructurado      | `PARTIAL` |
| M6 — workflows, agentes y memoria      | `DONE`    |
| M7 — beta local/distribución Windows   | `PARTIAL` |
| P0 — auditoría transversal v1          | `DONE`    |
| P1 — hardening transversal             | `DONE`    |
| P2 — product hardening/preparación M5  | `DONE`    |
| M5-B0 — semántica de recovery          | `DONE`    |
| P3-0 — documentación y ADRs            | `DONE`    |
| P3-0.1 — revisión técnica de ADRs      | `DONE`    |
| P3-A1 — Project Context mínimo         | `DONE`    |
| P3 — evolución arquitectónica          | `PARTIAL` |

M5 y M7 son puertas independientes. P3 no autoriza a marcar ninguno de ellos
como completo.

## M5-B0 — semántica de recovery

Estado: `DONE` para el contrato interno. M5 continúa `PARTIAL`.

ADR-0011 separa provider execution recovery de orchestration recovery. El modelo
ya no exige exact recovery universal y representa incertidumbre distribuida de
forma explícita.

- primitives declarables: `local_checkpoint`, `stream_reconnect`,
  `operation_query`, `operation_resume`, `idempotent_retry`, `remote_cancel`,
  `exact_recovery`;
- lista vacía válida y `recover` opcional;
- attempt persistido antes del dispatch con digest, effect class, budget,
  provenance y estado remoto;
- pérdida de respuesta/stream/cancelación confirmable puede producir
  `remote_state_unknown`;
- UNKNOWN detiene dependencias incompatibles y no dispara retry automático;
- resolución humana explícita y auditada;
- checkpoints solo se consumen tras resultado terminal verificado;
- exactamente 14 checks de conformance: exact recovery cuando se declara o
  límite UNKNOWN seguro cuando no existe;
- 149 tests y gates locales completos verificados;
- CI Windows run `35608108255` en `success`;
- commit de cierre: `ba69a26293aead9efaa2f06069a02e0be7d0f67c`.

La falta de exact recovery deja de ser bloqueo técnico universal. Permanecen
intactos los gates de autenticación, contrato, distribución, billing, custodia y
evidencia real de cada capability.

## M5 — primer conector estructurado

Estado: `PARTIAL`.

La infraestructura provider-agnostic, `AdapterHost`, Reference Provider,
conformance, gates y semántica de recovery existen. Reference Provider sigue
siendo el único ejecutable.

Antes de construir un adapter externo:

1. la ruta exacta debe estar identificada;
2. autenticación/custodia debe ser oficial y compatible con las reglas del
   producto;
3. contrato/términos aplicables deben ser suficientemente claros;
4. distribución y billing deben estar entendidos;
5. capabilities declaradas deben tener evidencia real;
6. debe existir threat model de la ruta;
7. el trust store solo puede ampliarse mediante el gate establecido.

### M5-A — Codex

Estado: `UNRESOLVED`.

La ausencia de exact recovery ya no bloquea universalmente la integración.
Continúan pendientes madurez/soporte de producción, autenticación exacta,
autorización contractual de terceros, distribución y evidencia de capabilities.
Hasta nueva evidencia se declaran cero recovery capabilities externas.

### M5-A2 — Claude

Estado: `UNRESOLVED`.

La reanudación de sesión no se considera por sí sola recuperación del mismo
turn. La ruta puede fallar seguro mediante UNKNOWN, pero autenticación,
clasificación contractual del uso exacto, distribución y evidencia real siguen
pendientes.

### M5-A3 — Google/Gemini

Estado global: `UNRESOLVED`.

Las rutas de consumidor no autorizadas permanecen rechazadas. La API de
Interactions continúa `CONDITIONALLY_APPROVED` únicamente como alternativa
futura con credencial/proyecto/billing propios; mantiene como candidatas,
sujetas a adapter y pruebas reales, `operation_query`, `stream_reconnect`,
`remote_cancel` y exact recovery para ejecución background cuando la
documentación/ruta exacta lo sustente.

Vertex AI con autenticación oficial de Cloud puede operar bajo el límite UNKNOWN
sin exigir exact recovery, pero custodia, identidad/proyecto, billing, contrato
y evidencia de capabilities siguen `UNRESOLVED`.

### M5-B1 — autenticación y custodia de la primera ruta elegible

Estado: `BLOCKED` por evidencia externa.

Solo comienza cuando una ruta tenga claridad suficiente en contrato y
autenticación. Alcance:

- ADR de identidad/autenticación/custodia;
- frontera exacta entre Trivergence y software/servicio oficial;
- instalación, login, revocación y logout;
- binding cuenta/proyecto/organización;
- amenazas de sustitución de identidad y confused deputy;
- billing y límites visibles;
- almacenamiento permitido/prohibido;
- comportamiento offline/expired/revoked;
- fixtures y aceptación.

**No construir ni habilitar el adapter en M5-B1.**

### M5-B2 — spike aislado del primer adapter

Estado: `PLANNED`, dependiente de M5-B1 y gates obligatorios.

Debe ser mínimo, version-pinned, sin lógica de marca en Orchestration Engine,
contra la suite de conformance y con trust store fail-closed. Solo una ruta.

### M5-B3 — integración E2E y habilitación controlada

Estado: `PLANNED`.

Requiere adapter aprobado, fixtures reales, policy/approval, budgets, recovery
honesto, provenance, privacidad, UI de estados y E2E. Recién aquí puede existir
un primer provider externo ejecutable.

## M7 — beta local Windows

Estado: `PARTIAL`.

Mantener como puertas pendientes:

- reproducibilidad del instalador NSIS;
- Authenticode, identidad editorial y custodia de claves;
- matriz limpia Windows 10/11 para install/upgrade/rollback/uninstall;
- segundo host/runner de build;
- revisión completa de obligaciones de dependencias empaquetadas;
- canal autenticado de update antes de habilitarlo;
- validación humana de accesibilidad pendiente.

P3 no reduce estas exigencias.

# P3 — evolución arquitectónica

Estado funcional: `PLANNED`. P3-0 documental está `DONE`; no implementa ninguna
capacidad P3.

P3 convierte capacidades ya separadas en contexto, gateways, durabilidad y
proyecciones reutilizables. No es un “big bang”. Cada subfase requiere orden
explícita, threat model, budgets, tests y puerta de salida propia; cerrarla no
autoriza automáticamente la siguiente.

## P3-0 — documentación y ADRs

Estado: `DONE` documental, 2026-09-22.

- arquitectura `CURRENT/CORE` separada de `NEXT/PLANNED`;
- ownership normativo sin fuentes de verdad duplicadas;
- ADRs preparados para recovery envelope, conformance integrada, clasificación
  conservadora de efectos y workflow snapshots;
- dossiers alineados con ADR-0011 sin alterar gates externos;
- orden P3 basado en dependencias durables.

P3-0 registra deuda técnica, pero no modifica código ni habilita providers.

## P3-0.1 — revisión técnica y aceptación de ADRs

Estado: `DONE` documental, 2026-09-22. Implementaciones: `PENDING`.

- ADR-0012 acepta un envelope con compartimentos independientes para identidad
  remota, continuación e idempotencia;
- ADR-0013 mantiene los 14 checks y exige que `interrupted_recovery` se acredite
  mediante un harness de Adapter + AdapterHost + Runtime + persistence;
- ADR-0014 separa severidad de efecto de garantía de compensación y asigna la
  evaluación efectiva versionada al Planner;
- ADR-0015 define un snapshot como manifest inmutable de referencias/digests de
  estado confirmado, nunca como provider checkpoint o copia de otras fuentes de
  verdad.

Las cuatro decisiones están `ACCEPTED`, pero ninguna está implementada. Siguen
pendientes los cambios de contratos, migraciones, harness y durable state. M5 y
M7 permanecen `PARTIAL`; Reference Provider continúa como único ejecutable.

## P3-A1 — Project Context mínimo

Estado: `DONE` (2026-09-22). Dependencia documental: P3-0.1 completado.

Objetivo: snapshot operacional versionado por workspace que reúna objetivo,
restricciones, policy, capabilities, budgets y referencias autorizadas a Memory,
Audit/Evidence y recursos. No es un índice inteligente ni una nueva base de
verdad.

Puerta de salida verificada: contrato `ProjectContextSnapshot` v1, builder único
y determinista, referencias/digests con provenance, límite de 16 KiB, retención
y private mode, persistencia SQLite inmutable para modo estándar y consumo por
Strategy. Los límites se reflejan sin copiar consumo del Runtime; Registry,
Memory, Audit y Evidence continúan como fuentes de verdad. Reference Provider
continúa siendo el único provider ejecutable.

## P3-D0 — contrato de Execution Gateway

Estado: `DONE` (2026-09-22). Dependencias: P3-A1 y ADRs de effect/recovery
aceptados pero todavía no implementados.

Resultado: contrato v1 de backend/request/preparation/result, gateway
fail-closed y backend local supervisado que delega en el `ProcessSupervisor`
existente. El manifest declara acceso de proceso host, ausencia de
sandbox/confinamiento del child, red no filtrada por destino, límites,
cancelación y provenance sin convertir capabilities en permisos.

Puerta de salida verificada: Policy y Approval permanecen como autoridades;
Project Context se referencia por identidad/revisión/digest; la evaluación de
efecto planificada se consume mediante un puente explícito; Runtime conserva el
lifecycle global y `treeTerminationConfirmed=false` permanece visible. Tool
Gateway podrá reutilizar esta frontera sin crear otro supervisor.

## P3-E1 — Durable Workflow State

Estado: `PLANNED`. Dependencias: P3-A1, ADR-0011, ADR-0015 y persistence/Runtime
actuales.

Objetivo: estado durable para pause/resume, aprobación/input/evento, restart,
deadlines, budgets/provenance y `remote_state_unknown`. Debe distinguir futuros
`WorkflowExecutionSnapshot` de `ProviderRecoveryCheckpoint`.

Puerta de salida futura: crash inyectado en cada frontera conserva estado y
nunca duplica efectos ni ejecuta retry inseguro.

## P3-B1 — Agent Profiles declarativos

Estado: `PLANNED`. Dependencias: P3-A1 y modelo durable de identidad/estado de
P3-E1.

Objetivo: perfiles por capabilities, permisos, budgets, contexto, termination y
evidence. Los roles M6 fijos continúan siendo implementación actual hasta que
esta fase tenga evidencia.

Puerta de salida futura: un perfil no amplía autoridad y su selección es
explicable, versionada y auditable.

## P3-B2 — fan-out/fan-in acotado

Estado: `PLANNED`. Dependencias: P3-B1 y P3-E1 completos.

Objetivo: subtareas independientes, concurrencia limitada, cancelación por rama,
budget agregado, provenance, evaluación/síntesis y degradación secuencial.

Puerta de salida futura: ninguna rama pierde estado durable, amplía autoridad,
duplica efectos o excede budget agregado.

## P3-C — Tool Gateway MCP

Estado: `PLANNED`. Dependencias: P3-D0, Registry/Policy/Approval estables y
estado durable aplicable.

Objetivo: adaptar tools/resources/prompts MCP a capabilities mediante discovery,
schemas, allowlists, permissions, provenance, network policy y UI de destino.
MCP reutiliza Execution Gateway; nunca implementa supervisor independiente.

Puerta de salida futura: un servidor no confiable no escapa de policy, accede a
recursos excluidos ni ejecuta una capability no aprobada.

## P3-A2 — Project Intelligence

Estado: `PLANNED`. Dependencia: P3-A1.

Objetivo: índice derivado/reconstruible, búsqueda con citas, context packs y
detector de drift con revisión humana. No autoedita documentos gobernantes, no
convierte outputs en hechos y no exige embeddings ni knowledge graph.

Puerta de salida futura: fuentes exactas, exclusiones/private mode, invalidación
y pruebas de poisoning verificadas.

## P3-F1 — Trivergence Trace

Estado: `PLANNED`. Dependencias: IDs y transiciones estables de P3-E1 y las
fuentes actuales de Audit/Evidence/provenance.

Objetivo: proyección correlacionada
objetivo→estrategia→plan→ejecución→evaluación →resultado. Trace no es una nueva
fuente de verdad.

## P3-F2 — exporter OpenTelemetry

Estado: `PLANNED`. Dependencia: P3-F1.

Objetivo: exportación opt-in y sanitizada de la proyección Trace. OpenTelemetry
no reemplaza persistence, audit chain ni evidence.

## Capacidades posteriores exclusivamente experimentales

Estado común: `LATER/EXPERIMENTAL`; ninguna está autorizada.

- Agent Gateway A2A;
- browser/web automation graduada por riesgo;
- knowledge graph relacional/temporal y embeddings opcionales;
- workflow branching desde un `WorkflowExecutionSnapshot` confirmado e
  inmutable, nunca desde `ProviderRecoveryCheckpoint`;
- capacidades avanzadas de memoria para hechos/decisiones/eventos.

Cada candidata requiere ADR, threat model, budgets, privacidad, evidencia de
necesidad y una orden explícita antes de implementar.

## Capacidades deliberadamente diferidas

No forman parte del compromiso P3 inicial:

- marketplace público de extensiones;
- instalación automática de código no auditado;
- torneo/consejo de proveedores por defecto;
- autonomía destructiva;
- editor/IDE completo;
- modelo de IA propio;
- soporte macOS/Linux;
- cualquier integración que dependa de extraer credenciales privadas.

## Regla de secuenciación

Orden normativo:

`P3-0 → P3-A1 → P3-D0 → P3-E1 → P3-B1 → P3-B2 → P3-C → P3-A2 → P3-F1 → P3-F2`.

M5 y M7 continúan como puertas independientes y no cambian por P3. Las
capacidades experimentales quedan después de P3-F2 y no entran al roadmap de
implementación sin una decisión posterior. No se combinan subfases en una misma
orden salvo modificación explícita y justificada de este Roadmap.
