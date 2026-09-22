# ADR-0012: envelope provider-agnostic de recovery

Estado: `PROPOSED` — decisión documental; implementación diferida  
Fecha: 2026-09-22

## Contexto

ADR-0011 reemplazó el booleano de recovery por capabilities explícitas. El tipo
persistido actual `ProviderRecoveryCheckpoint` conserva, sin embargo, una forma
propia del Reference Provider: `nextChunkIndex`, `emittedBytes` y
`recoveryCursor`. Esa forma no representa de manera neutral operation IDs,
reconnect cursors, resume tokens o claves de idempotencia.

No se modifica el contrato ejecutable en P3-0. Este ADR define la forma objetivo
que deberá aprobarse antes de una migración.

## Decisión propuesta

Un futuro envelope de recovery debe ser versionado, discriminado, ligado a la
identidad de request/adapter/provider y validado antes de persistirse o usarse.
Debe poder representar como variantes independientes:

- **local stream cursor:** posición, bytes emitidos y cursor del mismo stream
  local;
- **operation identifier:** identidad remota consultable de una operación;
- **reconnect cursor:** posición verificable dentro del stream de esa operación;
- **resume token:** autorización opaca para continuar la misma operación;
- **idempotency identifier:** clave y alcance de deduplicación documentado;
- **provider-specific opaque state:** payload opaco, acotado y validado por un
  schema versionado del adapter, nunca JSON arbitrario sin límites.

El envelope común debe incluir, como mínimo:

- versión de schema y tag de variante;
- adapter/provider/capability y versión/digest del adapter;
- request y context digests;
- operation identity cuando exista;
- instante de observación y estado remoto observado;
- digest del propio envelope;
- límites de tamaño y política de redacción/retención.

`nextChunkIndex`, `emittedBytes` y `recoveryCursor` quedan reconocidos como la
**variante local stream cursor existente**, no como semántica universal.

## Invariantes

1. Un envelope no demuestra por sí solo que el estado remoto sea terminal.
2. Un token/cursor solo se usa con el mismo request digest, adapter identity y
   capability para los que fue emitido.
3. Estado opaco no concede autoridad ni habilita retry automático.
4. Payload desconocido, sobredimensionado, expirado o con schema no confiable
   falla cerrado.
5. Persistir una clave de idempotencia no convierte una operación en
   idempotente; la garantía debe estar declarada y probada.
6. Migrar checkpoints históricos no puede elevar sus capabilities.

## Compatibilidad y migración futura

La implementación futura debe introducir una nueva versión, leer la variante
local histórica de forma explícita y mantenerla limitada al Reference Provider
hasta probar otra equivalencia. No debe reinterpretar registros anteriores como
operation IDs ni exact recovery.

## Consecuencias

El modelo podrá expresar providers heterogéneos sin diseñarse alrededor del
Reference Provider. A cambio, aumentan schemas, migraciones, fixtures y reglas
de retención. Ninguna consecuencia autoriza un provider externo ni modifica hoy
`ProviderAdapter`, `AdapterHost`, Runtime o persistence.

## Deuda técnica registrada

El tipo ejecutable actual sigue acoplado al cursor local. Resolverlo requiere
código, migración y tests en una fase posterior aprobada.
