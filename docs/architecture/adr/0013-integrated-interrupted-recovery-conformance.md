# ADR-0013: conformidad integrada de interrupted recovery

Estado: `PROPOSED` — decisión documental; implementación diferida  
Fecha: 2026-09-22

## Contexto

`interrupted_recovery` no es una propiedad aislada del adapter. El resultado
seguro depende de la composición:

`Adapter + AdapterHost + Runtime + persistence`.

La suite reusable actual recibe `verifyInterruptedRecoveryBoundary` desde el
fixture. Esto permite coordinar tests externos, pero la callback por sí sola
puede autoatestiguar que el límite fue verificado sin que la suite observe
attempts, remote state, retries, budgets o auditoría.

## Decisión propuesta

La conformidad futura debe separar dos capas sin reducir las 14 comprobaciones:

1. **Adapter conformance:** manifest honesto, preparación, protocolo, resultados
   tipados, capabilities y rechazo seguro de operaciones no soportadas.
2. **System integration conformance:** ejecución del adapter real o fixture
   controlado a través de AdapterHost, Runtime y persistence, con fallos
   inyectados en límites conocidos.

`interrupted_recovery` solo se acredita en la segunda capa. Un callback del
fixture puede inyectar el fallo, pero no emitir el veredicto. Las aserciones
deben leer estado y evidencia desde interfaces del harness controladas por la
suite.

## Escenarios mínimos futuros

- crash antes y después del límite de dispatch;
- request posiblemente recibido sin ACK;
- respuesta terminal perdida;
- stream interrumpido;
- cancelación solicitada sin confirmación;
- provider con lista vacía de recovery;
- provider con operation ID/query;
- provider con idempotency guarantee declarada;
- operación side-effectful/irreversible;
- restart del Runtime y reapertura de persistence.

Para cada escenario, la suite debe observar:

- attempt durable y transición de remote state;
- ausencia de retry automático no autorizado;
- detención de dependencias incompatibles;
- preservation de request/context digest, provenance y budget acumulado;
- checkpoint no consumido antes de resultado terminal verificado;
- resolución humana atribuida cuando corresponda;
- exact recovery solo cuando fue declarada y demostrada.

## Regla de resultado

Un provider sin recovery puede conformar si declara lista vacía y el sistema
termina en `remote_state_unknown` con evidencia y sin duplicar efectos. Esto no
es un PASS de exact recovery: es un PASS del límite seguro del sistema.

## Consecuencias y deuda

Los tests de Runtime existentes aportan evidencia real, pero la suite reusable
todavía no controla directamente el harness integrado. La refactorización de
tests queda diferida; P3-0 no modifica tests ni contratos ejecutables.
