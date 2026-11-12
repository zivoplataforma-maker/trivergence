# Trivergence

Orquestador local para Windows con Electron y React. El núcleo vive en `packages/` y la aplicación en `apps/desktop/`. Leé [estado actual](docs/ESTADO_ACTUAL.md), [arquitectura](docs/ARQUITECTURA.md) y [roadmap](docs/ROADMAP.md) antes de modificar comportamiento.

- Usá Node.js 24 o posterior, pnpm 11.19.0 y `pnpm install --frozen-lockfile`.
- Ejecutá `pnpm check:fresh` para validar formato, lint, compilación, tipos y pruebas. Verificá escritorio y empaquetado en Windows cuando el cambio los afecte.
- Hacé cambios pequeños y reversibles. Conservá contratos, compatibilidad de datos y comportamiento salvo cambios justificados. Para migraciones, verificá datos existentes y recuperación.
- Respetá permisos, aprobaciones, límites de presupuesto y fronteras de proveedor. Mantené credenciales fuera del repositorio y servicios pagos sujetos a autorización.
- Actualizá la documentación de la funcionalidad modificada. Indicá el estado de cada tarea y los resultados de las pruebas efectivamente ejecutadas.
- Verificá el destino privado antes de publicar. Conservá cambios locales ajenos a la tarea y el historial remoto.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes,
community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or
instructions before doing anything else.

Rules: - For codebase questions, first run `graphify query "<question>"`
when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for
relationships and `graphify explain "<concept>"` for focused concepts.
These return a scoped subgraph, usually much smaller than
GRAPH_REPORT.md or raw grep output. - Dirty graphify-out/ files are
expected after hooks or incremental updates; dirty graph files are not a
reason to skip graphify. Only skip graphify if the task is about stale
or incorrect graph output, or the user explicitly says not to use it. -
If graphify-out/wiki/index.md exists, use it for broad navigation
instead of raw source browsing. - Read graphify-out/GRAPH_REPORT.md only
for broad architecture review or when query/path/explain do not surface
enough context. - After modifying code, run `graphify update .` to keep
the graph current (AST-only, no API cost).
