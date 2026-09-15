# Roadmap de Trivergence

El roadmap usa puertas de evidencia, no porcentajes subjetivos. El orden refleja
que Trivergence es un sistema de orquestación: primero decide y explica; después
ejecuta y conecta subsistemas.

## P2 — product hardening y preparación de M5

Estado: `DONE` para el alcance interno de consolidación, sin activar conectores.
Los gates locales y la
[CI Windows 34966426691](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34966426691)
pasaron.

- recorrido Objective-first visible y unido a los estados reales de Strategy,
  preflight, aprobación, Runtime, postflight y evidencia;
- frontera única `AdapterHost` obligatoria para todo `ProviderStepDispatcher`;
- suite de conformidad reutilizable de 14 checks aprobada por Reference
  Provider, incluida recuperación tras interrupción y fail-closed hostil;
- estados de proveedor con invariantes y disponibilidad separada de gate y
  habilitación;
- summaries/errores persistidos sanitizados en modo privado;
- seis capturas reales preparadas como assets, sin alterar el README público.

P2 reduce riesgo de integración, pero no constituye un gate externo. El
siguiente paso M5 sigue siendo obtener aprobación técnica/contractual/legal para
una ruta oficial exacta y recién entonces implementar su adaptador contra esta
suite. M5 y M7 permanecen `PARTIAL`.

## Preparación de proveedores sin API keys (2026-09-14)

Interfaz y preferencias locales terminadas y verificadas. Los cuatro candidatos
se muestran bloqueados con estado separado de instalación, autenticación, gate y
ejecución. Ollama local permite guardar únicamente loopback/modelo; todavía no
se conecta ni se habilita. El siguiente trabajo de M5 sigue siendo gate oficial
individual, autenticación autorizada, adaptador por ProviderHost y verificación
E2E antes de ejecutar cualquier proveedor. Las APIs con key y facturación
independiente se mantienen como extensión futura fuera del flujo principal.

M5 y M7 continúan `PARTIAL`; el rediseño no cambia esos hitos.

## P1 transversal hacia v1.0 (sin nuevas funciones grandes)

Estado: `DONE` para estos controles tras los gates locales y la
[CI Windows 34903034199](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34903034199).

Historial y auditoría por workspace, recuperación visible desde el arranque,
privacidad local con memoria privada temporal, retención/borrado/exportación,
descripción precisa del journal, versión única y licencia/notices del proyecto
se implementan como controles de la versión actual. La cadena append-only,
backups, cuarentenas y exportaciones anteriores no se borran automáticamente. La
revisión completa de notices de dependencias empaquetadas y los gates de
distribución siguen en M7 `PARTIAL`; ningún proveedor externo se habilita.

## P0 transversal hacia v1.0 (sin avance de M7)

Estado: `DONE` para P0 tras los gates frescos y el run Windows
[34871238822](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34871238822).
En código local están implementados, en el orden acordado: recuperación de gates
y diagnóstico Electron/Runtime, rutas por objetivo en Strategy, `AdapterHost`
único, Evaluation preflight/postflight, provider IDs extensibles y UI objetivo
primero con historial/recuperación/ privacidad. Git se inicializó y la CI
Windows quedó definida. El Reference Provider sigue siendo la única
implementación ejecutable. Los gates remotos, la distribución M7 y el gate
externo M5 son puertas distintas.

## M0 — especificación y riesgos

Estado: `DONE`

- propósito, PRD, arquitectura, ADR, threat model, privacidad y UI coherentes;
- límites de proveedores y preguntas bloqueantes visibles.

## M1 — foundation segura

Estado: `DONE`

- monorepo reproducible y shell Electron aislado;
- contratos IPC, diagnóstico local y Policy Engine puro;
- pruebas unitarias, build y smoke.

## M2 — kernel de orquestación

Estado: `DONE`

- Strategy Engine, Execution Planner, Capability Registry y Evaluation Engine;
- contratos versionados y preview inerte desde UI;
- detección de dependencias faltantes/cíclicas y decisiones de policy por paso;
- pruebas unitarias y de integración sin Runtime ni proveedor.

Puerta de salida: una intención de diagnóstico produce una estrategia, un plan
de dos pasos y una evaluación explicable; no causa efectos y no rompe los IPC de
M1. Verificado mediante E2E sobre el build de Electron.

## M3 — Runtime, aprobaciones y auditoría

Estado: `DONE`; integridad, persistencia, aprobaciones de un uso, Runtime,
evidencia, timeout, cancelación y recuperación de orphan verificados. El árbol
de procesos Windows se probó con padre y descendiente reales.

- persistencia/hash de plan y snapshot del Registry;
- supervisor de procesos con cancelación de árbol verificada;
- aprobaciones ligadas a paso/plan y revalidación antes de efectos;
- evidencia de ejecución y auditoría correlacionada de extremo a extremo.

## M4 — workspace y primeras capacidades reales

Estado: `DONE`; backend, integración de escritorio y gate automatizado de la
prioridad 6 verificados.

- `DONE`: workspace canónico, identidad revalidada, límites, exclusiones y
  junctions/symlinks;
- `DONE`: lectura, búsqueda literal y Git status/diff de solo lectura;
- `DONE`: adapters publican capacidades y una fixture completa intención → plan
  firmado → Runtime → evidencia;
- `DONE`: selección nativa, preview persistido, ejecución/cancelación por
  referencias opacas, resultados y evidencia visibles en la app;
- `DONE`: axe, recorrido de teclado y reflow al 200 % del flujo crítico. La
  prueba humana con Narrator se conserva como gate previo a beta.

Watch seguro, snapshots y escritura atómica no forman parte del gate read-only
de M4; se difieren al hardening de M7 y requieren contratos/ADR propios.

## M5 — primer conector estructurado

Estado: `PARTIAL`; expediente técnico/contractual/legal, infraestructura
provider-agnostic y Reference Provider local verificados. La activación de cada
proveedor externo continúa `BLOCKED` hasta su dictamen humano y confirmaciones
aplicables, sin bloquear M6 o M7.

- `DONE`: metodología, comparación oficial y matriz por ruta/autenticación;
- `DONE`: publicación fail-closed ligada a observación, attestation, fixtures,
  tres revisiones, trust store, preferencia y modo privado;
- `DONE`: contrato ejecutable de Provider Adapter, dispatcher genérico,
  transporte local streaming, cancelación, budgets, approvals, preview de
  contexto, provenance, errores y recuperación persistente;
- `DONE`: Reference Provider local probado desde Orchestration Engine hasta
  Runtime, persistencia, evidencia y UI, sin red ni credenciales;
- `PENDING`: gate legal y contractual aprobado para cuentas/caso de uso exactos;
- `PENDING`: un adaptador oficial con fixtures por versión, parser del protocolo
  aprobado y destino de red exacto.

Codex App Server es el primer candidato recomendado, no un proveedor habilitado.
Claude Platform mediante `ant` queda segundo y Gemini sobre Vertex AI como ruta
empresarial. Gemini CLI OAuth y Claude Code Pro/Max OAuth están rechazados para
automatización de terceros.

## M6 — workflows, agentes y memoria

Estado: `DONE`; verificado el 2026-09-10 con capacidades locales y el Reference
Provider. Ningún workflow convierte esa base de prueba en autorización para un
proveedor externo.

- `DONE`: workflow declarativo `workflow.local.team-memory-evaluation@1.0.0`
  expandido en cinco capabilities por el Planner existente;
- `DONE`: agentes planner/critic/synthesizer sin autoridad de policy/tools y
  restringidos al Reference Provider local;
- `DONE`: memoria por workspace con budgets, provenance, TTL, borrado y poda;
- `DONE`: una reparación máxima con llamadas, bytes, coste y tiempo compartidos;
- `DONE`: checks de integridad/provenance, cinco evidencias y auditoría sin
  objetivo/output;
- `DONE`: contratos, ADR-0009 y threat model M6;
- `DONE`: lint, typecheck, 105 tests, build y Electron E2E.

Puerta de salida: una intención real llega a Strategy/Orchestration Engine,
equipo, workflow, memoria, evaluación y resultado auditable; tampering,
overbudget y provider externo fallan cerrado. Verificado sin modificar los
cuatro motores del núcleo.

## M7 — beta local

Estado: `PARTIAL`; hardening y preparación Windows implementados y verificados
localmente el 2026-09-11. M7 no se marca `DONE` porque la evidencia de
distribución todavía es incompleta.

- `DONE`: watch seguro con debounce, exclusiones, cola acotada y `overflow`;
- `DONE`: snapshots SHA-256, escritura atómica, journal, recuperación
  fail-closed y rollback sin sobrescribir cambios inesperados;
- `DONE`: cuarentena de SQLite ilegible, backup validado y activación atómica
  con base desplazada preservada;
- `DONE`: Electron fuses, ASAR íntegro, NSIS x64, ciclo local
  install/start/uninstall, SBOM CycloneDX 1.7 y manifest SHA-256;
- `DONE`: verificador de update Ed25519/HTTPS/allowlist/anti-downgrade,
  mantenido explícitamente deshabilitado;
- `DONE`: 115 tests, lint, typecheck, build, Electron E2E/smoke y auditoría con
  cero vulnerabilidades conocidas;
- `PARTIAL`: el payload `app.asar` es byte-reproducible; el gate detecta hashes
  distintos del instalador NSIS entre dos builds;
- `PENDING`: Authenticode válido, identidad editorial y custodia de claves;
- `PENDING`: clean install/upgrade/rollback/uninstall independientes en Windows
  10 y 11, más segunda máquina/runner de build;
- `PARTIAL`: licencia Apache-2.0 y notices del repositorio presentes; falta
  revisión de obligaciones de dependencias empaquetadas.
- `PENDING`: canal autenticado de update aprobado.

El instalador actual se llama deliberadamente `UNSIGNED` y no es distribuible.
Codex, Claude y Gemini siguen bloqueados; M5 permanece `PARTIAL`.

## Extensiones posteriores

Conversaciones, FTS5, notas/tareas, exportación avanzada, vistas auxiliares,
MCP, segundo conector, revisión cruzada, WSL2/Docker, documentos y embeddings se
entregan después de M7 como subsistemas independientes. Paralelismo, consejo,
torneo y marketplace requieren ADR, budgets y threat model propios.

## Fuera del compromiso actual

- fecha pública y auto-update habilitado antes de completar sus gates;
- paridad con IDEs o asistentes existentes;
- modelo de IA propio;
- automatización de Claude por credenciales de suscripción;
- soporte macOS/Linux.
