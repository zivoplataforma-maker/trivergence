# Modelo de datos conceptual

## Principios

- IDs UUID/ULID generados localmente; no contienen ruta ni proveedor.
- Timestamps UTC ISO-8601 y reloj monotónico adicional para duración de runs.
- Foreign keys activas y migraciones versionadas.
- Soft delete solo donde la recuperación aporta valor; secretos nunca se
  “soft-deletean”.
- Auditoría y conversaciones tienen políticas de retención separadas.

La implementación usa `node:sqlite` detrás de un adaptador propio según
ADR-0003. Las tablas de M3 y la memoria acotada de M6 ya están migradas; los
agregados restantes continúan siendo modelo objetivo.

## Agregados M1–M3

### Orquestación

`orchestration_requests`, `capability_snapshots`, `strategies`,
`execution_plans`, `plan_steps`, `plan_evaluations`, `evaluation_checks`

- una request conserva intención, perfil y capacidades solicitadas, no un
  comando libre;
- P0 permite cero capacidades solicitadas: Strategy deriva rutas del objetivo y
  conserva las candidatas/selección en el artefacto versionado;
- strategy, planner y evaluator guardan su versión;
- el plan referencia el snapshot exacto del Capability Registry y se hashea con
  canonical JSON v1 + SHA-256 antes de autorizar;
- los pasos forman un DAG por IDs, con actions y decisiones de policy
  normalizadas;
- una reevaluación agrega una revisión; no sobrescribe la evidencia histórica.
- preflight y postflight son fases distintas; la auditoría de postflight
  registra estado y digest de checks sin contenido de output;
- `registry_snapshot_id` y `plan_digest` son campos separados: un digest válido
  no sustituye la comprobación de vigencia del Registry.

### Workspace

`projects`, `workspaces`, `workspace_exclusions`, `snapshots`

Un workspace conserva ruta canónica y un fingerprint no secreto. La app no sigue
automáticamente una ruta movida o sustituida sin pedir confirmación.

### Ejecución coordinada

`runs`, `run_steps`, `agent_runs`, `tool_calls`, `approvals`, `audit_events`

- `runs` referencia plan, strategy y capability snapshot; un agente es un
  subsistema posible, no la raíz de toda ejecución.
- `approvals` guarda hash de plan/paso, estado, vencimiento, decisión y actor
  local; nunca comando editable.
- `tool_calls` conserva input/output sanitizado o referencias a blobs locales
  con retención.
- `audit_events` es append-only a nivel de repositorio. Correcciones se agregan
  como eventos.

### Configuración

`provider_installations`, `provider_sessions`, `settings`

`provider_sessions` solo guarda IDs públicos/operativos, estado y metadatos no
sensibles. No guarda tokens, cookies, authorization codes ni contenido de
credential stores.

## Historial P0

La migración `0005_objective_history_privacy` añade `workspace_id` y
`privacy_mode` a las requests persistidas. La consulta de historial hace join de
run, objetivo y estrategia, limita resultados al workspace activo y no devuelve
el contenido de output. El ID del workspace deriva de la ruta canónica, lo que
permite reabrir su historial sin persistir un identificador aleatorio de sesión.
Desde `0006_privacy_retention`, una nueva solicitud privada conserva un marcador
en vez del texto del objetivo y elimina los argumentos del paso de su artefacto
persistido. La memoria del workflow privado es temporal y no recupera entradas
guardadas. Las solicitudes estándar y las privadas anteriores a esta migración
conservan los datos que ya estaban en la base.

## Memoria M6

`memory_entries`

- namespace de workspace, contenido y digest se guardan como datos funcionales;
- provenance liga run, plan, step, workflow, equipo y Reference Provider;
- `expires_at` aplica retención y `deleted_at` conserva un tombstone;
- al borrar/expirar se vacían `content` y `provenance_json` en la misma
  transacción; el trigger de `0006` admite únicamente esa redacción controlada;
- eventos de commit/delete/prune contienen IDs y digests, nunca contenido.

## Agregados posteriores

`conversations`, `messages`, `attachments`, `notes`, `tasks`, memoria semántica,
`workflow_versions` editables, `indexed_files`, `file_chunks`, tablas virtuales
FTS5, `mcp_servers`, `mcp_tools`.

Un mensaje borrado deja como máximo un tombstone de integridad si está
referenciado por auditoría; el contenido desaparece. Los chunks se invalidan por
hash de archivo y versión del indexador.

## Backups

- SQLite Online Backup API o mecanismo equivalente consistente; nunca copiar un
  WAL activo a ciegas.
- Manifest con versión de esquema, hashes y fecha.
- El backup no está cifrado; la UI y la documentación advierten que copias y
  exportaciones pueden contener datos legibles.
- Restauración siempre a una nueva ubicación temporal, validación de integridad
  y swap recuperable.

## Retención inicial

- audit metadata: append-only e indefinida; no se borra con un workspace;
- outputs completos de procesos: efímeros en la implementación actual;
- temporales: eliminados al cierre exitoso o recuperados/depurados al próximo
  inicio;
- memoria M6: 30 días por defecto por ejecución, 1–365 días configurables;
- historial y registros activos por workspace: política de 1–365 días aplicada
  solo tras guardarla explícitamente, más borrado manual confirmado;
- conversaciones/notas futuras: hasta eliminación explícita.

El borrado no elimina backups, cuarentenas ni exportaciones anteriores.
