# ADR-0016: contrato de Strategy Deliberation

Estado: `ACCEPTED` — decisión arquitectónica; implementación pendiente  
Fecha: 2026-09-25

## Contexto

Strategy v2 compara rutas publicadas y produce una `StrategyDecision` antes de
que `ExecutionPlanner` construya el plan. Ese flujo directo es correcto para el
producto actual, pero no alcanza para objetivos donde conviene comparar varias
soluciones antes de comprometer una estrategia.

Permitir que Strategy llame directamente a un provider resolvería esa necesidad
rompiendo la arquitectura: crearía un camino fuera de Planner, Policy, Approval,
Runtime y Provider Gateway. También mezclaría decisión con ejecución y haría
difícil conservar budgets, recovery, provenance y estado durable.

P3-B2.0 define la semántica antes de implementar concurrencia. No implementa
contratos ejecutables, providers, fan-out/fan-in, persistence ni UI.

## Decisión

Strategy Deliberation pertenece conceptualmente a Strategy, pero sus llamadas se
ejecutan como un workflow preliminar gobernado. La secuencia normativa tiene dos
planes distintos:

```text
Objective + Project Context
  → Strategy pre-analysis
  → DIRECT | DELIBERATIVE
  → [DELIBERATIVE] Execution Planner produce DeliberationPlan
  → Policy / Approval
  → Runtime
  → Provider Gateway y otras gateways autorizadas
  → DeliberationOutcome normalizado
  → Evaluation Engine
  → Strategy produce StrategyDecision
  → Execution Planner produce FinalExecutionPlan
  → Policy / Approval
  → Runtime / Execution / postflight
```

No existe `Strategy → provider`. Strategy y Planner siguen siendo puros respecto
de efectos. Runtime conserva lifecycle y budgets. Provider Gateway sigue siendo
la única frontera de provider. Evaluation Engine conserva la decisión sobre
checks verificables; una evaluación producida por IA es solo una señal no
confiable dentro de esa evaluación.

El `DeliberationPlan` no es el plan final y no autoriza el objetivo. Solo
describe trabajo preliminar de propuesta, crítica y síntesis. Sus pasos
atraviesan las mismas fronteras de capability, Policy, Approval, Runtime y
evidence.

## Activación

`StrategyPreAnalysis` produce una decisión explicable:

- `DIRECT`: continuar con la selección actual y el plan final;
- `DELIBERATIVE`: solicitar un plan preliminar de deliberación;
- `UNAVAILABLE`: no existe una ruta segura compatible con los requisitos.

La activación considera señales versionadas, no pesos arbitrarios codificados en
este ADR: complejidad, ambigüedad, impacto, riesgo, coste de equivocación,
diversidad útil, incertidumbre, estrategias plausibles, privacidad, budget y
preferencias del usuario.

Una preferencia puede requerir, evitar, limitar o excluir participantes, pero no
puede hacer elegible una ruta bloqueada. Si Policy futura exige deliberación,
una preferencia `DIRECT` no la evita. Si el usuario exige deliberación y no
existe un conjunto mínimo elegible, el resultado es `INSUFFICIENT`, no un
fallback oculto.

## Contratos conceptuales versionados

Los nombres son normativos para el diseño; sus schemas ejecutables pertenecen a
P3-B2.1/B2.2.

### `DeliberationRequest`

Referencia objetivo, `ProjectContextSnapshot`, restricciones del usuario,
criterios requeridos, modo solicitado y techo global de budget. No contiene
credenciales, grants ni una copia indiscriminada del contexto.

### `DeliberationParticipant`

Describe una opción elegible con:

- ID lógico y schema version;
- `AgentProfile` exacto por ID/revisión/digest;
- identidad observable de model/capability: familia, versión y modalidad;
- `independenceKey` derivada de la identidad lógica, no de la marca de la ruta;
- capability y provider route candidatos por referencias separadas;
- estado de instalación, autenticación, gate y habilitación cuando aplique;
- restricciones de privacidad, Policy y budget;
- provenance de la resolución.

La provider route usada se fija como provenance de ejecución, no como identidad
de la propuesta. Dos rutas hacia el mismo modelo comparten `independenceKey`
salvo evidencia material de independencia. Cuando la identidad no pueda
demostrarse, el sistema no cuenta diversidad adicional por conveniencia.

### `DeliberationBudget`

Es un subpresupuesto del ledger global. Limita como mínimo participantes, rondas
de propuesta, rondas de crítica, provider calls, input/output en tokens cuando
sean observables y siempre en bytes, coste, wall time, contexto por participante
y reparaciones/reevaluaciones.

### `ContextSliceReference`

Manifest derivado e inmutable ligado al Project Context exacto. Contiene ID,
schema/canonicalization version, context ID/revisión/digest, participante y
fase, referencias autorizadas, exclusiones, límite, provenance y digest. No es
otra fuente de verdad, no copia Memory/Audit/Evidence, no otorga capabilities y
no amplía permisos.

Runtime resuelve las referencias autorizadas justo antes del dispatch. Cada
slice se materializa aisladamente para su destinatario. No se incluyen
propuestas de otros participantes en la ronda inicial. Una crítica recibe solo
las propuestas asignadas y una identidad ciega cuando la evaluación no necesita
marca/modelo.

### `DeliberationPlan`

Plan preliminar versionado, acíclico y separado del plan final. Fija request,
Context y Registry digests; participantes; perfiles; slices; fases;
dependencias; budgets; criterios de stop/degradación; Policy; approvals y
provenance. Planner es su owner. No contiene un resultado de Strategy ni concede
autoridad a sus participantes.

### `StrategyProposal`

Resultado estructurado no confiable con identidad y bindings exactos:

- proposal ID y schema version;
- objetivo, Context, participant, profile y context-slice references;
- model/capability identity y provider route solo en provenance;
- conclusión y estrategia propuesta;
- rationale resumido, nunca chain-of-thought privado;
- supuestos, capabilities requeridas, restricciones y riesgos;
- artifacts esperados y criterios de éxito;
- coste/tiempo estimados solo cuando sean honestamente observables;
- incertidumbre y Evidence references;
- output/provenance digests.

### `StrategyCritique`

Resultado separado que referencia exactamente proposal ID/version/digest y el
slice asignado. Enumera requisitos incumplidos, contradicciones, supuestos
débiles, riesgos, evidencia, incertidumbre y mejoras. También es
`untrusted_data`. Una crítica no modifica la propuesta ni adquiere autoridad.

### `ProposalEvaluation`

Resultado del Evaluation Engine por propuesta. Separa:

- checks deterministas: bindings, schemas, capabilities, Policy, privacidad,
  budgets, evidencia, arquitectura y verificabilidad;
- señales asesoras: juicios producidos por IA, siempre con provenance,
  incertidumbre y sin autoridad;
- criterios aplicados y versión de la matriz;
- resultado `eligible | rejected | insufficient_evidence`.

Los pesos futuros son configuración versionada y revisable; no se fijan en este
ADR. Mayoría, confianza autodeclarada y marca no son criterios de autoridad.

### `StrategySynthesis`

Candidato estructurado que combina elementos compatibles y cita exactamente las
propuestas/críticas/evaluaciones de origen. No puede introducir una capability,
permiso, evidencia o afirmación que no pueda rastrearse. Es un input no
confiable para Evaluation y Strategy, no la decisión final.

### `DeliberationDecision`

Decisión explicable de Strategy después de consumir evaluaciones normalizadas.
Indica `SELECTED`, `SYNTHESIZED`, `INSUFFICIENT`, `DEGRADED`, `CANCELLED` o
`INTERRUPTED`; referencia propuesta/síntesis, alternativas descartadas,
criterios, degradaciones, incertidumbre, budget y provenance.

### `DeliberationOutcome`

Envelope terminal del workflow preliminar. Reúne únicamente referencias y
digests de participantes, proposals, critiques, evaluations, synthesis,
decision, Evidence, Audit y ledger. No es un Artifact Store, no duplica sus
contenidos y no equivale a `StrategyDecision` hasta que Strategy lo valide.

## Lifecycle

El lifecycle conceptual mínimo es:

```text
requested → planned → awaiting_authorization → running_proposals
  → running_critiques → evaluating → selecting_or_synthesizing
  → completed | insufficient | degraded | cancelled | interrupted
```

La ronda inicial es independiente: cada proposal parte del mismo objetivo y de
su slice autorizado, sin propuestas previas. La crítica es una fase posterior y
referencial. Evaluation corre checks deterministas antes de aceptar señales
asesoras. Strategy selecciona o solicita una síntesis evaluable; recién después
produce `StrategyDecision` para el plan final.

`DEGRADED` siempre conserva motivos: participantes ausentes, rondas omitidas,
errores o budget agotado. Continuar degradado requiere que los mínimos
versionados sigan satisfechos y Policy lo permita. Nunca se disfraza como
deliberación completa.

## Elegibilidad

Un participante es elegible solo cuando la conjunción aplicable es cierta:

`available + compatible + authenticated + gate-authorized + enabled + policy-compatible + privacy-compatible + budget-compatible + capability-compatible`.

Capability disponible no equivale a permiso. Una entrada de catálogo no basta.
La resolución debe quedar ligada a snapshots/digests y revalidarse antes de cada
dispatch. Preferencias del usuario solo reducen o priorizan el conjunto; nunca
saltan gates.

## Budgets y delegación

El límite efectivo de cada llamada es el mínimo entre budget global,
deliberation budget, profile budget, capability/backend limits y consumo
remanente. Los contadores pertenecen a Runtime, son monotónicos y sobreviven
restart. Un fallo o retry no crea saldo. Métricas no observables no se inventan.

Un participante no puede crear otros participantes. Una futura delegación vuelve
a Strategy/Planner y queda limitada por profundidad, participantes, llamadas,
coste, tiempo, Policy y provenance. P3-B2 no autoriza swarm autónomo.

## Failure, recovery y UNKNOWN

ADR-0011 gobierna cada dispatch. Si una llamada pudo llegar al provider y se
pierde su estado, el attempt queda `remote_state_unknown`; no se inventa una
proposal, no se asume failure/success y no se reintenta sin capability y
decisión seguras. Las dependencias de ese resultado se bloquean.

La deliberación puede terminar `DEGRADED` solo si existe un conjunto suficiente
de resultados terminales verificables, las identidades independientes mínimas se
mantienen y Policy permite continuar. Un resultado UNKNOWN requerido produce
`INTERRUPTED`. Cancel request no equivale a cancel confirmado. Budget,
provenance y evidence se conservan.

## Private mode y retención

Private mode continúa bloqueando red. Por tanto, solo participan capabilities
locales elegibles. Si no existe diversidad local suficiente, la deliberación es
`INSUFFICIENT` o se usa DIRECT únicamente cuando la preferencia y Policy lo
permitan explícitamente.

P3-B2.0 no amplía persistencia. En la implementación futura, private mode no
guardará prompts, slices, proposals o critiques de forma durable; renunciará al
resume entre procesos cuando sea necesario. Retención no se extiende por formar
parte de una deliberación y nunca se afirma borrado forense.

## Proyección futura en Mission Control

La interfaz principal no será una colección de chats. Proyectará el workflow:
objetivo, motivo y modo de activación, participantes elegibles e identidades
lógicas, fases y estado, proposals/critiques resumidas, Evaluation,
selección/síntesis, budget consumido, degradaciones, approvals, Evidence y
provenance. No mostrará chain-of-thought privado.

Esta vista será una proyección de Runtime, Audit, Evidence y los contratos de
deliberación; no una nueva fuente de verdad. P3-B2.0 no implementa UI.

## Ownership

| Owner                 | Responsabilidad en deliberación                                          |
| --------------------- | ------------------------------------------------------------------------ |
| Strategy Engine       | pre-analysis, activación, participant resolution lógico y decisión final |
| Execution Planner     | `DeliberationPlan`, dependencias, slices referenciados y plan final      |
| Capability Registry   | disponibilidad/capabilities observadas; nunca autorización               |
| Evaluation Engine     | checks y evaluaciones normalizadas; separa determinismo de juicio asesor |
| Policy / Approval     | autorización y consentimiento; ninguna proposal los modifica             |
| Runtime               | lifecycle, dispatch, cancelación, budgets, recovery y estado durable     |
| Provider Gateway      | única frontera de provider y provenance de ruta                          |
| Agent Profile Catalog | responsabilidad y límites declarativos, sin fijar modelo/provider        |
| Persistence           | representación durable futura, sin decidir outcomes ni duplicar fuentes  |
| Audit / Evidence      | hechos append-only y prueba verificable                                  |

## Alternativas descartadas

- **Strategy llama providers:** viola ownership y elude Runtime/Policy.
- **Provider voting:** confunde consenso con verdad y duplica falsamente
  modelos.
- **Agente supervisor autónomo:** crea otra autoridad y delegación recursiva.
- **Un único objeto deliberation:** mezcla request, plan, outputs y decisión.
- **Construir primero fan-out:** congela una semántica de concurrencia sin saber
  qué garantías necesita la deliberación.
- **Guardar chain-of-thought:** no es necesario para explicación y amplía
  riesgo.

## Compatibilidad y consecuencias

El flujo DIRECT actual permanece válido y no cambia. P3-B2.1 implementó el
substrate acotado, context slicing y estado durable de ramas sin implementar
deliberación. P3-B2.2 implementará los contratos de
proposal/crítica/evaluación/decisión sobre ese substrate. Sus schemas se
versionan sin modificar retrospectivamente esta decisión.

Costes: dos fases de planificación, mayor latencia/coste, nueva persistencia
durable de ramas, UI de degradación y más superficie de threat model.
Beneficios: diversidad verificable, independencia inicial, decisión explicable y
ausencia de un segundo camino de ejecución.

Esta aceptación no implementa Strategy Deliberation, no habilita providers y no
modifica contratos ejecutables.
