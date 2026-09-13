# Trivergence — especificación maestra revisada

Estado: **borrador técnico 0.6**  
Última revisión: 2026-08-07

Este documento define el propósito y las restricciones estables del proyecto. El
alcance, las decisiones técnicas y el orden de entrega viven en documentos
separados para evitar que una sola lista mezcle visión, diseño e implementación.

## Propósito

Trivergence será un **sistema de orquestación local-first** para Windows 10/11.
Recibe una intención, selecciona una estrategia, construye un plan con
capacidades verificadas, evalúa si puede ejecutarse y coordina los subsistemas
necesarios bajo políticas, aprobaciones y auditoría comunes.

Trivergence no es un IDE, un modelo de IA ni un reemplazo de agentes o
proveedores. El Runtime, los agentes, los proveedores, la memoria, los
workflows, los workspaces y las herramientas son subsistemas coordinados; no
constituyen el núcleo ni deciden por sí solos el flujo global.

La aplicación debe seguir siendo útil sin una CLI de IA instalada: podrá abrir
un proyecto, explorar archivos permitidos, evaluar acciones con su motor de
políticas y consultar el historial local.

## Principios no negociables

1. **El usuario conserva el control.** Toda acción privilegiada tiene destino,
   riesgo, alcance y motivo visibles antes de aprobarse.
2. **Credenciales fuera de Trivergence.** Trivergence no pide, lee, copia,
   transmite ni persiste credenciales de proveedores. El login ocurre
   exclusivamente en el software oficial.
3. **Compatibilidad honesta.** Una capacidad se ofrece solo si la versión
   instalada, la interfaz oficial y los términos aplicables permiten usarla. No
   se parsea como válido un formato desconocido.
4. **Local-first no significa offline.** La base de datos, configuración y
   auditoría son locales; al elegir una CLI cloud, el usuario envía contexto al
   proveedor indicado.
5. **Mínimo privilegio.** El renderer no accede a Node, filesystem, shell ni
   secretos. Todo acceso cruza contratos IPC validados y el motor de políticas.
6. **Sin autonomía destructiva.** Ningún perfil puede aprobar automáticamente
   acciones destructivas, elevación, credenciales o escritura fuera del
   workspace.
7. **Clean-room.** La marca, interfaz y código serán originales. Las
   dependencias se usarán según sus licencias; no se copiarán interfaces,
   recursos o código de productos citados como referencia.
8. **Evidencia antes que promesas.** Una capacidad solo se marca completa cuando
   tiene aceptación verificable y pruebas proporcionales al riesgo.

## Alcance de producto

### MVP (P0)

- Orchestration Engine con Strategy Engine, Execution Planner, Capability
  Registry y Evaluation Engine;
- vista previa trazable de `intención → estrategia → plan → evaluación`, aun sin
  ejecutar;
- aplicación Electron segura que abre sin proveedor;
- alta y apertura de un workspace local mediante ruta canónica;
- exploración de archivos con exclusiones y límites;
- motor de políticas declarativo y perfiles Observador, Asistente y
  Desarrollador;
- vista previa, aprobación, cancelación y auditoría de acciones;
- ejecución no interactiva limitada, sin concatenar shell;
- detección no invasiva de Codex, Claude Code, Gemini CLI y Ollama;
- lanzamiento visible de login/sesión oficial cuando corresponda;
- conector estructurado de proveedor únicamente cuando sea oficial, compatible y
  jurídicamente permitido;
- un flujo vertical real: inspeccionar proyecto, proponer una acción de solo
  lectura, ejecutarla y auditarla;
- SQLite local, migraciones, backup y exportación sanitizada;
- accesibilidad de teclado y WCAG 2.1 AA para el flujo crítico.

### Después del MVP (P1)

- editor, terminal y diff integrados;
- conversaciones persistentes, búsqueda FTS5, notas y tareas;
- indexación incremental y citas archivo/línea;
- flujos de revisión cruzada con dos ejecuciones compatibles;
- MCP stdio y Streamable HTTP con permisos por servidor;
- sandbox opcional mediante WSL2 o Docker cuando estén disponibles;
- empaquetado NSIS, artefacto portable y actualización firmada cuando exista
  infraestructura.

### Futuro (P2)

- consejo de hasta tres proveedores;
- memoria explícita y resúmenes jerárquicos;
- documentos PDF procesados en aislamiento;
- embeddings locales opcionales;
- torneo de propuestas limitado por presupuesto y métricas;
- catálogo de extensiones y capacidades adicionales.

## Límite jurídico y técnico de proveedores

El contrato común no promete que todos los proveedores soporten las mismas
operaciones. Cada conector declara una de estas modalidades por capacidad:

- `structured`: automatización documentada y permitida;
- `interactive`: sesión oficial visible, controlada por el usuario y no parseada
  como protocolo;
- `unavailable`: capacidad ausente, incompatible o no autorizada.

Las rutas se evalúan por interfaz y tipo de cuenta, no solo por marca. Claude
Code con Free/Pro/Max y Gemini CLI/Code Assist OAuth no serán backends
automatizados de Trivergence. Claude Platform mediante `ant` OAuth, Gemini sobre
Vertex OAuth/ADC/IAM y Codex App Server mediante login ChatGPT son candidatos
oficiales sin API key, pero cada uno conserva un gate contractual/legal propio.
Codex App Server es el primer candidato recomendado; no está aprobado ni
habilitado. Ver el
[expediente comparativo](docs/providers/comparison-2026-08-07.md).

La infraestructura común se verifica con un Reference Provider local, sin red,
login ni credenciales. Su existencia no habilita ni simula aprobación para una
ruta externa. Un proveedor que supere su gate se conecta implementando el
contrato de adaptador, sin agregar lógica de marca al Orchestration Engine.

## Arquitectura normativa

El núcleo lógico es `packages/orchestration-engine`, compuesto por:

1. **Strategy Engine:** decide el enfoque compatible con la intención, las
   restricciones y las capacidades disponibles.
2. **Execution Planner:** expande dependencias y produce un plan tipado,
   acíclico y evaluable; no ejecuta.
3. **Capability Registry:** inventario versionado de capacidades y evidencia de
   Runtime, agentes, proveedores, memoria, workflows, workspaces y tools.
4. **Evaluation Engine:** determina `ready`, `approval_required` o `blocked` a
   partir del plan, las decisiones de política y evidencia verificable.

El sistema mantiene además cuatro zonas de confianza:

1. **Renderer:** UI sin privilegios.
2. **Preload:** puente mínimo con métodos nominados, sin IPC genérico.
3. **Main/coordinator:** ventanas, ciclo de vida y autorización de contratos.
4. **Subsistemas privilegiados:** Runtime workers, filesystem, procesos, Git,
   memoria, agentes y proveedores, separados por capacidad y supervisados.

Toda solicitud sigue esta secuencia:

`intención → estrategia → planificación → resolución de capacidades → evaluación → política/aprobación → ejecución → evidencia/auditoría`

El Orchestration Engine puede generar y evaluar un plan sin Runtime ni
proveedor. Solo el Runtime convierte pasos autorizados en efectos. El Policy
Engine es un guardrail determinista invocado durante la planificación y antes de
ejecutar; no sustituye la selección de estrategia ni la evaluación global.

Una aprobación queda ligada al SHA-256 canónico de request, snapshot del
Registry, estrategia, plan, policies y evaluación. Cualquier cambio de
argumentos, directorio, entorno, destino, policy o capacidad la invalida.

## Stack de referencia

- monorepo `pnpm` + Turborepo;
- Electron, Vite, React y TypeScript estricto;
- Tailwind CSS y componentes accesibles propios o basados en dependencias
  permisivas;
- Zustand para estado efímero de UI y TanStack Query para estado asíncrono;
- Zod en cada frontera, sin compartir objetos Electron crudos;
- `node:sqlite` detrás de un adaptador propio según ADR-0003; Drizzle se
  reconsidera cuando su driver estable aporte valor; comprobación de FTS5 antes
  de habilitar búsqueda;
- `node:child_process` detrás del supervisor de ADR-0004 para procesos no
  interactivos; `node-pty` solo se evaluará para sesiones visibles;
- Vitest, Testing Library y Playwright;
- Electron Builder para distribución Windows.

Las versiones se fijan en lockfile tras verificar Node ABI, Electron y módulos
nativos. No se declara que el empaquetado funciona hasta probarlo en una máquina
limpia.

## Reglas de privacidad y seguridad

- No se accede a `.env`, claves SSH, almacenes de navegador, gestores de
  credenciales ni archivos de autenticación de las CLI.
- Las exclusiones combinan reglas internas obligatorias, reglas del usuario y
  archivos ignore.
- La detección automática de secretos es defensa en profundidad, no garantía;
  antes de enviar contexto se muestra el conjunto de archivos y el proveedor
  receptor.
- El contenido de archivos, web y herramientas se considera datos no confiables,
  nunca autoridad.
- No se usa `eval`, shell implícita ni strings de comando concatenados.
- Cada proceso tiene límite de tiempo y salida, cancelación y seguimiento de
  descendientes; si el árbol completo no puede garantizarse en un entorno, la UI
  lo indica y bloquea perfiles autónomos.
- Los logs son estructurados, minimizados y sanitizados antes de persistirse.
- La UI no renderiza HTML/Markdown no confiable sin sanitización y no abre
  protocolos arbitrarios.

## Gobernanza de alcance

La orden inicial de implementar diez fases completas “en la misma ejecución” se
sustituye por hitos con puertas de calidad. Un hito no comienza hasta que sus
decisiones y aceptación estén documentadas; no termina hasta que lint, tipos,
pruebas y build aplicables pasan.

Documentos gobernantes:

- [Auditoría de la especificación](docs/product/spec-review.md)
- [PRD](docs/product/PRD.md)
- [Prioridades por área](docs/product/priorities-by-area.md)
- [Arquitectura](docs/architecture/overview.md)
- [Orchestration Engine](docs/architecture/orchestration-engine.md)
- [ADR-0001](docs/architecture/adr/0001-trust-boundaries-and-provider-modes.md)
- [ADR-0002](docs/architecture/adr/0002-orchestration-engine-as-core.md)
- [ADR-0003](docs/architecture/adr/0003-node-sqlite-persistence-boundary.md)
- [Persistencia y auditoría](docs/architecture/persistence-and-audit.md)
- [ADR-0004](docs/architecture/adr/0004-runtime-process-supervision.md)
- [Runtime y aprobaciones](docs/architecture/runtime-and-approvals.md)
- [ADR-0005](docs/architecture/adr/0005-workspace-root-and-read-only-tools.md)
- [Workspace y tools locales](docs/architecture/workspace-and-tools.md)
- [ADR-0006](docs/architecture/adr/0006-desktop-session-and-nominal-ipc.md)
- [Sesión de orquestación en Desktop](docs/architecture/desktop-orchestration-session.md)
- [Arquitectura de adaptadores](docs/architecture/provider-adapters.md)
- [Contrato ejecutable y Reference Provider](docs/architecture/reference-provider-contract.md)
- [Metodología del gate de proveedores](docs/providers/gate-methodology.md)
- [Expediente comparativo de proveedores](docs/providers/comparison-2026-08-07.md)
- [ADR-0007](docs/architecture/adr/0007-provider-attestations-and-first-candidate.md)
- [ADR-0008](docs/architecture/adr/0008-provider-adapter-contract-and-reference-provider.md)
- [Workflows, agentes y memoria](docs/architecture/workflows-agents-memory.md)
- [ADR-0009](docs/architecture/adr/0009-workflows-agents-memory.md)
- [Modelo de seguridad](docs/security/threat-model.md)
- [Threat model M6](docs/security/threat-model-m6.md)
- [Especificación de UI](docs/design/ui-spec.md)
- [Auditoría de accesibilidad M6](docs/design/accessibility-audit-m6.md)
- [Roadmap](ROADMAP.md)
- [Estado verificado](IMPLEMENTATION_STATUS.md)

## Definition of Done del MVP

- instalación reproducible desde lockfile en Windows;
- lint, typecheck, unitarios, integración y E2E críticos en verde;
- build de escritorio ejecutable sin proveedores;
- renderer aislado, CSP restrictiva, navegación y ventanas externas bloqueadas
  por defecto;
- no hay secretos ni acceso a credenciales de proveedores;
- flujo vertical P0 demostrado con fixtures y workspace temporal;
- restauración de backup probada;
- adaptadores se degradan con seguridad ante versión o salida desconocidas;
- threat model, límites reales y pasos de desarrollo actualizados;
- ninguna función documentada como completa es un placeholder.
