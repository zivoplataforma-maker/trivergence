# ADR-0013: conformidad integrada de interrupted recovery

Estado: `ACCEPTED` — decisión arquitectónica; implementación pendiente  
Fecha: 2026-09-22  
Aceptado: 2026-09-22

## Contexto

`interrupted_recovery` no es una propiedad aislada del adapter. El resultado
seguro depende de la composición:

`ProviderAdapter + AdapterHost + Runtime + persistence`.

La suite reusable actual recibe `verifyInterruptedRecoveryBoundary` desde el
fixture. La callback puede comprobar tests externos, pero la suite no observa
por sí misma attempts, remote state, retries, budgets o auditoría. Por tanto, el
fixture puede autoatestiguar el resultado. Los tests específicos de Runtime
aportan evidencia separada, pero no hacen autosuficiente a ese check reusable.

## Decisión

Se mantienen exactamente los 14 IDs públicos de provider conformance. Se separan
dos capas:

1. **Adapter conformance:** manifest honesto, preparación, protocolo, resultados
   tipados, capabilities y rechazo seguro de operaciones no soportadas.
2. **System integration conformance:** ejecución a través de AdapterHost,
   Runtime y persistence, con reinicio real del Runtime/reapertura de storage y
   fallos inyectados en límites conocidos.

`recovery` verifica compatibilidad entre capabilities declaradas y operaciones
del adapter. `interrupted_recovery` solo obtiene PASS desde la segunda capa.

Los fixtures pueden configurar el provider, programar una falla y exponer un
registro inmutable de lo inyectado. No pueden devolver un booleano/veredicto,
escribir el resultado de conformidad ni sustituir las observaciones del harness.
El harness es dueño de las aserciones y calcula el resultado desde interfaces
reales del sistema.

## Escenarios mínimos

| Escenario                            | Observación segura exigida                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| crash pre-dispatch                   | no hubo cruce durable del límite; no se inventa una operación remota            |
| crash durante dispatch               | attempt durable y `remote_state_unknown` si el envío pudo ocurrir               |
| request quizá recibido sin ACK       | UNKNOWN salvo query/deduplicación verificable                                   |
| respuesta terminal perdida           | query terminal verificable o UNKNOWN                                            |
| stream perdido/interrumpido          | reconnect al mismo stream o UNKNOWN; nunca nueva inferencia encubierta          |
| cancelación sin confirmación         | `cancel_requested` y luego estado observado o UNKNOWN                           |
| capabilities de recovery vacías      | rechazo tipado de recovery y límite UNKNOWN seguro                              |
| operation ID/query                   | identidad y respuesta correlacionadas; query no implica resume                  |
| reconnect                            | misma operación, cursor válido y secuencia coherente                            |
| idempotency                          | mismo request/scope/key y garantía vigente; gasto acumulado                     |
| efecto side-effectful o irreversible | cero retry automático inseguro y dependencias detenidas                         |
| Runtime restart + persistence reopen | estado durable reconstruido desde storage, no desde memoria del fixture         |
| conservación de budget/provenance    | consumo nunca reiniciado; digests/identidades conservados                       |
| resolución humana                    | actor, transición y evidencia auditados; nunca conversión silenciosa de UNKNOWN |

## Oráculo observable

El veredicto se deriva, como mínimo, de:

- attempts persistidos y sus transiciones;
- cantidad e identidad de invocaciones observadas en la frontera del host;
- runs y dependencias detenidas o continuadas;
- checkpoints/envelopes activos o consumidos;
- ledger de budget y usage acumulado;
- request/context/provenance digests;
- Evidence terminal solo cuando existe resultado verificable;
- Audit append-only, incluida la resolución humana atribuida.

Los registros del fixture prueban únicamente que el fallo se inyectó en el punto
previsto. No prueban que el sistema reaccionó correctamente.

## Regla de resultado

Un provider sin recovery puede conformar si declara la ausencia, rechaza la
operación no soportada y la integración termina en `remote_state_unknown` con
evidencia de incertidumbre, workflow detenido y cero duplicación automática. Eso
es PASS del límite seguro, no PASS de exact recovery.

Un provider con operation query, reconnect o idempotencia solo pasa los caminos
que declara y demuestra. Ninguna combinación se promueve a `exact_recovery` por
inferencia.

## Compatibilidad y deuda

Los 14 IDs públicos no cambian. La suite futura podrá producir resultados
internos por escenario, agregados bajo `interrupted_recovery`, sin ampliar ni
reducir la superficie pública.

La callback actual `verifyInterruptedRecoveryBoundary` queda registrada como
deuda de autoatestiguación. Esta aceptación no cambia tests ni código y no
afirma que el harness integrado ya esté implementado.
