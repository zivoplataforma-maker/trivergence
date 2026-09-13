# ADR-0003 — `node:sqlite` como frontera de persistencia

Estado: aceptado  
Fecha: 2026-08-04

## Contexto

La especificación inicial proponía `better-sqlite3` y Drizzle. Ese stack añade
un módulo nativo que debe reconstruirse para el ABI de Electron y, para usar
`node:sqlite`, la documentación actual de Drizzle dirige a versiones release
candidate. Electron 43.2 incorpora Node 24.18 y el baseline local usa Node
24.14; ambos ofrecen `DatabaseSync` y SQLite Online Backup API sin un addon.

La persistencia es un subsistema coordinado, no parte del dominio del
Orchestration Engine. El núcleo sólo debe compartir contratos y artefactos
íntegros con él.

## Decisión

P0 usa `node:sqlite` directamente detrás de `@trivergence/persistence`. El resto
del sistema no importa tipos de SQLite ni ejecuta SQL. No se añade un ORM
mientras el driver correspondiente permanezca inestable o no aporte una ventaja
concreta al alcance actual.

El adaptador aplica estas reglas:

- una conexión síncrona de escritura por base dentro del proceso y una sola
  instancia de Electron;
- migraciones SQL ordenadas, con checksum y una transacción por migración;
- tablas `STRICT`, foreign keys, WAL, `synchronous=FULL`, `trusted_schema=OFF` y
  extensiones deshabilitadas;
- todos los valores externos se insertan con prepared statements;
- request, snapshot, estrategia, plan, pasos y evaluación se persisten en una
  transacción junto con su evento de auditoría;
- runs sólo pueden referenciar la combinación exacta de request, plan, snapshot
  y digest persistida;
- evidencia sólo puede referenciar su run, plan y paso mediante foreign keys;
- auditoría append-only con triggers, secuencia y cadena SHA-256;
- si `quick_check` o la cadena fallan, la conexión de escritura se cierra y la
  base se vuelve a abrir físicamente en modo read-only;
- backup mediante Online Backup API, manifiesto SHA-256 y restauración a una
  ruta nueva. El subsistema nunca sustituye automáticamente la base activa.

## Consecuencias positivas

- no hay rebuild ni superficie de suministro de un addon SQLite;
- las pruebas usan el mismo API que incluye Electron;
- migraciones, integridad y recuperación tienen una frontera pequeña y
  reemplazable;
- una caída de auditoría bloquea por diseño las acciones privilegiadas.

## Costes y riesgos

- `node:sqlite` continúa marcado como release candidate; se fijan las versiones
  de Node/Electron y se mantienen contract tests del adaptador;
- el SQL y el mapeo de filas son explícitos y requieren disciplina adicional;
- el hash de auditoría detecta alteraciones, pero no es una firma frente a un
  atacante con control del equipo;
- el cifrado de backups sigue fuera de P0 y debe comunicarse en UI.

## Alternativas

- **`better-sqlite3` + Drizzle:** válido si el API integrado retrocede o si el
  modelado futuro justifica el coste de ABI y rebuild. No se adopta en P0.
- **Drizzle sobre `node:sqlite`:** se reevalúa cuando su driver estable esté
  disponible y una migración automatizada aporte valor comprobable.
- **Copiar el archivo `.db`:** descartado porque un WAL activo puede producir
  una copia inconsistente.

## Criterios de reversión

Se reconsiderará esta decisión si Electron deja de incluir un API compatible, si
una regresión de estabilidad afecta datos reales o si las necesidades de
migración superan de forma medible el adaptador. La sustitución debe conservar
los contratos públicos, fixtures de backup y pruebas de recuperación.
