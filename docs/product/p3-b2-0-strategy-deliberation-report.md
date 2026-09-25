# Informe P3-B2.0 — Strategy Deliberation Contract

Fecha: 2026-09-25  
Resultado: `DONE` documental; implementación ejecutable `PENDING`

## Resumen ejecutivo

P3-B2.0 cierra la arquitectura de deliberación previa a la estrategia mediante
[ADR-0016](../architecture/adr/0016-strategy-deliberation-contract.md). No añade
concurrencia, contratos TypeScript, providers, persistence, UI ni cambios de
Runtime.

La decisión central es un protocolo de dos planes. Strategy realiza un
pre-análisis y elige `DIRECT` o `DELIBERATIVE`. En el segundo caso, Planner crea
un `DeliberationPlan` preliminar que cruza Policy/Approval, Runtime y Provider
Gateway. Evaluation normaliza sus resultados y Strategy recién entonces produce
la `StrategyDecision` que alimenta al plan final. No existe una llamada directa
`Strategy → provider`.

## Auditoría del estado actual

El código actual implementa una ruta directa y determinista:

```text
Objective + Project Context → StrategyDecision → ExecutionPlan → Runtime
```

`StrategyEngine` compara rutas publicadas, `ExecutionPlanner` materializa el
plan, `RuntimeEngine` posee lifecycle/budgets y `AdapterHost` con su dispatcher
es la frontera única de providers. `EvaluationEngine` ya separa preflight y
postflight. P3-B1 aporta perfiles declarativos, pero no workers autónomos,
selección de provider ni fan-out.

La tensión era real: pedir varias propuestas antes del plan final podría inducir
un atajo desde Strategy a providers. ADR-0016 lo prohíbe y reutiliza las
fronteras existentes mediante un workflow preliminar planificado.

## Arquitectura final

```text
Objective + Project Context
  → Strategy pre-analysis: DIRECT | DELIBERATIVE | UNAVAILABLE
  → [DELIBERATIVE] DeliberationPlan del Execution Planner
  → Policy / Approval → Runtime → Provider Gateway
  → DeliberationOutcome → Evaluation Engine
  → StrategyDecision
  → FinalExecutionPlan → Runtime → postflight
```

El plan preliminar describe únicamente propuesta, crítica y síntesis. No
autoriza el objetivo, no sustituye al plan final y no concede autoridad a los
outputs de IA.

## Contratos conceptuales

ADR-0016 define, sin implementarlos todavía:

- `DeliberationRequest`: objetivo, Context, restricciones, criterios, modo y
  techo global;
- `DeliberationParticipant`: perfil exacto, identidad lógica de
  modelo/capability, ruta separada y provenance;
- `DeliberationBudget`: subpresupuesto del ledger global;
- `ContextSliceReference`: manifest derivado, acotado e inmutable;
- `DeliberationPlan`: workflow preliminar versionado y gobernado;
- `StrategyProposal` y `StrategyCritique`: resultados estructurados no
  confiables;
- `ProposalEvaluation`: checks deterministas separados de señales asesoras;
- `StrategySynthesis`: candidato trazable, nunca decisión automática;
- `DeliberationDecision`: selección/síntesis/degradación explicable;
- `DeliberationOutcome`: envelope terminal de referencias y digests.

## Lifecycle y modos

`DIRECT` conserva el comportamiento actual. `DELIBERATIVE` solo será elegible
cuando privacidad, Policy, gates, capabilities, identidad y budget permitan un
conjunto suficiente. Si el usuario exige deliberación y ese conjunto no existe,
el resultado será `INSUFFICIENT`; no habrá fallback oculto.

La primera ronda de proposals es independiente. La crítica ocurre después y
referencia propuestas exactas. Evaluation ejecuta primero checks verificables.
No se decide por voto, marca o confidence autodeclarada.

## Participantes, identidad y falso consenso

La identidad lógica de modelo/capability se mantiene separada de la provider
route. Dos rutas hacia el mismo modelo comparten `independenceKey`, salvo
evidencia material en contrario. Una identidad incierta no añade diversidad por
conveniencia.

La elegibilidad requiere la conjunción aplicable de disponibilidad,
compatibilidad, autenticación, gate, habilitación, Policy, privacidad, budget y
capability. Capability no equivale a permiso.

## Context slicing

Cada participante y fase reciben un manifest de referencias allowlisted ligado
al Project Context exacto. Runtime deberá resolverlas justo antes del dispatch.
Los slices no duplican Memory, Audit o Evidence, no conceden permisos y no
incluyen propuestas ajenas durante la ronda inicial. Una futura revisión ciega
ocultará marca/ruta al crítico cuando no sean necesarias, preservándolas en
provenance.

## Budgets, delegación y recovery

El límite efectivo será la intersección del budget global, deliberation budget,
perfil, backend/capability y saldo del Runtime. Los contadores continúan siendo
monotónicos y un retry nunca crea saldo.

ADR-0011 gobierna cada dispatch. Un estado remoto incierto permanece
`remote_state_unknown`, bloquea dependencias y no produce retry automático. La
deliberación solo puede degradarse si conserva un conjunto terminal suficiente y
Policy lo permite; de lo contrario termina `INTERRUPTED` o `INSUFFICIENT`.

La delegación recursiva no está autorizada. Cualquier expansión futura vuelve a
Strategy/Planner y consume límites explícitos de profundidad, participantes,
calls, coste y tiempo.

## Private mode

Private mode continúa sin red. Solo podrían participar capabilities locales
elegibles. P3-B2.0 no añade persistencia. La futura implementación no podrá
persistir prompts, slices, proposals o critiques por comodidad y deberá mostrar
honestamente cuando esa restricción impida resume durable.

## Experiencia futura de Mission Control

La UX deberá presentar una sola ejecución coordinada, no tres chats paralelos:
objetivo, modo y motivo de deliberación, participantes elegibles, progreso por
fase, proposals/critiques resumidas, Evaluation, estrategia elegida o
sintetizada, budget, degradaciones, approvals, Evidence y provenance. Será una
proyección de fuentes existentes y nunca mostrará chain-of-thought privado.
P3-B2.0 no añade UI.

## Seguridad

El [threat model específico](../security/threat-model-p3-b2.md) cubre poisoning,
impersonation, falso consenso, capability/evidence fabrication, confidence
laundering, collusion, síntesis maliciosa, filtración de contexto, bypass de
Policy/Approval, fallback oculto, amplificación de budget, replay, `UNKNOWN`,
cancelación no confirmada, delegación recursiva y tampering de provenance.

## Contradicciones resueltas

- Se eliminó la ambigüedad entre deliberar dentro de Strategy y ejecutar desde
  Strategy: la semántica pertenece a Strategy; el trabajo se ejecuta por el
  pipeline gobernado.
- `DeliberationPlan` y plan final son objetos diferentes y secuenciales.
- Identidad lógica de inteligencia y ruta de provider ya no se confunden.
- Selection y synthesis son alternativas evaluadas, no votación.
- `DIRECT` describe el producto actual; `DELIBERATIVE` continúa pendiente.
- P3-B2 se divide en B2.0 documental, B2.1 substrate y B2.2 integración.

## Cambios documentales

- ADR-0016 y threat model P3-B2 nuevos;
- arquitectura, ownership y workflows alineados con el protocolo de dos planes;
- Prompt Maestro, Roadmap e Implementation Status distinguen decisión aceptada
  de capacidad implementada;
- README, SECURITY y CONTRIBUTING incorporan la visión deliberativa sin
  anunciarla como función actual;
- no se modificaron código, contratos ejecutables, dependencias, migrations, UI,
  providers ni notices de terceros.

## Gates

Resultado final:

- format y format check: `PASS`;
- lint: `PASS`;
- build fresco: `PASS`;
- typecheck fresco: `PASS`;
- tests frescos: `PASS`, 240/240;
- relative links: `PASS`;
- whitespace/diff check: `PASS`;
- secret scan: `PASS`;
- scope verification: `PASS`, solo Markdown;
- consistency: `PASS`: P3-B1 `DONE`, P3-B2.1/B2.2 `PLANNED`, M5/M7 `PARTIAL` y
  Reference Provider único ejecutable.

El primer test dentro del sandbox no pudo confirmar `taskkill /T` y conservó
honestamente `treeTerminationConfirmed=false`. Se repitió el mismo
`pnpm check:fresh` fuera del sandbox; Windows confirmó el árbol y los 240 tests
pasaron. No se modificó Runtime para alterar el resultado.

## Estado Git

El cambio se entregará en un único commit local exclusivo de P3-B2.0, sin push.
El hash y el estado ahead/behind se completarán tras los gates.

## Deuda técnica

- P3-B2.1 debe implementar fan-out/fan-in acotado, cancelación por rama, context
  slicing real y estado durable de ramas.
- P3-B2.2 debe materializar los contratos, Evaluation y decisión final.
- Los schemas, cardinalidades, criterios/pesos versionados, UX y persistencia
  todavía no existen.
- No existe diversidad externa ejecutable: Reference Provider sigue siendo el
  único provider habilitado y M5 continúa `PARTIAL`.
- M7 continúa `PARTIAL`; esta fase no modifica distribución.

## Siguiente paso mínimo

P3-B2.1: diseñar e implementar el substrate bounded fan-out/fan-in reutilizando
Runtime y durable workflow state, con context slicing, budgets agregados,
cancelación, recovery y provenance. No iniciar proposals/crítica/síntesis de
B2.2 hasta verificar ese substrate.
