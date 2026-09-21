# Runtime, aprobaciones y ejecución segura

Estado: contrato de arquitectura para prioridad 4  
Fecha: 2026-08-07

## Responsabilidad

El Runtime convierte pasos ya planificados en llamadas a subsistemas. No elige
capabilities, no cambia Policy y no interpreta intención libre.

```text
Preview persistido + Registry vigente
                 │
                 ▼
       validación de plan/policy
                 │
       ┌─────────┴──────────┐
       │                    │
   allow directo     approval digest
                            │ grant vigente
       └─────────┬──────────┘
                 ▼
       Dispatcher Registry
                 │
        efecto + evidencia
                 │
                 ▼
        PersistenceStore
```

## Invariantes

- sólo se ejecuta una combinación persistida de request, plan, snapshot y
  digest;
- `evaluation.status=blocked` o una Policy `deny` nunca llega a un dispatcher;
- Registry, integridad, Policy, persistencia y descriptor se revalidan antes de
  cada paso;
- una aprobación sólo sirve para un plan/paso/descriptor, expira y se consume
  antes del efecto;
- dependencias se completan antes del paso dependiente;
- cada paso genera como máximo una evidencia terminal;
- fallos, timeout y cancelación detienen el plan; Runtime no inventa retries;
- si un envío remoto pudo ocurrir y no hay evidencia terminal, el workflow
  termina en `remote_state_unknown`, sin duplicar efectos ni budgets;
- cada acción conserva su clase `pure`, `read_only`, `reversible`,
  `side_effectful` o `irreversible` para decidir recovery conservador;
- un árbol no confirmado produce `orphaned`.

## Estados del run

```text
planned ──► awaiting_approval ──► approved ──► running ──► completed
   │                │                 │           ├──────► failed
   │                │                 │           ├──────► cancelled
   │                │                 │           ├──────► timed_out
   └────────────────┴─────────────────┴───────────└──────► orphaned

Provider attempt:
not_dispatched ─► dispatching ─► accepted/running ─► succeeded/failed/cancelled
                         └─────────────────────────► remote_state_unknown
```

Los estados terminales del run no admiten transición. Al iniciar, todo run
`running` sin supervisor vivo se marca `orphaned`; un intento remoto que había
cruzado el límite de dispatch además queda `remote_state_unknown`. Este último
solo puede resolverse a terminal con una decisión humana atribuida. Nunca se
reanuda automáticamente.

## Dispatcher

Un dispatcher ofrece dos operaciones obligatorias y una opcional:

- `describe(step)`: devuelve el efecto exacto que verá el usuario y entrará en
  el digest de aprobación;
- `dispatch(context)`: ejecuta ese mismo descriptor bajo `AbortSignal` y entrega
  outcome, resumen, digest opcional y confirmación del árbol.
- `recover(context, checkpoint)`: reanuda solo si el subsistema soporta el
  contrato y Runtime validó el checkpoint persistido.

El registro exige coincidencia exacta de capability y subsistema. No existe un
dispatcher genérico expuesto al renderer.

`ProviderStepDispatcher` es el puente genérico para proveedores. Regenera el
preview, compara el descriptor, retransmite eventos tipados y delega en el
adaptador registrado. Runtime persiste checkpoints correlacionados y exige una
nueva aprobación para una ejecución recuperada. El callback que muestra el
stream está aislado y no controla el outcome. Antes de llamar al host, Runtime
persiste el attempt y cambia a `dispatching`. Si el dispatcher lanza, devuelve
estado incierto o entrega un resultado inválido, Runtime conserva UNKNOWN y no
produce evidencia terminal inventada.

## Proceso local P0

El adaptador de procesos sólo acepta executable absoluto preautorizado, cwd
dentro de roots permitidos, argv tipado y environment reducido. No usa shell, no
recibe stdin y limita bytes de salida. La supervisión multiplataforma y su
decisión están en [ADR-0004](adr/0004-runtime-process-supervision.md).

## Gate de aceptación

- allow ejecuta y persiste evidencia;
- deny no invoca dispatcher;
- approval ausente/denied/expired bloquea;
- approval granted se consume una vez;
- timeout y cancel cambian el run y detienen el árbol;
- startup recovery transforma runs `running` en `orphaned` y marca UNKNOWN solo
  los attempts que pudieron cruzar dispatch;
- recovery de proveedor rechaza checkpoint adulterado, cruzado o consumido y
  funciona tras reiniciar Runtime con una aprobación nueva;
- provider sin exact recovery detiene el workflow en UNKNOWN, no reintenta y
  permite resolución humana auditada;
- en Windows una prueba real demuestra que `/T` termina padre y descendiente.
