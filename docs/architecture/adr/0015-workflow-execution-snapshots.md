# ADR-0015: snapshots confirmados de ejecución de workflows

Estado: `ACCEPTED` — decisión arquitectónica; implementación pendiente  
Fecha: 2026-09-22  
Aceptado: 2026-09-22

## Contexto

La documentación anterior usaba “checkpoint” tanto para recovery de provider
como para una futura ramificación de workflow. `ProviderRecoveryCheckpoint`
puede describir progreso parcial de provider y coexistir con estado remoto
incierto. No es una base segura para resume durable o branching.

## Decisión

Se reserva `WorkflowExecutionSnapshot` para un punto inmutable y confirmado de
la ejecución de orquestación.

`ProviderRecoveryCheckpoint != WorkflowExecutionSnapshot`.

El snapshot es principalmente un manifest de referencias inmutables y digests,
no una copia de las fuentes de verdad. Solo materializa el mínimo imprescindible
para validar el punto de reanudación. Debe identificar:

- workflow definition/version, run, plan y registry snapshot;
- pasos terminales incluidos y digest del estado confirmado;
- referencias/digests de outputs y Evidence confirmados;
- referencias a approvals consumidas, nunca grants reutilizables;
- referencia al ledger y consumo acumulado de budgets;
- versiones/digests de Memory y Project Context autorizados;
- referencias a Audit/provenance correlacionados;
- instante, autor/motivo, versión de schema/canonicalización y digest del
  snapshot.

## Punto confirmado

Un snapshot reanudable solo existe cuando todos sus pasos requeridos tienen
transiciones persistidas y un outcome terminal verificable. No puede incluir
como confirmado un attempt `dispatching`, `accepted`, `running`,
`cancel_requested` o `remote_state_unknown`.

Puede referenciar el hecho histórico de que otro attempt quedó UNKNOWN, pero ese
hecho bloquea el avance dependiente y nunca se transforma en resultado
confirmado. El snapshot no afirma estado remoto: referencia Evidence y Audit que
sustentan el estado de orquestación observado.

## Invariantes

1. No encapsula recovery envelope/checkpoint remoto ni lo eleva a workflow
   confirmado.
2. Es inmutable; corregir o avanzar crea una nueva versión enlazada.
3. No reutiliza approvals. Resume o rama reevalúan Policy y obtienen aprobación
   nueva cuando corresponda.
4. No reinicia budgets: conserva ledger y baseline consumido; una rama futura
   recibe identidad propia sin saldo duplicado.
5. No duplica Memory, Project Context, Audit o Evidence. Los referencia por
   identidad, versión y digest.
6. Si una fuente referenciada expira o se elimina, el snapshot queda degradado o
   no reanudable; no prolonga retención copiando contenido.
7. Efectos externos no se repiten automáticamente. La reanudación comienza
   después del límite confirmado y exige evaluación vigente.
8. Su creación y uso son auditados, pero el snapshot no sustituye Audit ni
   Evidence.

## Private mode, retención y datos

Private mode puede impedir crear un snapshot durable o limitarlo a referencias
efímeras y digests no reversibles. La UI deberá advertir cuando esa elección
renuncie a resume durable. El snapshot hereda la retención más restrictiva de
sus referencias y nunca preserva contenido borrado mediante una copia interna.

Project Context y Memory permanecen autoridades independientes: el snapshot fija
las versiones usadas, no su contenido completo. Outputs solo se materializan
cuando no existe otra fuente durable autorizada y una decisión de retención
específica lo permite.

## Resume y branching

P3-E1 podrá usar snapshots confirmados para crash recovery/resume del mismo run
bajo sus invariantes de budget y approval. **Branching continúa
`LATER/EXPERIMENTAL`**: una rama tendrá identidad nueva, vínculo al snapshot
origen, nueva evaluación y ninguna repetición implícita de efectos.

Este ADR no define semántica de branching ni autoriza implementarla.

## Relación con otras decisiones

- [ADR-0011](0011-recovery-semantics.md) gobierna incertidumbre remota.
- [ADR-0012](0012-provider-agnostic-recovery-envelope.md) modela material de
  recovery de provider, nunca un snapshot confirmado de workflow.
- [ADR-0013](0013-integrated-interrupted-recovery-conformance.md) deberá probar
  restart y reapertura de persistence antes de acreditar resume seguro.

## Consecuencias y deuda

La frontera evita que durable workflows creen otra base de Memory/Audit/Evidence
y separa estado local confirmado de estado remoto incierto. La implementación
futura necesita schema, persistence, canonicalización, invalidación por
retención, UI, threat model y tests de crash/resume.

Esta aceptación no implementa `WorkflowExecutionSnapshot`, durable workflows ni
branching.
