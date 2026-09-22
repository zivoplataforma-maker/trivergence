# ADR-0015: snapshots confirmados de ejecución de workflows

Estado: `PROPOSED` — decisión documental; implementación diferida  
Fecha: 2026-09-22

## Contexto

La documentación anterior usaba “checkpoint” tanto para recovery de provider
como para una futura ramificación de workflow. `ProviderRecoveryCheckpoint`
puede describir progreso parcial de provider y coexistir con estado remoto
incierto. No es una base segura para branching.

## Decisión propuesta

Se reserva el nombre conceptual `WorkflowExecutionSnapshot` para un punto
inmutable y confirmado de la ejecución de orquestación.

`ProviderRecoveryCheckpoint != WorkflowExecutionSnapshot`.

Un snapshot futuro deberá identificar:

- workflow definition/version y run;
- plan/snapshot digest y pasos terminales incluidos;
- outputs/evidence confirmados mediante referencias y digests;
- approvals consumidas y budgets acumulados;
- Memory/Project Context versions referenciadas, sin copiarlas como verdad
  nueva;
- instante, autor y motivo de creación;
- digest canónico del snapshot.

## Invariantes

1. No se crea un snapshot ramificable si algún paso requerido está
   `remote_state_unknown`, `dispatching`, `running` o pendiente de cancelación.
2. Un snapshot nunca afirma ni encapsula recovery remoto.
3. Es inmutable; una rama crea nueva identidad y conserva enlace al origen.
4. Branching no reutiliza approvals de efectos ni budgets como saldo nuevo.
5. Efectos externos no se repiten automáticamente; requieren nueva evaluación y
   autorización.
6. Audit y Evidence originales permanecen append-only e intactos.
7. Private mode y retención determinan qué referencias/material pueden formar
   parte del snapshot.

## Alcance

P3-E1 podrá diseñar durabilidad usando snapshots confirmados, pero workflow
branching permanece `LATER/EXPERIMENTAL`. Este ADR no autoriza implementar
snapshot, branching o time travel.

## Consecuencias y deuda

La terminología queda separada antes de introducir código. En una fase futura se
necesitarán schema, persistence, canonicalization, UI, threat model y tests de
crash/branching; nada de ello forma parte de P3-0.
