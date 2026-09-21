# Persistencia y auditoría

Estado: implementado para las prioridades 3 y 8  
Paquete: `@trivergence/persistence`

## Responsabilidad

El subsistema conserva artefactos producidos por el Orchestration Engine y
evidencia del Runtime. No decide estrategia, política, aprobación ni éxito. El
renderer nunca recibe una conexión o una operación SQL.

```text
OrchestrationPreview ─┐
ExecutionRun ─────────┼─► PersistenceStore ─► SQLite
StepEvidence ─────────┘          │
                                └─► evento append-only en la misma transacción
```

## Modelo P0

- `orchestration_requests`: intención, perfil y capacidades solicitadas;
- `capability_snapshots`: identidad y versión exactas del Registry;
- `execution_plans`, `strategies`, `plan_steps`, `plan_evaluations`: artefacto
  evaluado y su digest;
- `execution_runs`: referencia compuesta al request, plan, snapshot y digest;
- `step_evidence`: referencia compuesta al run, plan y paso;
- `approvals`: descriptor, plan digest, action digest, expiración y consumo de
  un uso ligados mediante foreign keys al plan/paso;
- `provider_checkpoints`: cursor y digests de recuperación ligados a
  run/plan/step/capability/adapter/proveedor, con estado `active`/`consumed` y
  unicidad por run/paso;
- `provider_execution_attempts`: frontera durable de dispatch con request
  digest, clase de efecto, capabilities, budget, estado remoto y actor de una
  eventual resolución humana; unicidad por run/paso;
- `memory_entries`: memoria funcional por workspace con contenido/digest,
  provenance, run/plan/step y expiración; un trigger impide reescrituras salvo
  vaciar contenido/provenance al marcar borrado;
- `workspace_retention`: días de retención elegidos explícitamente;
- `audit_events`: metadatos acotados, secuencia y hashes anterior/actual;
- `schema_migrations`: versión, checksum y fecha de aplicación.

Los payloads de auditoría admiten hasta 64 campos escalares. No se guardan
objetivos, outputs completos, tokens, rutas sensibles ni secretos en esos
eventos. Los datos funcionales conservan sus límites Zod antes de llegar a SQL.
Los checkpoints y attempts no contienen prompt, contexto ni respuesta; sus
eventos de auditoría registran únicamente identidad, estados y digests.

En modo privado, las nuevas solicitudes persisten un marcador en vez del
objetivo y un objeto vacío en vez de los argumentos de cada paso. La ejecución
usa el plan vivo en memoria. La exportación JSON del workspace incluye sus
tablas funcionales activas y los eventos vinculados; el borrado físico usa
`secure_delete` y mantiene intacta la cadena de auditoría. No elimina copias
externas, backups ni remanencia forense.

La memoria es la excepción funcional deliberada al principio de outputs
efímeros: su contenido debe persistir para poder ser recordado. Se almacena una
sola vez en `memory_entries`; audit events y `step_evidence` conservan
únicamente identidades, tamaños y digests. Recall valida TTL, digest, provenance
y budgets.

## Apertura y estado seguro

`PersistenceStore.open()` configura la base, ejecuta migraciones pendientes y
verifica `PRAGMA quick_check` más la cadena de auditoría. Si cualquiera falla,
cierra la conexión y llama al camino de recuperación con `readOnly: true` y
`query_only=ON`.

`assertPrivilegedActionsAvailable()` vuelve a comprobar integridad y es el gate
que debe consumir el Runtime antes de efectos. El modo de recuperación permite
lectura/exportación, pero todas las escrituras fallan cerrado.

La aplicación Electron ya usa un single-instance lock. El paquete suma un lock
por ruta dentro del proceso; SQLite serializa las transacciones con
`BEGIN IMMEDIATE`.

## Migraciones

Las migraciones son inmutables y se ordenan por versión. Antes de omitir una ya
aplicada se compara su SHA-256. Cada migración y su registro comparten una
transacción; ante un error se ejecuta rollback y la versión no queda marcada.

No se edita una migración publicada. Una corrección se agrega con una versión
nueva y una estrategia de compatibilidad explícita.

## Backup y restauración

1. Se pausa el escritor del paquete.
2. SQLite Online Backup API crea una imagen consistente en una ruta inexistente.
3. Se validan `quick_check` y la cadena de auditoría.
4. Se calcula SHA-256 y se escribe un manifiesto exclusivo.
5. La restauración valida origen y manifiesto, copia a una ruta nueva y vuelve a
   verificar la copia.

El swap con la base activa requiere una futura operación de mantenimiento con
confirmación y rollback; no forma parte de esta API.

## Evidencia automatizada

Las pruebas cubren:

- persistencia correlacionada de preview, run y evidencia;
- rollback ante referencias de integridad incompatibles;
- un único escritor y lector de recuperación simultáneo;
- triggers contra update/delete de auditoría;
- detección de manipulación y reapertura read-only;
- rollback de una migración inválida;
- creación, validación y restauración de backup.
- transiciones terminales de run, decisiones y consumo atómico de aprobación.
- upsert acotado, consulta y consumo único de checkpoints de proveedor.
- transición cerrada de attempts, UNKNOWN tras crash posterior al dispatch,
  resolución humana atribuida, exportación y borrado por retención.
- commit inmutable, recall acotado, borrado, poda y eventos content-free de
  memoria M6.

La decisión tecnológica y su vía de sustitución están en
[ADR-0003](adr/0003-node-sqlite-persistence-boundary.md).
