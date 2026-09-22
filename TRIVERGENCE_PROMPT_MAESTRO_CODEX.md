# Trivergence — Prompt Maestro para Codex

Estado: **especificación maestra v2.0**  
Última revisión: 2026-09-22

Este documento es la constitución técnica y de producto de Trivergence. Define
su propósito, invariantes, fronteras y dirección arquitectónica estable. El
estado verificado vive en `IMPLEMENTATION_STATUS.md`; el orden de implementación
vive en `ROADMAP.md`; los detalles de decisiones concretas viven en ADR, threat
models y documentos de arquitectura. Una capacidad mencionada aquí no se
considera implementada por aparecer en esta especificación.

## Definición del producto

Trivergence es una **capa de orquestación local-first** para Windows que
transforma un objetivo humano en una estrategia verificable y coordina
capacidades de IA, agentes, herramientas, conocimiento, memoria, workflows y
entornos de ejecución bajo políticas, aprobaciones, evaluación, recuperación,
budgets, provenance, auditoría y evidencia comunes.

La unidad de interacción primaria es el **objetivo**, no el proveedor. El
usuario debe poder expresar qué quiere lograr y dejar que Trivergence determine
qué capacidades compatibles pueden intervenir, explique el plan, solicite las
aprobaciones necesarias, supervise la ejecución y presente resultado y
evidencia.

Trivergence no es un IDE, un modelo de IA, una CLI de IA ni un reemplazo de los
proveedores o agentes que coordina. Tampoco debe convertirse en un contenedor de
funciones sin una arquitectura común. Su valor diferencial es la **coordinación
segura y verificable**.

La aplicación debe seguir siendo útil sin proveedor externo: puede abrir un
workspace, inspeccionar recursos permitidos, evaluar acciones, usar capacidades
locales disponibles y consultar historial, auditoría y recuperación.

## Principios no negociables

1. **Objetivo primero.** La arquitectura parte de la intención del usuario y no
   de un proveedor, agente o herramienta concreto.
2. **El usuario conserva el control.** Toda acción privilegiada tiene destino,
   riesgo, alcance, efecto y motivo visibles antes de aprobarse.
3. **Evidencia antes que promesas.** Una capacidad solo se marca disponible o
   completa cuando existe evidencia verificable proporcional a su riesgo.
4. **Compatibilidad honesta.** El Capability Registry publica únicamente
   capacidades realmente observadas, compatibles y autorizadas.
5. **Fail closed.** Versiones, protocolos, estados, outputs, attestations o
   recuperaciones desconocidas no se convierten en éxito por conveniencia.
6. **Incertidumbre explícita.** Trivergence nunca afirma que una operación
   remota ocurrió o no ocurrió si no puede demostrarlo.
7. **Mínimo privilegio.** Renderer, procesos, tools, agentes, proveedores y
   entornos de ejecución reciben únicamente la autoridad necesaria.
8. **Policy y approvals son fronteras obligatorias.** Ningún subsistema externo
   obtiene autoridad directa sobre filesystem, procesos, red, credenciales o
   efectos privilegiados.
9. **Provider-agnostic y agent-agnostic.** La lógica de una marca, modelo o
   agente no se incorpora al Orchestration Engine.
10. **Local-first no significa offline.** Estado, configuración y auditoría son
    locales por defecto; una capacidad de red puede enviar contexto solo al
    destino visible y autorizado.
11. **Privacidad precisa, no absoluta.** El modo privado minimiza persistencia,
    pero no se describirá como eliminación forense ni como ausencia total de
    artefactos cuando auditoría, backups o sistemas externos puedan
    conservarlos.
12. **Budgets obligatorios.** Tiempo, llamadas, tokens/bytes, coste y recursos
    deben poder limitarse antes de permitir fan-out, reparación o autonomía.
13. **Clean-room.** Código, marca e interfaz son propios. Se adoptan estándares
    y patrones funcionales, no identidades ni interfaces ajenas.
14. **Interoperabilidad antes que acoplamiento.** Cuando exista un estándar
    apropiado, se prefiere una frontera interoperable a incorporar un framework
    externo como núcleo.
15. **Sin feature creep.** Una función futura no entra al core por ser
    atractiva; necesita caso de uso, contrato, threat model, budgets, pruebas y
    puerta de salida.

## Estado conceptual de capacidades

Las etiquetas siguientes son normativas para interpretar este documento:

- `CURRENT/CORE`: forma parte del núcleo o existe con evidencia en el estado
  verificado.
- `NEXT/PLANNED`: dirección aprobada para evolución, todavía no implica código.
- `LATER/EXPERIMENTAL`: candidata útil que requiere ADR, amenaza, presupuesto y
  evidencia antes de comprometerse.
- `OUT OF SCOPE`: no pertenece al compromiso actual.

`IMPLEMENTATION_STATUS.md` es la única fuente que puede afirmar `DONE`.

## Arquitectura normativa

### 1. Orchestration Core — `CURRENT/CORE`

El núcleo lógico continúa compuesto por:

1. **Strategy Engine:** interpreta el objetivo, restricciones, privacidad,
   budgets y capacidades; construye rutas candidatas, las compara y selecciona
   una ruta explicable.
2. **Execution Planner:** descompone la ruta en pasos y dependencias tipadas,
   acíclicas y evaluables; no ejecuta.
3. **Capability Registry:** inventario versionado de capacidades observadas,
   restricciones, evidencia, riesgos y disponibilidad.
4. **Evaluation Engine:** realiza evaluación preflight y postflight sobre plan,
   policy, evidence, provenance y outcomes.

La secuencia conceptual es:

`objetivo → contexto → estrategia → planificación → resolución de capacidades → preflight → policy/aprobación → ejecución → postflight → evidencia → resultado`

Strategy puede representar rutas secuenciales o paralelas cuando exista la
capacidad correspondiente. El Runtime actual ejecuta el flujo soportado de forma
secuencial; fan-out/fan-in permanece `NEXT/PLANNED` y nunca se presume gratuito
ni seguro.

### 2. Runtime, Policy, Approval y Evidence — `CURRENT/CORE`

Solo Runtime convierte pasos autorizados en efectos. Policy Engine permanece
determinista y separado de la selección de estrategia. Las aprobaciones están
ligadas a identidad de request/plan/capability/policy y deben invalidarse cuando
cambie aquello que autorizaban.

Toda ejecución debe producir provenance y evidencia suficiente para distinguir:
planificado, autorizado, enviado, observado, completado, cancelado, fallido,
desconocido y resuelto humanamente.

### 3. Provider Gateway — `CURRENT/CORE` como frontera; conectores externos sujetos a M5

`ProviderAdapter` y `AdapterHost` constituyen la frontera única entre Runtime y
proveedores. Un adapter declara capacidades; no obtiene autoridad implícita.

La selección actual de ruta considera:

- compatibilidad y disponibilidad de capabilities publicadas;
- dependencias declaradas;
- coincidencia entre objetivo y routing publicado;
- solicitud explícita de capabilities;
- privacidad y necesidad de red.

La **selección integral de provider** es `NEXT/PLANNED`. Strategy todavía no
decide de forma completa usando:

- estado de instalación/autenticación/gate;
- budgets y límites;
- latencia/tiempo cuando exista evidencia;
- recovery capabilities;
- provenance del provider;
- preferencia guardada del usuario.

La preferencia guardada hoy es configuración informativa y no enruta
ejecuciones. Incorporar estos criterios requerirá contratos, evidencia y tests;
no se infieren por la mera presencia de un provider en el catálogo.

La existencia de un adapter no implica autorización contractual ni habilitación.

### 4. Recovery semantics — `CURRENT/CORE`

ADR-0011 separa **provider execution recovery** de **orchestration recovery**.

Un provider puede declarar cero o más primitives:

- `local_checkpoint`
- `stream_reconnect`
- `operation_query`
- `operation_resume`
- `idempotent_retry`
- `remote_cancel`
- `exact_recovery`

`recover` es opcional. Ninguna primitive autoriza por sí sola un retry
automático.

Runtime persiste el attempt antes del dispatch con digest, provenance, budget,
evaluación de efecto y estado remoto. ADR-0014 separa la severidad
`PURE/READ_ONLY/SIDE_EFFECTFUL/IRREVERSIBLE` de la garantía de compensación
`NOT_APPLICABLE/NONE/DEFINED/VERIFIED`. La clasificación ejecutable aún no fue
migrada: esta es una decisión arquitectónica aceptada, no capacidad
implementada.

ADR-0012 acepta un recovery envelope futuro con compartimentos independientes
para identidad remota, continuación e idempotencia. El checkpoint actual del
Reference Provider continúa vigente hasta una migración explícita y no se
interpreta como semántica universal.

Cuando una solicitud pudo haber sido recibida pero no existe evidencia terminal
suficiente, el estado es `remote_state_unknown`. Ese estado:

- no se transforma automáticamente en success o failure;
- detiene dependencias incompatibles;
- no consume un checkpoint como si el resultado estuviera verificado;
- no permite retry inseguro;
- conserva provenance y budget;
- puede requerir resolución humana explícita y auditada.

La recuperación de Trivergence debe ser segura incluso cuando el proveedor no
ofrezca recovery exacto.

### 5. Project Context — `NEXT/PLANNED`

Cada workspace evolucionará hacia un contexto operacional explícito que pueda
reunir, con límites y provenance:

- objetivo y restricciones;
- arquitectura y decisiones;
- reglas/policies;
- capacidades disponibles;
- memoria autorizada;
- documentación relevante;
- recursos y herramientas;
- budgets;
- preferencias;
- historial/evidencia necesaria.

No es una bolsa ilimitada de prompts. Debe ser seleccionable, versionable,
auditable y respetar modo privado y retención.

### 6. Project Intelligence / Knowledge Layer — `NEXT/PLANNED`

Trivergence debe poder construir conocimiento consultable del proyecto sin
convertir toda la información en memoria permanente.

Funciones objetivo:

- indexación incremental de fuentes permitidas;
- búsqueda lexical/semántica según disponibilidad;
- citas archivo/línea o referencia equivalente;
- relaciones entre arquitectura, ADR, código, decisiones, runs y evidencia;
- respuestas con provenance y confianza;
- detección de contradicciones o documentación potencialmente obsoleta;
- paquetes de contexto estructurado y legible por agentes;
- generación de manifests/resúmenes de capacidades y restricciones;
- propuesta de actualización documental sometida a revisión humana.

El observador documental nunca modifica silenciosamente documentos gobernantes.
Detecta deriva, aporta evidencia y propone un cambio.

Embeddings y grafo de conocimiento son implementaciones posibles, no requisitos
del core. Deben justificar coste, privacidad y complejidad.

### 7. Agent Runtime y perfiles por capacidades — `NEXT/PLANNED`

Los agentes se definen por **capabilities, permisos, budgets y
responsabilidades**, no por personajes decorativos.

Un perfil puede declarar:

- rol operativo;
- capacidades requeridas;
- tools permitidas;
- providers compatibles;
- acceso a conocimiento/memoria;
- límites de red y efectos;
- budget;
- criterios de terminación;
- formato de evidence/output.

Strategy puede formar equipos dinámicos. La cantidad de agentes no se fija en
tres ni en ningún número mágico.

La ejecución paralela futura usa fan-out/fan-in controlado:

`objetivo → subtareas independientes → ejecuciones acotadas → evaluación → síntesis`

Debe existir límite de concurrencia, budget agregado, cancelación, provenance
por rama y reglas de degradación. No se paraleliza cuando aumente riesgo sin
beneficio demostrable.

### 8. Tool Gateway mediante MCP — `NEXT/PLANNED`

Trivergence podrá actuar como host/cliente de MCP para descubrir y usar tools,
resources y prompts mediante una frontera común.

Todo servidor/capability MCP debe pasar por:

`discovery → Registry → Strategy/Planner → Policy → Approval → Runtime → Evidence`

Requisitos mínimos:

- allowlist/configuración explícita;
- permisos por servidor y capability;
- schemas validados;
- límites de red/tiempo/output;
- aislamiento de procesos cuando aplique;
- contenido externo tratado como no confiable;
- provenance del servidor, capability, argumentos y resultado;
- revocación/cancelación;
- ningún tool puede saltarse Policy/Approval.

Trivergence no se convierte en un simple lanzador de servidores MCP.

### 9. Agent Gateway mediante A2A — `LATER/EXPERIMENTAL`

La interoperabilidad con agentes externos debe ocurrir mediante una frontera de
agente, no incorporando un framework de agentes como núcleo.

La frontera debe poder modelar:

- descubrimiento de capacidades;
- delegación de tareas;
- estados de ejecución;
- solicitud de input/aprobación;
- resultados y artefactos;
- cancelación;
- provenance;
- identidad y trust;
- budgets;
- incertidumbre y recovery.

A2A es el estándar candidato para esta frontera. Su adopción requiere ADR y
threat model específicos.

### 10. Execution/Sandbox Gateway — `NEXT/PLANNED`

El razonamiento y la ejecución son responsabilidades separadas. Una capacidad
que propone una acción no obtiene automáticamente el entorno que la ejecuta.

La abstracción futura de ejecución podrá elegir, según policy:

- ejecución local supervisada;
- proceso aislado;
- contenedor/VM cuando esté disponible;
- entorno remoto explícitamente autorizado.

Todo backend debe declarar filesystem, red, procesos, persistencia, recursos,
cancelación, cleanup y evidencia. La implementación concreta es intercambiable.

### 11. Browser/Web Automation — `LATER/EXPERIMENTAL`

La automatización web se modelará como tools con niveles de riesgo, no como
acceso irrestricto al navegador:

- `L0`: lectura de contenido público;
- `L1`: navegación/búsqueda sin efectos;
- `L2`: completar formularios sin confirmar efectos externos;
- `L3`: acciones autenticadas reversibles;
- `L4`: efectos externos significativos o irreversibles.

Los niveles altos requieren approvals explícitas y contexto de destino. No se
extraen cookies, tokens ni almacenes internos del navegador. Una sesión
autenticada solo puede utilizarse mediante una interfaz autorizada que preserve
control del usuario y aislamiento.

### 12. Durable Workflow Runtime — `NEXT/PLANNED`

Los workflows evolucionarán de pipelines locales a ejecuciones durables capaces
de:

- persistir estado entre pasos;
- pausar por aprobación, input o evento externo;
- reanudar sin duplicar efectos;
- sobrevivir reinicio/crash cuando la evidencia lo permita;
- representar `remote_state_unknown`;
- consultar estado de operaciones cuando exista capability;
- cancelar ramas;
- conservar budgets/provenance;
- establecer timeouts y expiración;
- mostrar al usuario dónde y por qué está detenido un workflow.

Un futuro `WorkflowExecutionSnapshot` pertenecerá a la orquestación y no
implicará recovery remoto. Es un manifest inmutable de referencias y digests de
un punto confirmado, no una copia de Memory, Project Context, Audit o Evidence.
Es distinto de `ProviderRecoveryCheckpoint`, que describe material de una
ejecución de provider y puede coexistir con incertidumbre remota.

La ramificación desde un snapshot de workflow confirmado y el análisis de
ejecuciones alternativas son `LATER/EXPERIMENTAL`: el snapshot debe ser
inmutable respecto del historial original, no puede representar
`remote_state_unknown` y ninguna rama puede repetir efectos externos sin nueva
autorización.

### 13. Telemetry y Trivergence Trace — `NEXT/PLANNED`

Cada run debe poder representarse como una traza correlacionada:

- objetivo;
- estrategia y rutas consideradas;
- plan;
- capacidades elegidas;
- provider/agent/tool spans;
- approvals;
- budgets y consumo;
- recovery/retries;
- evaluación;
- evidence/provenance;
- resultado;
- tiempo y coste cuando sean observables.

La fuente primaria permanece local. OpenTelemetry es el formato candidato de
exportación interoperable. Exportar telemetría es opt-in y debe sanitizar datos.

La telemetría no reemplaza la audit chain ni la evidencia de seguridad.

### 14. Memory y Knowledge Graph — `CURRENT/CORE` limitado + `LATER/EXPERIMENTAL`

La memoria actual por workspace mantiene límites, TTL, poda, borrado y
provenance.

La evolución puede distinguir:

- memoria efímera de run;
- memoria explícitamente persistida;
- hechos del proyecto;
- decisiones;
- relaciones entre entidades;
- eventos temporales;
- evidencia y fuentes.

Un grafo relacional/temporal es experimental. No debe inferir hechos
persistentes sin provenance ni convertir outputs de IA en verdad del proyecto.

### 15. Capability Discovery y extensibilidad — `NEXT/PLANNED`

El Registry evolucionará para representar de manera uniforme capacidades de:

- providers;
- agents;
- tools;
- execution backends;
- knowledge;
- memory;
- workflows.

Cada capability debe tener identidad/version, schema, permisos, riesgos,
budgets, provenance, disponibilidad y evidencia de health.

Un catálogo local de capacidades puede existir. Un marketplace público,
instalación automática de código de terceros o ejecución de extensiones no
auditadas queda `OUT OF SCOPE` hasta una fase posterior con modelo de confianza
propio.

## Orden de evolución arquitectónica

La dirección aprobada no significa implementar todo simultáneamente. El orden
preferido es:

1. **P3-0:** documentación, ownership y ADRs previos;
2. **P3-0.1:** revisión técnica y aceptación de ADR-0012 a ADR-0015;
3. **P3-A1:** Project Context mínimo;
4. **P3-D0:** contrato de Execution Gateway;
5. **P3-E1:** estado durable del Workflow Runtime;
6. **P3-B1:** Agent Profiles declarativos;
7. **P3-B2:** fan-out/fan-in acotado;
8. **P3-C:** Tool Gateway MCP;
9. **P3-A2:** Project Intelligence;
10. **P3-F1:** Trivergence Trace;
11. **P3-F2:** exporter OpenTelemetry opt-in.

Después, y exclusivamente como `LATER/EXPERIMENTAL`, pueden evaluarse Agent
Gateway A2A, browser/web automation, knowledge graph, workflow branching y
capacidades avanzadas de memoria.

Cada paso necesita su propia puerta de salida. El Roadmap puede reordenarlo si
una dependencia real lo exige, pero debe documentar el motivo.

## Ownership arquitectónico normativo

Cada concepto tiene una sola responsabilidad principal. Ningún hito futuro puede
crear una segunda fuente de verdad:

| Concepto             | Responsabilidad principal                                                         | No debe convertirse en                                  |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Project Context      | Snapshot versionado de contexto operativo permitido para una decisión o ejecución | almacén maestro de memoria o auditoría                  |
| Project Intelligence | Índice derivado y reconstruible sobre fuentes autorizadas                         | verdad persistente del proyecto                         |
| Memory               | Conocimiento persistido y gobernado por retención, privacidad y provenance        | registro de ejecución append-only                       |
| Audit                | Registro append-only de hechos de ejecución                                       | evidencia del contenido completo ni índice de búsqueda  |
| Evidence             | Prueba verificable de resultados y acciones                                       | historial mutable o telemetría auxiliar                 |
| Trace                | Proyección correlacionada de audit, evidence y provenance                         | nueva autoridad de estado                               |
| Runtime              | Estado y transiciones de ejecución                                                | catálogo de capabilities o protocolo de provider        |
| Effect Assessment    | Evaluación versionada de severidad y compensación producida por Planner           | reclasificaciones independientes por cada consumidor    |
| Capability Registry  | Estado normalizado de capacidades observadas                                      | ejecutor o trust store implícito                        |
| Provider Gateway     | `ProviderAdapter` + `AdapterHost` + dispatcher existentes                         | segundo camino de ejecución                             |
| Execution Gateway    | Abstracción futura sobre ejecución supervisada                                    | policy engine o tool protocol                           |
| Tool Gateway         | Adaptación de herramientas hacia capabilities                                     | supervisor de procesos independiente                    |
| Workflow Snapshot    | Manifest inmutable de un punto confirmado con referencias y digests               | copia de Memory/Context/Audit/Evidence o estado UNKNOWN |

La explicación extendida y las reglas de composición están en
`docs/architecture/ownership.md`.

## Límite jurídico y técnico de proveedores

El contrato común no promete igualdad entre proveedores. Cada ruta se evalúa por
interfaz, versión, cuenta, autenticación, términos, distribución, billing,
custodia y evidencia real.

El estado actual de cada proveedor se documenta exclusivamente en los
expedientes de M5 y `IMPLEMENTATION_STATUS.md`. Ningún texto del Prompt Maestro
habilita una ruta externa.

Credenciales de proveedor permanecen fuera de Trivergence salvo que una futura
ruta oficial requiera custodia propia y exista un ADR explícito que modifique
esta regla. Hasta entonces:

- no se leen almacenes internos de credenciales;
- no se copian tokens de software oficial;
- no se hace piggyback de sesiones no autorizadas;
- no se implementa OAuth propio por inferencia;
- no se confunde una suscripción de consumidor con entitlement de API.

## Zonas de confianza

1. **Renderer:** UI sin privilegios.
2. **Preload:** puente mínimo con métodos nominados.
3. **Main/coordinator:** ciclo de vida, validación y autorización de contratos.
4. **Runtime privilegiado:** workers y efectos supervisados.
5. **Gateways externos:** providers, tools, agents y execution backends tratados
   como fronteras no confiables salvo evidencia específica.

Todo input externo —archivo, web, tool, provider, agent, servidor o output de
modelo— se trata como datos, nunca como autoridad.

## Stack de referencia

El stack actual se conserva mientras aporte valor:

- monorepo `pnpm` + Turborepo;
- Electron, Vite, React y TypeScript estricto;
- Tailwind CSS y componentes accesibles;
- Zustand para estado efímero y TanStack Query para estado asíncrono;
- Zod en fronteras;
- `node:sqlite` detrás de su adaptador;
- procesos detrás del supervisor;
- Vitest, Testing Library y Playwright;
- Electron Builder para Windows.

MCP, A2A y OpenTelemetry son fronteras/estándares candidatos; su presencia en
esta especificación no autoriza instalar dependencias ni implementar integración
antes del hito correspondiente.

## Reglas de privacidad y seguridad

- No acceder a `.env`, claves SSH, browser stores, credential managers ni
  archivos internos de autenticación salvo un futuro ADR que autorice un
  mecanismo oficial concreto.
- Combinar exclusiones internas obligatorias, reglas del usuario e ignore files.
- Mostrar destino y contexto antes de transmitir información sensible.
- Tratar detección de secretos como defensa en profundidad, no garantía.
- No usar `eval`, shell implícita ni comandos concatenados.
- Limitar tiempo, output, recursos y descendientes.
- Sanitizar logs y exports.
- Sanitizar contenido renderizado.
- No abrir protocolos arbitrarios.
- Mantener private mode y retención con afirmaciones precisas.
- No permitir que contenido no confiable modifique policies, approvals o
  instrucciones gobernantes.

## Gobernanza documental

Los documentos tienen responsabilidades distintas:

- **Prompt Maestro:** invariantes, propósito y arquitectura objetivo.
- **ROADMAP.md:** orden, dependencias y puertas de implementación.
- **IMPLEMENTATION_STATUS.md:** hechos verificados y bloqueos actuales.
- **ADR:** decisiones técnicas irreversibles o costosas.
- **Threat models:** riesgos y mitigaciones.
- **Provider dossiers:** evidencia técnica/contractual por ruta.

Ante conflicto, no se reescribe la historia para aparentar coherencia: se
registra la discrepancia, se determina qué evidencia es más reciente y se
actualizan los documentos afectados.

Documentos gobernantes incluyen, como mínimo:

- `docs/product/spec-review.md`
- `docs/product/PRD.md`
- `docs/product/priorities-by-area.md`
- `docs/architecture/overview.md`
- `docs/architecture/orchestration-engine.md`
- `docs/architecture/persistence-and-audit.md`
- `docs/architecture/runtime-and-approvals.md`
- `docs/architecture/workspace-and-tools.md`
- `docs/architecture/desktop-orchestration-session.md`
- `docs/architecture/provider-adapters.md`
- `docs/architecture/reference-provider-contract.md`
- `docs/architecture/workflows-agents-memory.md`
- `docs/architecture/adr/0011-recovery-semantics.md`
- `docs/architecture/adr/0012-provider-agnostic-recovery-envelope.md`
- `docs/architecture/adr/0013-integrated-interrupted-recovery-conformance.md`
- `docs/architecture/adr/0014-conservative-operation-effect-classification.md`
- `docs/architecture/adr/0015-workflow-execution-snapshots.md`
- `docs/providers/gate-methodology.md`
- `docs/security/threat-model.md`
- `docs/design/ui-spec.md`
- `ROADMAP.md`
- `IMPLEMENTATION_STATUS.md`

## Definition of Done de una capacidad

Una capacidad no se marca `DONE` hasta que, según su riesgo:

- contrato/schema esté versionado;
- threat model o análisis de riesgo exista cuando corresponda;
- Policy/Approval la cubran;
- budgets y límites estén definidos;
- errores e incertidumbre fallen cerrado;
- provenance/evidence sean verificables;
- tests unitarios/integración/E2E aplicables pasen;
- privacidad y sanitización estén verificadas;
- documentación y estado estén actualizados;
- no sea un placeholder;
- CI relevante esté verde.

## Fuera del alcance actual

- modelo fundacional propio;
- competir por paridad con un IDE completo;
- marketplace público de código no auditado;
- autonomía destructiva sin aprobación;
- extracción de credenciales o sesiones privadas;
- prometer compatibilidad de proveedores sin gate;
- implementar simultáneamente todas las extensiones futuras;
- soporte macOS/Linux antes de una decisión explícita de roadmap.

## Regla final para Codex

Antes de modificar código:

1. leer Prompt Maestro, Roadmap, Implementation Status y ADR relevantes;
2. identificar el hito activo y su puerta de salida;
3. auditar el código existente antes de diseñar una abstracción nueva;
4. reutilizar contratos existentes cuando sean correctos;
5. no implementar capacidades `PLANNED/EXPERIMENTAL` fuera del hito pedido;
6. no habilitar proveedores, tools, agentes externos, red o credenciales por
   inferencia;
7. no rebajar seguridad para hacer pasar una prueba;
8. ejecutar gates frescos y documentar evidencia;
9. detenerse ante una dependencia contractual/externa real en lugar de
   simularla.

**Trivergence coordina capacidades; no confunde disponibilidad con autorización,
ejecución con éxito ni incertidumbre con fallo.**
