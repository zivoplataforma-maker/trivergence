# Threat model

Estado: baseline general hasta M6  
Método: STRIDE simplificado por frontera

## Activos

- archivos y repositorios del usuario;
- conversaciones, notas y memoria local;
- capacidad de ejecutar procesos y cambiar Git;
- configuración, aprobaciones y auditoría;
- credenciales gestionadas por CLI/OS, aunque Trivergence no deba accederlas;
- integridad del binario, actualizaciones y dependencias.
- integridad de intención, estrategia, plan, registry y evidencia de evaluación.

## Adversarios y fuentes no confiables

- archivo del repositorio con prompt injection o payload de parser;
- repositorio malicioso con symlinks/junctions, hooks o nombres patológicos;
- salida ANSI/JSON/Markdown manipulada por proceso o proveedor;
- servidor MCP o sitio remoto hostil;
- paquete/dependencia comprometido;
- proceso local del mismo usuario que modifica archivos entre preview y
  ejecución;
- renderer comprometido mediante XSS;
- usuario confundido por una aprobación ambigua.

Fuera del modelo MVP: administrador local malicioso, kernel comprometido, acceso
físico sin cifrado de disco y aislamiento fuerte frente a otros procesos del
mismo usuario.

## Fronteras

1. UI ↔ preload/main.
2. Coordinator ↔ worker privilegiado.
3. Workspace ↔ filesystem fuera del workspace.
4. Runtime ↔ procesos externos.
5. Equipo local ↔ red/proveedores/MCP.
6. App instalada ↔ canal de actualización.
7. Orchestration Engine ↔ subsistemas y sus descriptores/evidencia.

## Amenazas prioritarias y controles

| ID   | Amenaza                                          | Impacto                        | Controles P0                                                                                              |
| ---- | ------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| T-01 | XSS llega a APIs de host                         | RCE/lectura de datos           | Contenido local, CSP, aislamiento, sandbox, bridge nominal, validación de sender.                         |
| T-02 | Path traversal o junction escapa del workspace   | Escritura/lectura arbitraria   | Canonización, `realpath`, handle/revalidación previa, reglas de raíz y tests Windows.                     |
| T-03 | Command injection                                | RCE                            | Ejecutable + argv, `shell:false`, catálogo de tools, sin `eval`, preview exacta.                          |
| T-04 | Aprobación reutilizada para otra acción          | Elevación lógica               | Hash canónico, expiración, un uso, bind a workspace/perfil/run.                                           |
| T-05 | Prompt injection ordena una tool peligrosa       | Pérdida/exfiltración           | Contenido siempre datos, policy engine fuera del modelo, confirmaciones y límites.                        |
| T-06 | Contexto contiene secreto                        | Exfiltración                   | Denylist obligatoria, ignore, scan, selección visible, redacción y modo privado.                          |
| T-07 | Parser de proveedor acepta formato desconocido   | Acción incorrecta              | Matriz por versión, schemas estrictos, fixtures, abortar eventos críticos desconocidos.                   |
| T-08 | Cancelar deja descendientes                      | Procesos persistentes          | Supervisor/Job Object verificado; estado orphaned y autonomía bloqueada si falla.                         |
| T-09 | Terminal escape sequence engaña/actúa sobre host | Confusión/abuso clipboard      | xterm actualizado, features peligrosas desactivadas, no confiar en title/links, sanitizar logs.           |
| T-10 | Auditoría omitida o alterada                     | Falta de trazabilidad          | Escritura transaccional, secuencia/hash encadenado P1, export con manifest; fail-closed privilegiado.     |
| T-11 | `openExternal` con esquema hostil                | Ejecución local                | Parser URL, solo HTTPS allowlist/confirmación, denegar file/custom protocols.                             |
| T-12 | Dependencia comprometida                         | RCE en build/app               | Lockfile, revisión de scripts, SBOM, scanning, updates controlados y releases reproducibles.              |
| T-13 | SQLite o backup corrupto                         | Pérdida de datos               | WAL/backup API, integrity check, migración transaccional, restauración a staging.                         |
| T-14 | DoS por archivo/salida enorme                    | Congelamiento/disco lleno      | Límites de bytes, profundidad, tiempo, cuotas y backpressure.                                             |
| T-15 | CLI falsa primero en PATH                        | Ejecución maliciosa            | Mostrar ruta/editor, firma/hash cuando sea posible, confirmación al cambiar resolución.                   |
| T-16 | Capability Registry adulterado                   | Plan usa capacidad falsa       | Snapshot versionado, schemas estrictos, provenance y revalidación antes de ejecutar.                      |
| T-17 | Dependencia cíclica o plan sobredimensionado     | DoS/flujo ambiguo              | DFS acotado, máximo de nodos/dependencias, detección de ciclos y fallo cerrado.                           |
| T-18 | Strategy/evaluation manipulada por contenido     | Bypass de control              | Motores deterministas fuera de agentes/modelos; motivos y versiones auditables.                           |
| T-19 | Evidencia falsa o perteneciente a otro run       | Éxito incorrecto               | Bind a run/step/plan, schema, provenance y correlación; evidencia desconocida no aprueba.                 |
| T-20 | Checkpoint manipulado o reutilizado              | Replay/resultado inconsistente | Digest de request/cursor, bind a plan/step/adapter, estado active/consumed y validación antes de recover. |
| T-21 | Stream altera control o falla el observador      | Bypass/DoS de ejecución        | Eventos tipados e informativos, secuencia/correlación, callback aislado; nunca otorga autoridad.          |
| T-22 | Retry ilimitado multiplica efectos o coste       | Efectos duplicados/agotamiento | Política explícita, un solo retry local, budgets y aprobación nueva en recuperación persistente.          |

## Prompt injection

No existe un “filtro de prompt injection” suficiente. La defensa es
arquitectónica:

- instrucciones de sistema/política no se obtienen del workspace;
- un texto no puede aprobar acciones;
- tools aceptan contratos estrechos, no shell libre;
- todo contexto conserva provenance;
- resultados web/archivo se etiquetan como no confiables;
- una propuesta multiagente no altera rulesets;
- las aprobaciones sensibles requieren UI local y gesto reciente.

## Privacidad de red

Antes de un run cloud, la UI muestra proveedor, modalidad, workspace,
archivos/fragmentos, tamaño aproximado y si los términos indican tratamiento
distinto según la cuenta. El MVP no puede saber con certeza el plan o la
retención del proveedor; muestra “verificar con proveedor” en vez de inferirlo.

El Reference Provider declara `networkRequired: false` y destino
`local://reference-provider`. Su preview y sus checkpoints solo conservan
tamaños, identificadores y digests; no persisten prompt, contexto ni respuesta.
Esta condición local no es heredable por un adaptador remoto.

Las amenazas específicas de workflows, agentes, memoria, budgets compartidos y
provenance se evalúan en [Threat model M6](threat-model-m6.md).

## Validación

- tests unitarios de traversal, perfiles, hashing y redacción;
- IPC fuzz/property tests con payloads inválidos y sobredimensionados;
- fixtures de ANSI/JSON hostil;
- E2E sin CLI, versión desconocida, cancelación y auditoría caída;
- E2E de Reference Provider con aprobación, streaming, budgets, cancelación,
  checkpoint persistido, reinicio de Runtime, nueva aprobación y consumo único;
- revisión manual Electron security checklist en cada release;
- dependency review, SBOM y CodeQL antes de beta pública.

## Riesgo residual

Una acción aprobada puede ser dañina, un detector puede no reconocer un secreto
y una CLI oficial puede cambiar o ser comprometida. Trivergence reduce y hace
visible el riesgo; no convierte la ejecución de agentes sobre un host en una
actividad segura por definición.
