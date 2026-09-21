# ADR-0011: semántica de recuperación e incertidumbre remota

Estado: `ACCEPTED`  
Fecha: 2026-09-21

## Problema

El contrato M5 original representaba recovery con
`none | single_checkpoint_retry` y una operación obligatoria `recover`. Ese
modelo describe bien al Reference Provider —un stream local, determinista y
reconstruible por índice de chunk—, pero mezcla dos responsabilidades:

1. **Provider execution recovery:** observar, reconectar, reanudar o repetir de
   forma idempotente la misma operación del proveedor.
2. **Orchestration recovery:** recuperar el estado local de Trivergence sin
   duplicar efectos, ocultar gasto o inventar un resultado remoto.

Un checkpoint local no demuestra que una operación remota continúe existiendo.
Una conversación reanudable tampoco demuestra recuperación del mismo turn. Un
retry que vuelve a generar una respuesta no es recovery exacto. Cuando el
cliente pierde el ACK o la respuesta, success y failure son ambos posibles.

## Evidencia del modelo anterior

- `ProviderAdapterManifest.recoveryPolicy` era binario.
- `ProviderAdapter.recover` era obligatorio incluso para providers sin primitive
  remota de recovery.
- `ProviderRecoveryCheckpoint` modelaba `nextChunkIndex` y `emittedBytes`, una
  forma concreta de checkpoint local.
- `RuntimeEngine` consumía el checkpoint antes de ejecutar `recover`.
- `ProviderStepDispatcher` afirmaba `treeTerminationConfirmed: true` y no
  propagaba estado remoto.
- `timeout`, transport failure y cancelación solo podían finalizar como failed,
  timed_out o cancelled; no existía `remote_state_unknown`.
- las pruebas `recovery` e `interrupted_recovery` exigían reanudar, por lo que
  mezclaban capability del provider con comportamiento seguro del sistema.

## Modelo distribuido

| Escenario                                                  | Afirmación segura                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Muerte antes de persistir intento                          | no existe evidencia de dispatch; no afirmar que ocurrió                       |
| Muerte después de `prepared`, antes del límite de dispatch | `NOT_DISPATCHED`; puede iniciarse solo mediante una decisión normal           |
| Muerte durante envío                                       | `REMOTE_STATE_UNKNOWN`                                                        |
| Provider recibió request pero se perdió ACK                | `REMOTE_STATE_UNKNOWN`, salvo query/idempotencia verificable                  |
| Provider empezó y el cliente murió                         | `REMOTE_STATE_UNKNOWN`, o `RUNNING` si un operation ID puede consultarse      |
| Provider terminó y se perdió respuesta                     | `REMOTE_STATE_UNKNOWN`, o estado terminal obtenido por query                  |
| Stream interrumpido                                        | reconectar solo con cursor/ID del mismo stream; si no, `REMOTE_STATE_UNKNOWN` |
| Cancel enviada sin confirmación                            | `CANCEL_REQUESTED`, después `REMOTE_STATE_UNKNOWN` si no puede consultarse    |
| Sin operation ID                                           | no query/reconnect; nunca retry automático si pudo despacharse                |
| Con operation ID                                           | puede consultarse; no implica reanudar ni deduplicar                          |
| Con idempotency key                                        | retry solo dentro de la garantía documentada y con mismo request digest       |
| Solo nueva inferencia                                      | nueva operación; no es recovery exacto                                        |

La persistencia previa al límite de dispatch reduce la ventana no observable,
pero no puede eliminar la incertidumbre entre dos sistemas sin una primitive del
proveedor.

## Decisión

### 1. Capabilities explícitas del provider

Cada adapter declara un conjunto cerrado, versionado y visible en preview:

- `local_checkpoint`: reconstruye estado local validado; no afirma estado
  remoto;
- `stream_reconnect`: continúa el stream de la misma operación mediante cursor;
- `operation_query`: consulta el estado de una operación identificada;
- `operation_resume`: ordena continuar la misma operación pausada;
- `idempotent_retry`: repetir con la misma key no crea otra operación dentro de
  la garantía documentada;
- `remote_cancel`: existe confirmación remota observable de cancelación;
- `exact_recovery`: composición verificada que preserva identidad de operación,
  request digest, output y contabilidad.

La lista vacía significa que el provider no ofrece recuperación. Declarar
`exact_recovery` exige al menos una primitive de identidad/continuación y no
autoriza retries por sí solo.

### 2. Estado de ejecución remoto

Los adapters y Runtime representan explícitamente:

`NOT_DISPATCHED → DISPATCHING → ACCEPTED → RUNNING → SUCCEEDED | FAILED | CANCELLED`

Desde cualquier estado no terminal puede llegarse a `REMOTE_STATE_UNKNOWN`.
`CANCEL_REQUESTED` no equivale a `CANCELLED`. Los estados terminales solo se
aceptan cuando el adapter tiene evidencia suficiente para afirmarlos.

### 3. Clase de efecto

Cada acción declara o recibe una clasificación conservadora:

- `PURE`: cálculo local sin efecto observable;
- `READ_ONLY`: observa estado externo sin modificarlo;
- `REVERSIBLE`: modifica, pero tiene compensación definida y aprobada;
- `SIDE_EFFECTFUL`: puede producir cambios, mensajes, comandos, billing o una
  nueva inferencia;
- `IRREVERSIBLE`: delete/publicación/acción externa no compensable.

En ausencia de declaración, `read` puro se clasifica `READ_ONLY`; cualquier
`write`, `execute`, `network`, `git`, `delete`, `system` o `credentials` se
clasifica al menos `SIDE_EFFECTFUL`, y destructive/delete como `IRREVERSIBLE`.
El valor entra en el plan/descriptor y por tanto en integridad y aprobación.

### 4. Responsabilidades

El **ProviderAdapter** debe:

- declarar capabilities sin exagerarlas;
- preservar request/operation identity y provenance;
- devolver estado remoto honesto;
- contabilizar usage acumulado de la cadena recuperada;
- implementar `recover` solo cuando una capability lo justifica;
- nunca convertir pérdida de transporte en failure/cancelled confirmado.

El **AdapterHost** valida manifest/preview/result, combinación de capabilities,
checkpoint y coherencia outcome/estado. No decide retries.

El **Orchestration Runtime** debe:

- persistir `NOT_DISPATCHED` antes de cruzar el límite de dispatch y
  `DISPATCHING` inmediatamente antes de invocar;
- conservar attempt, request digest, capabilities, effect class y budgets;
- convertir una caída en `remote_state_unknown` cuando el dispatch pudo ocurrir;
- detener dependencias y workflow;
- no reintentar automáticamente una operación incierta;
- mantener evidencia/audit y requerir resolución humana o una primitive exacta;
- consumir checkpoints solo después de recovery terminal verificado;
- no reiniciar budgets silenciosamente.

Strategy, Planner y Evaluation no implementan protocolos de provider. Planner
conserva effect class; Evaluation trata UNKNOWN como no exitoso y no inferible.

## Política de retry seguro

Un retry automático solo es admisible cuando todas las condiciones son ciertas:

1. la ejecución original tiene identidad y request digest idénticos;
2. el adapter declara `idempotent_retry` con garantía aplicable;
3. el efecto no es `IRREVERSIBLE` y cualquier compensación requerida está
   aprobada;
4. usage y coste acumulados caben en el budget original;
5. la aprobación original cubre exactamente la operación de retry o se obtiene
   una nueva;
6. el resultado se audita como la misma operación, no como éxito nuevo.

La primera implementación no hace retry automático. Incluso si el provider
declara idempotencia, Runtime exige una llamada explícita de recovery y una
nueva aprobación cuando Policy lo requiere.

## Rediseño de conformidad

Se mantienen 14 checks, pero se corrige su objeto:

- `recovery` verifica que el adapter declare y ejecute honestamente su nivel. Un
  provider sin recovery pasa si rechaza `recover` de forma tipada.
- `interrupted_recovery` verifica la garantía del sistema: exact recovery cuando
  fue declarada; en otro caso UNKNOWN, evidencia, workflow detenido y ausencia
  de retry automático.

No se elimina ni suaviza ningún check. Los tests agregan crash antes y después
del límite de dispatch, respuesta/stream perdidos, cancelación no confirmada,
declaración de operation query, provider idempotente sin retry automático,
efectos, budgets, resolución humana y conservación de provenance.

## Compatibilidad

El Reference Provider migra de `single_checkpoint_retry` a
`local_checkpoint + exact_recovery`; su comportamiento local continúa siendo
determinista. El schema y el manifest incrementan versión. Checkpoints M5
anteriores siguen siendo parseables para migración, pero no autorizan recovery
si el nuevo manifest no declara una capability compatible.

Los registros `running` anteriores a la migración, sin attempt persistido, se
mantienen `orphaned`: no hay evidencia para afirmar dispatch. Los nuevos runs
con attempt no terminal cruzado pasan a `remote_state_unknown`.

## Aplicación a los gates existentes

- **Codex App Server:** deja de requerirse exact recovery como condición para
  una inferencia sin efectos posteriores automáticos. Técnicamente podría
  declarar lista vacía y terminar UNKNOWN ante interrupción. Sus gates de
  producción, autenticación y contrato continúan `UNRESOLVED`.
- **Claude Code:** igual; `--resume` no se reetiqueta como exact recovery. El
  bloqueo técnico absoluto se convierte en capacidad ausente manejable. Los
  gates contractual/auth siguen intactos.
- **Vertex AI online:** puede ser usable con recovery vacío si UNKNOWN detiene
  el workflow. ADC, billing y contrato continúan sujetos a sus gates.
- **Gemini Developer API Interactions:** puede declarar query, reconnect, remote
  cancel y exact recovery para background interactions solo después de
  implementación/fixtures. Su requisito de credencial/proyecto sigue intacto.

Esto no aprueba ningún provider.

## Consecuencias y riesgos

Positivas: el modelo refleja la realidad distribuida, evita falsos negativos y
retries peligrosos, permite providers limitados sin degradar garantías y hace
visible la diferencia entre continuidad local y remota.

Costes: nuevo schema, migración, attempt journal, estados de UI y fixtures de
conformidad. UNKNOWN requiere intervención y puede dejar operaciones/costos
remotos pendientes. Exact recovery sigue siendo capability valiosa, no requisito
universal.

Riesgo residual: persistir `DISPATCHING` antes del invoke produce falsos UNKNOWN
si el proceso muere en esa ventana. Es deliberadamente conservador: nunca se
convierte en “no ocurrió” sin prueba.

## Alternativas descartadas

- Mantener booleano y relajar tests por proveedor: oculta diferencias reales.
- Tratar todo transport error como failure: puede duplicar efectos.
- Re-prompt automático con contexto anterior: crea una operación nueva.
- Exigir exact recovery a todo provider: confunde capability del backend con la
  garantía fail-safe de la orquestación.
- Presumir exactly-once: no puede construirse unilateralmente sobre un sistema
  remoto sin identidad/deduplicación verificables.
