# Threat model de Strategy Deliberation (P3-B2)

Estado: diseño aceptado; controles del substrate B2.1 implementados,
deliberación B2.2 pendiente  
Fecha: 2026-09-25

## Alcance y activos

Este modelo cubre la futura deliberación previa al plan final y el substrate
fan-out/fan-in que la soportará. P3-B2.1 implementa únicamente el segundo;
proposals, critiques, evaluación deliberativa y synthesis siguen pendientes.

Activos protegidos: objetivo, Project Context y sus fuentes; identidad de
participantes/modelos/rutas; Policy/Approval; budgets; proposals, critiques,
evaluations y synthesis; Evidence/Audit/provenance; privacidad y destino de red.

Fronteras no confiables: outputs de modelo, provider routes, Agent Profile
guidance, contenido de workspace, Memory, tools futuras y cualquier metadata no
atestiguada. Proposal, critique, synthesis, confidence y consenso son datos,
nunca autoridad.

## Amenazas y controles requeridos

| Amenaza                                                     | Control de diseño obligatorio                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal/critique poisoning o prompt injection              | schemas estrictos, campos acotados, contenido etiquetado `untrusted_data`; nunca concatenarlo con instrucciones gobernantes              |
| Impersonation o sustitución de participante/modelo/provider | bindings ID/version/digest, attestation/gate y provenance de ruta revalidados antes del dispatch                                         |
| False consensus por varias rutas al mismo modelo            | `independenceKey` basada en identidad lógica; identidad incierta no suma diversidad                                                      |
| Evidencia/capability inventada                              | referencias verificables y checks deterministas contra Registry/Evidence; claims sin respaldo quedan `insufficient_evidence`             |
| Confidence laundering                                       | confidence es señal no confiable y nunca reemplaza Evidence ni Policy                                                                    |
| Evaluator manipulation o collusion                          | separar checks deterministas de juicios IA; blind review cuando sea viable; provenance completo y ningún juez concede autoridad          |
| Síntesis maliciosa                                          | binding a propuestas/evaluaciones de origen, nueva evaluación, prohibición de introducir permisos/capabilities no rastreables            |
| Context leakage entre participantes                         | slices por destinatario/fase, allowlist de referencias, materialización aislada, digest y ausencia de propuestas ajenas en primera ronda |
| Context-slice escalation o cross-workspace reuse            | binding a context/workspace/participant/fase; mismatch o referencia stale falla cerrado                                                  |
| Policy/Approval bypass                                      | toda llamada entra por Planner → Policy/Approval → Runtime; output no modifica decisiones                                                |
| Hidden fallback o destino no autorizado                     | conjunto elegible y destinos fijados antes del dispatch; cambio material invalida plan/approval                                          |
| Budget amplification o loops                                | ledger Runtime monotónico; límites de participantes/rondas/calls/bytes/coste/tiempo y reparaciones; sin recursión libre                  |
| Stale proposal replay o digest substitution                 | versiones, expiry cuando aplique, request/context/slice digests y correlación con el run                                                 |
| Unknown remoto convertido en resultado                      | ADR-0011, `remote_state_unknown`, dependencias bloqueadas y cero retry automático inseguro                                               |
| Cancelación no confirmada                                   | `cancel_requested` separado de terminal; UNKNOWN si no existe confirmación verificable                                                   |
| Datos sensibles propagados                                  | minimización por slice, exclusiones, preview de destino, redacción y private mode sin red ni persistencia adicional                      |
| DoS por streams/outputs/participantes                       | límites de cardinalidad, tamaño, tiempo, coste y cancelación por rama en B2.1                                                            |
| Recursive delegation explosion                              | toda delegación vuelve al orquestador; max depth/participants/calls y nueva Policy/planificación                                         |
| Provenance/Audit tampering                                  | digests canónicos, referencias inmutables y audit append-only; fail-closed ante inconsistencia                                           |

## Reglas de independencia y revisión ciega

Provider route no prueba inteligencia independiente. La misma familia/versión de
modelo por dos rutas comparte grupo de independencia salvo evidencia material.
Cuando una crítica pueda ser ciega, el payload omite marca/modelo/route y
conserva la identidad real solo en la capa de provenance accesible al harness y
Audit.

Blind review reduce sesgo; no oculta conflictos al sistema ni elimina la
necesidad de correlación. El evaluador tampoco puede autoatestiguar evidencia.

## Private mode

Private mode bloquea rutas de red. Solo pueden participar capacidades locales
elegibles. No se persisten prompts, slices, proposals o critiques por comodidad;
si eso impide recovery durable, la UI debe mostrar la renuncia. No se amplía
retención ni se promete eliminación forense.

## Riesgos residuales

Los modelos pueden coincidir, coludirse o producir afirmaciones plausibles pero
falsas incluso con identidades distintas. Blind review no elimina sesgo. Los
digests no protegen contra control completo del proceso local. La calidad de una
decisión depende de criterios y evidencia disponibles. Por eso deliberación
nunca reemplaza Policy, Approval, verificación postflight ni revisión humana en
acciones de alto impacto.

P3-B2.1 demuestra aislamiento de slices, budgets agregados transaccionales,
cancelación y estado durable de ramas. Los controles ejecutables incluyen
bindings/digests exactos, profundidad uno, solo lecturas seguras, slices
exclusivos, concurrencia acotada, `cancel_requested`, UNKNOWN conservador,
Evidence por rama y private mode sin persistencia/red. Permanecen riesgos
residuales de agotamiento local, terminación no confirmada y compromiso total
del proceso/SQLite; todos fallan cerrado o quedan visibles.

P3-B2.2 deberá demostrar resistencia específica a poisoning, false consensus,
evaluator manipulation y síntesis maliciosa. Ningún control B2.1 autoriza por sí
solo Strategy Deliberation.
