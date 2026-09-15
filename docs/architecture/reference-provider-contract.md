# Contrato ejecutable de Provider Adapter

Estado: implementado y verificado con el Reference Provider local  
Versión del contrato: `1`

## Propósito y límite

Este contrato permite que el Runtime ejecute una capacidad de proveedor sin que
el Orchestration Engine conozca SDK, autenticación, protocolo o formato de un
proveedor concreto. El motor solo planifica una capability tipada. El puente
genérico `ProviderStepDispatcher` transforma ese paso en un descriptor inmutable
y delega mediante el único `AdapterHost` de la sesión al `ProviderAdapter`
registrado. Los agentes M6 usan ese mismo host; no invocan adaptadores
directamente.

El Reference Provider es una implementación local, determinista y sin red. No
representa a Codex, Claude, Gemini ni a otro servicio, no usa credenciales y no
otorga aprobación contractual a ningún conector externo.

## Superficie obligatoria

Todo adaptador implementa:

- `manifest`: identidad y digest del build, proveedor, transporte, condición
  local y política de recuperación;
- `prepare(requestId, input)`: valida la entrada y produce un preview estable;
- `execute(request, options)`: ejecuta con `AbortSignal` y emite eventos
  estructurados;
- `recover(request, checkpoint, options)`: verifica y reanuda desde un
  checkpoint compatible.

`prepare` debe ser determinista para una misma solicitud y no puede provocar
efectos, abrir red ni iniciar autenticación. El descriptor derivado se liga al
plan y a una aprobación de un solo uso. Runtime vuelve a generarlo justo antes
de ejecutar o recuperar y aborta si cambió.

## Preview de contexto y aprobación

El preview contiene proveedor, operación, transporte, destino, necesidad de red,
clasificación/tamaño/digest de cada elemento de contexto, presupuesto, versión y
digest del adaptador, digest de request y política de recuperación. No contiene
el prompt ni el contexto crudo.

Para un adaptador remoto, `networkRequired` debe ser `true` y el destino exacto
debe aparecer en `networkDestinations`. La aprobación queda ligada al descriptor
completo; cambiar contexto, destino, budget, versión o build invalida el uso.

## Transporte y streaming

El contrato reconoce `in_memory_stream`, `stdio_jsonl` y `http_stream`. Que un
transporte esté tipado no lo habilita: cada implementación externa sigue su gate
y attestation.

Los eventos válidos son `started`, `delta`, `usage`, `checkpoint`, `completed` y
`error`. Cada evento lleva `requestId`, secuencia monotónica y hora de
observación. Runtime valida nuevamente el schema, lo correlaciona con
run/plan/step/capability y trata al observador de UI como no confiable: un fallo
del callback no altera la ejecución.

El stream es informativo. Nunca concede permisos, modifica el plan ni ejecuta
solicitudes de herramientas. Una tool solicitada por un proveedor debe volver a
entrar como capability/acción por Planner, Policy Engine y aprobación.

## Budgets y cancelación

Los límites obligatorios son bytes de entrada, bytes de salida, número de
chunks, tiempo y coste en microunidades. La entrada se rechaza en `prepare`; los
otros límites fallan cerrado durante la ejecución. El resultado contabiliza lo
realmente consumido incluso cuando termina por límite, cancelación o error.

La cancelación usa el `AbortSignal` del run exacto. El adaptador debe detener su
transporte y devolver `cancelled`; el timeout interno devuelve `timed_out`. Un
adaptador de proceso deberá además satisfacer las garantías de kill-tree del
Runtime; el Reference Provider no crea procesos.

## Errores

Los códigos estables son:

- `invalid_request`, `input_budget_exceeded`, `output_budget_exceeded`;
- `chunk_budget_exceeded`, `cost_budget_exceeded`, `timed_out`, `cancelled`;
- `transport_error`, `protocol_error`, `recovery_unavailable`.

Todo error declara si es reintentable. Datos desconocidos o inválidos se
convierten en `protocol_error`; nunca se interpretan de forma permisiva. El
resultado conserva outcome, usage, provenance y, cuando existe, el último
checkpoint válido.

## Recuperación persistente

Un checkpoint incluye digest de request, próximo chunk, bytes emitidos, cursor
opaco y digest de integridad. Runtime persiste el registro ligado a
run/plan/step/capability/adapter/proveedor, sin persistir prompt ni respuesta.

La recuperación exige simultáneamente:

1. checkpoint `active` y de un solo uso;
2. coincidencia exacta de plan, step, capability, adapter y proveedor;
3. mismo digest de request y validación interna del cursor/digest;
4. dispatcher con soporte explícito de recuperación;
5. una aprobación nueva para la nueva ejecución.

Después del éxito, el checkpoint queda `consumed`. La recuperación automática
del Reference Provider se limita a un intento desde el último checkpoint. No hay
reintentos infinitos ni replanificación implícita.

## Provenance y evidencia

El resultado registra adapter id/version/build digest, provider id, transporte,
digests de request/context, `localOnly`, uso de recuperación y timestamps. El
Runtime calcula un digest del resultado, guarda evidencia correlacionada y no
usa la respuesta como prueba de autorización.

## Reference Provider

La capability `provider.reference.prompt.structured` usa transporte asíncrono en
memoria, coste cero y destino `local://reference-provider`. Implementa éxito,
latencia, fallo no recuperable y fallo recuperable deterministas para probar:

- preview y aprobación;
- streaming ordenado y schemas hostiles;
- cancelación y timeout;
- budgets de entrada, salida y chunks;
- errores tipados, retry único y checkpoint persistente;
- provenance, evidencia y flujo E2E de escritorio.

## Suite de conformidad reutilizable

`runProviderConformanceSuite` es una puerta exportada y agnóstica del framework
de tests. Recibe una factory del adaptador, capability, fixtures hostiles y una
comprobación del límite de aprobación propiedad de Runtime. Devuelve un reporte
por check; no habilita ni registra el proveedor.

La suite exige: declaración de capability, prepare y preview sin contexto crudo,
execute, stream ordenado, cancelación, recuperación acotada, reanudación tras
interrupción, timeout, errores tipados, budgets de entrada/salida, provenance,
aprobación antes del dispatch, rechazo de respuestas malformadas y rechazo de
capabilities no alojadas. El Reference Provider pasa los 14 checks. Los tests
E2E persistentes siguen verificando checkpoints, evidencia y aprobación de un
uso porque esas responsabilidades pertenecen a Runtime, no al adaptador.

## Checklist para un adaptador real después del gate

1. Superar el gate técnico, contractual y legal de la ruta exacta.
2. Publicar capability y attestation solo para versiones y auth aprobadas.
3. Implementar `ProviderAdapter`; alojarlo en un `AdapterHost` explícito y
   reutilizar `ProviderStepDispatcher`.
4. Mapear el protocolo oficial a los eventos y errores del contrato.
5. Aplicar budgets, redacción, cancelación y recuperación del transporte.
6. Pasar la suite de conformidad con fixtures por versión y añadir tests
   específicos de auth, truncado y red.
7. Incorporar el digest de attestation al trust store del release.

No se modifica Strategy Engine, Execution Planner, Capability Registry ni
Evaluation Engine para conectar un proveedor. Si una operación no cabe en este
contrato, se diseña una capability nueva y una revisión del contrato; no se
introducen excepciones por marca dentro del Orchestration Engine.
