# Arquitectura de Trivergence

Estado: normativa para M6 y P0  
Fecha: 2026-09-12

## Drivers

En orden: seguridad del host, control del usuario, trazabilidad de decisiones,
degradación segura, utilidad sin proveedor, testabilidad y experiencia Windows.
La extensibilidad no justifica ampliar privilegios.

## Identidad arquitectónica

Trivergence es un sistema local de orquestación. No es un IDE, un modelo de IA
ni un agente. El Orchestration Engine es la autoridad que transforma una
intención en una estrategia y un plan evaluado; no ejecuta efectos.

El renderer y el contenido aportado por workspaces, agentes, proveedores y tools
son no confiables. Las CLI oficiales son procesos externos confiables solo para
su propia autenticación; sus salidas siguen siendo datos no confiables.

```text
Usuario
  │
  ▼
Renderer no privilegiado
  │ intención tipada / preview
  ▼
Preload mínimo ──► Main/coordinator
                         │
                         ▼
                Orchestration Engine
             ┌───────────┼────────────┐
             ▼           ▼            ▼
       Strategy +     Planner +    Registry +
       Evaluation      Policy       evidencia
                         │ plan autorizado
                         ▼
       Runtime · agentes · proveedores · memoria
       workflows · workspace · tools · persistencia
```

## Núcleo

### `packages/orchestration-engine`

Paquete puro y proveedor-agnóstico compuesto por:

- **Strategy Engine:** genera, compara y selecciona rutas declaradas por las
  capacidades según objetivo, restricciones y disponibilidad.
- **Execution Planner:** expande dependencias y produce un plan tipado, acíclico
  y evaluable. No ejecuta.
- **Capability Registry:** inventario validado y versionado de capacidades y su
  estado efectivo.
- **Evaluation Engine:** separa preflight (`ready`, `approval_required`,
  `blocked`) de postflight (run/evidencia aceptados o rechazados).

La fachada no importa Electron, filesystem, procesos, red ni adaptadores. Un
preview debe ser determinista salvo por los identificadores inyectados.

### `packages/contracts`

Esquemas Zod y tipos derivados para IPC, orquestación, tools, proveedores,
auditoría y persistencia. El esquema es la fuente; no se mantienen tipos
duplicados manualmente.

### `packages/policy-engine`

Guardrail puro por acción normalizada. Devuelve `allow`, `deny` o
`require_approval`, motivo estable y regla coincidente. No elige estrategia, no
construye el plan, no ejecuta y no pregunta a la UI.

## Coordinación y confianza

### `apps/desktop`

- **renderer:** captura intención y presenta estrategia, plan, evaluación,
  aprobaciones y evidencia. No importa Node ni conoce rutas de DB.
- **preload:** expone métodos explícitos; no expone `ipcRenderer`, listeners
  genéricos ni objetos Electron.
- **main:** valida sender/origen y contratos, mantiene el snapshot local de
  capacidades y aloja el núcleo puro hasta extraerlo a un worker si las medidas
  lo requieren.

La propiedad de sesión, los IPC nominales y la ejecución por referencias están
definidos en
[Sesión de orquestación en Desktop](desktop-orchestration-session.md).

### Subsistemas coordinados

Runtime, agentes, proveedores, memoria, workflows, workspace, tools y
persistencia publican capacidades estrechas y evidencia. Ninguno llama a otro
para inventar un flujo global. El motor resuelve dependencias y el Runtime
despacha únicamente pasos autorizados.

- **Runtime:** convierte planes evaluados y autorizados en ejecuciones con
  límites, cancelación y correlación. No selecciona estrategias. Su contrato y
  estados están en [Runtime y aprobaciones](runtime-and-approvals.md).
- **Workspace:** canoniza rutas y ofrece operaciones acotadas; revalida antes de
  usar para reducir TOCTOU. El límite y las primeras capacidades están en
  [Workspace y tools locales](workspace-and-tools.md).
- **Provider adapters:** se alojan detrás de un `AdapterHost` único por sesión,
  que comprueba manifest/preview/stream/provenance; no acceden a credential
  stores ni habilitan una operación por mera presencia.
- **Persistence:** conserva snapshots, planes, evidencia y auditoría. Un único
  escritor evita bloqueos y acceso desde renderer.

## Flujo de una orquestación

1. Renderer envía una intención tipada, no un comando.
2. Main valida sender, contrato y límites de tamaño.
3. Strategy Engine selecciona estrategia sobre un snapshot versionado del
   Capability Registry.
4. Execution Planner expande dependencias, detecta faltantes/ciclos y construye
   acciones canónicas por paso.
5. Policy Engine decide por acción; Evaluation Engine verifica la viabilidad del
   plan completo.
6. UI muestra objetivo, estrategia, pasos, capacidades, decisiones y evaluación.
   Hasta aquí no hay efectos.
7. Si hace falta, se persiste una aprobación ligada al hash exacto y con
   expiración.
8. Runtime revalida plan, registry, política y aprobación antes de cada paso.
9. El subsistema correspondiente ejecuta con timeout, cancelación y límites.
10. Si un provider pudo recibir el request pero su resultado no es demostrable,
    Runtime detiene el workflow en `remote_state_unknown`; nunca infiere éxito,
    fallo ni cancelación.
11. Evaluation Engine consume evidencia; auditoría persiste la cadena completa y
    sanitizada.

Si no se puede resolver una capacidad, validar un plan o registrar una acción
privilegiada, se falla cerrado.

## Invariantes

- Un preview nunca ejecuta.
- Una capacidad disponible no equivale a autorización.
- Un agente o modelo puede proponer, pero no cambiar strategy, policy o
  evaluation por texto.
- Ningún paso se ejecuta si cambió la versión del registry o el hash del plan.
- No hay llamada directa de proveedor a tool: toda solicitud vuelve al Planner.
- La evaluación posterior usa evidencia ligada a `runId`, `planId` y `stepId`.

## Presupuestos iniciales

- Intención: máximo 2.000 caracteres y 64 capacidades solicitadas.
- Registry: máximo 1.000 capacidades y 32 dependencias por capacidad.
- Plan MVP: máximo 256 pasos; ciclos, duplicados y dependencias faltantes
  bloquean el preview.
- IPC: 1 MiB por mensaje; eventos grandes se paginan o referencian.
- Arranque frío objetivo: ≤ 3 s; memoria idle objetivo: ≤ 350 MB, ambos medidos.
- Salida visible: buffer máximo 1 MiB por stream y spool acotado.

Los valores se ajustan con medición y ADR, no silenciosamente.

## Fallos y recuperación

- Runs no terminales pasan a `orphaned` al reiniciar; los attempts que pudieron
  despacharse pasan además a `remote_state_unknown`.
- Un crash no reinicia automáticamente una acción remota incierta, aunque el
  provider declare idempotencia; una recuperación es explícita y auditada.
- Un snapshot de registry obsoleto obliga a replanificar.
- Corrupción de DB abre recuperación de solo lectura.
- Una evaluación bloqueada conserva motivos estructurados y no ofrece ejecutar.

## Estructura objetivo mínima

```text
apps/desktop/
packages/contracts/
packages/orchestration-engine/
packages/policy-engine/
packages/runtime/
packages/workspace/
packages/provider-adapters/
packages/coordination-contracts/
packages/agents/
packages/workflows/
packages/memory/
packages/persistence/
packages/ui/
tests/integration/
tests/e2e/
docs/
```

Los paquetes se crean cuando tienen un límite real; no se generan carpetas
vacías para aparentar avance.

La coordinación compuesta de M6 y sus límites se detallan en
[Workflows, agentes y memoria](workflows-agents-memory.md). El Orchestration
Engine sigue sin importar esos paquetes.
