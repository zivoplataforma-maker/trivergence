# ADR-0012: envelope provider-agnostic de recovery

Estado: `ACCEPTED` — decisión arquitectónica; implementación pendiente  
Fecha: 2026-09-22  
Aceptado: 2026-09-22

## Contexto

ADR-0011 reemplazó el booleano de recovery por capabilities explícitas. El tipo
persistido actual `ProviderRecoveryCheckpoint` conserva, sin embargo, una forma
propia del Reference Provider: `nextChunkIndex`, `emittedBytes` y
`recoveryCursor`. Esa forma no representa de manera neutral operation IDs,
reconnect cursors, resume tokens o claves de idempotencia.

El envelope no puede confundir identidad remota, material de continuación y
garantías de idempotencia. Esos tres conceptos pueden coexistir y tienen
autoridades distintas; por eso no se modelan como variantes mutuamente
excluyentes de una única unión.

## Decisión

La evolución de `ProviderRecoveryCheckpoint` será un envelope versionado con
tres compartimentos independientes y tipados:

1. **Remote operation identity:** provider, adapter, operation ID cuando exista,
   request digest y ámbito de cuenta/proyecto que pueda expresarse sin secretos.
2. **Continuation material:** una variante discriminada para cursor de stream
   local, reconnect cursor, resume token u otra continuación soportada.
3. **Idempotency material:** identificador, scope, garantía declarada, emisor y
   expiración cuando corresponda.

Un envelope puede contener identidad sin continuación, continuación ligada a una
identidad o idempotencia sin cursor. La presencia de un compartimento no infiere
los restantes.

El envelope común incluirá como mínimo:

- versión de schema y versión de canonicalización;
- adapter/provider identity, versión y build digest del adapter;
- request y context digests;
- instante de emisión/observación y expiración aplicable;
- referencia al attempt, provenance y ledger de budget autoritativos;
- estado remoto observado, etiquetado como observación y nunca como autoridad;
- política de retención/redacción y límite máximo de bytes;
- algoritmo y digest canónico de todo el envelope excepto el propio campo de
  digest.

`nextChunkIndex`, `emittedBytes` y `recoveryCursor` forman la variante existente
**local stream cursor**. Esa variante tiene scope local y no adquiere identidad
remota por migración.

## Estado opaco específico del provider

El estado opaco es una extensión de continuación, no una bolsa genérica. Debe
tener namespace del adapter, schema ID, schema version, límite de bytes,
expiración y digest. El adapter que lo emitió debe validarlo antes de
persistirlo y antes de usarlo. El host falla cerrado ante schema desconocido,
adapter/build incompatible, tamaño excesivo, expiración o digest inválido.

Nunca puede contener contraseña, cookie, access/refresh token, API key o
credential-store exportado. Un resume token oficialmente emitido se representa
como material sensible tipado, cifrado mediante la política de secretos aprobada
y con retención mínima; no se degrada a JSON opaco.

## Invariantes

1. Un envelope es material correlacionado, no una capability, autorización,
   approval, evidencia terminal ni permiso de retry.
2. `remote_state_unknown` no se resuelve por la mera presencia de un envelope.
3. Un cursor/token solo se usa con el mismo request digest, adapter identity,
   ámbito y capability para los que fue emitido.
4. Una clave persistida no demuestra idempotencia; la garantía debe estar
   declarada, vigente y probada para ese scope.
5. El envelope referencia budget/provenance autoritativos; no crea saldo nuevo,
   no reinicia consumo y no duplica sus registros.
6. Private mode puede impedir su persistencia. En ese caso se renuncia a la
   recuperación durable que dependa de ese material.
7. Retener el envelope nunca amplía la retención de prompt, contexto, Memory,
   Evidence o Audit.
8. Migrar checkpoints históricos no eleva capabilities ni prueba identidad
   remota.

## Compatibilidad y migración futura

La implementación futura introducirá una versión nueva y un reader explícito
para la variante local histórica. El registro anterior solo podrá migrar a
`continuation.local_stream_cursor`, ligado al Reference Provider y a su request
digest. No se reinterpretará como operation ID, token remoto, idempotency key o
exact recovery.

La migración debe ser monotónica, auditable y conservar el checkpoint original
hasta validar el nuevo digest. Un registro que no pueda validarse queda
inutilizable para recovery; nunca se rellena por inferencia.

## Relación con otras decisiones

- [ADR-0011](0011-recovery-semantics.md) define capabilities, operaciones y el
  tratamiento de incertidumbre.
- [ADR-0013](0013-integrated-interrupted-recovery-conformance.md) define cómo el
  sistema demostrará que consume el envelope de forma segura.
- [ADR-0015](0015-workflow-execution-snapshots.md) prohíbe tratar este envelope
  como estado confirmado de workflow.

## Consecuencias y deuda

El modelo expresa providers heterogéneos sin diseñarse alrededor del Reference
Provider y mantiene separadas identidad, continuación e idempotencia. A cambio,
requiere schemas, migraciones, política de secretos, fixtures, límites y pruebas
de retención/private mode.

El tipo ejecutable actual continúa acoplado al cursor local. Esta aceptación no
modifica `ProviderAdapter`, `AdapterHost`, Runtime o persistence, no habilita
providers y no convierte la decisión en capacidad implementada.
