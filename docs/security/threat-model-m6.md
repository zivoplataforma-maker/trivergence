# Threat model M6: workflows, agentes y memoria

Estado: gate de seguridad verificado para M6  
Fecha: 2026-09-10  
Método: STRIDE simplificado por activo y frontera

## Alcance y supuestos

Incluye el pipeline local de cinco pasos, sus contratos, budgets, provenance y
memoria persistida. Todo objetivo, memoria recuperada y texto producido por el
Reference Provider se considera no confiable. Los agentes no son principals de
seguridad: son transformadores de datos dentro de un plan ya autorizado.

No cubre proveedores externos, herramientas agenticas, ejecución paralela,
memoria semántica, sincronización ni protección contra administrador/kernel
comprometidos.

## Activos

- autoridad exclusiva de Strategy/Planner/Registry/Evaluation y Policy Engine;
- integridad del DAG, approvals, budgets, outputs y evidencias;
- confidencialidad e integridad de la memoria local;
- trazabilidad run → plan → step → equipo → workflow → memoria → resultado;
- disponibilidad acotada de CPU, tiempo, memoria y almacenamiento;
- estado fail-closed de los proveedores externos.

## Fronteras

1. intención/UI → Orchestration Engine;
2. Runtime → dispatcher de subsistema;
3. memoria persistida → contexto de agentes;
4. AgentTeam → Provider Adapter local;
5. contribuciones → Workflow Engine;
6. candidato → memoria funcional;
7. memoria comprometida → evaluación final y evidencia.

## Amenazas, controles y verificación

| ID    | Amenaza                                      | Control implementado                                                                 | Evidencia automatizada                                    |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| M6-01 | memoria/objetivo intenta cambiar policy      | agentes no reciben API de policy, approvals, Runtime ni tools; contenido sigue datos | E2E solo registra capabilities planificadas               |
| M6-02 | agente sustituye provider o habilita red     | constructor exige `reference` + `localOnly`; descriptor declara red vacía            | test rechaza provider externo; trust store vacío en E2E   |
| M6-03 | bucle o replan ilimitado                     | workflow fijo, DAG acíclico y `maxReplans <= 1`                                      | contract test y test de una única reparación              |
| M6-04 | agotamiento de llamadas/bytes/coste/tiempo   | budget agregado y remanente por llamada; fallo cerrado                               | tests de overcommit, input exhaustion y consumo de repair |
| M6-05 | output de otro paso se usa sin dependencia   | Runtime filtra por `dependsOn` directo                                               | test de visibilidad de outputs                            |
| M6-06 | dispatcher muta output previo o descriptor   | snapshots separados, profundos e inmutables                                          | test de mutación anidada                                  |
| M6-07 | contribution o candidato adulterado          | schemas y SHA-256 canónico por envolvente/contenido                                  | tests de provenance de equipo y candidato                 |
| M6-08 | memoria envenenada o corrupta                | digest al commit y recall; provenance tipado; contenido SQL inmutable                | test de digest inconsistente y trigger de persistencia    |
| M6-09 | replay/mix de otro run, plan o workflow      | provenance liga run/plan/step/workflow/equipo; FKs y checks finales                  | E2E valida cadena y cinco evidencias                      |
| M6-10 | retención indefinida o borrado no observable | TTL obligatorio, soft delete, poda y eventos sanitizados                             | test de forget, expiración y audit chain                  |
| M6-11 | objetivo/resultado filtra a logs             | audit payload escalar y content-free; output efímero                                 | E2E comprueba ausencia del objetivo en auditoría          |
| M6-12 | resultado fallido se presenta como aceptado  | checks deterministas y outcome final; dispatcher traduce rechazo a fallo             | E2E exige todos los checks y resultado `accepted`         |
| M6-13 | capability externa se activa por accidente   | attestations no confiadas, capabilities externas `unavailable`                       | E2E comprueba trust store `[]`                            |
| M6-14 | payload grande bloquea UI/DB                 | límites Zod, memoria por cantidad/bytes y output Runtime acotado                     | contract/budget tests y límite del Runtime                |
| M6-15 | cancelación deja commit parcial              | DAG secuencial; un resultado no exitoso detiene pasos posteriores                    | contrato Runtime y E2E de cancelación existente           |

## Prompt injection y memoria

No se intenta clasificar una cadena como “segura”. Una memoria puede contener
órdenes hostiles y el Reference Provider puede repetirlas, pero ese texto no
puede agregar pasos, cambiar el plan, producir una aprobación ni invocar tools.
Solo un capability descriptor registrado y una decisión de policy revalidada
pueden llegar al Runtime.

La memoria no se comparte entre workspaces. Recall limita cantidad y bytes y
valida digest/provenance antes de entregar contexto. M6 no realiza recuperación
semántica ni importa fuentes remotas.

## Riesgo residual

- una respuesta local puede ser incorrecta aunque su provenance sea íntegra;
- un usuario puede aprobar un workflow cuyo objetivo incluya datos sensibles;
- el contenido funcional de memoria permanece legible para procesos con los
  permisos del mismo usuario si el sistema/disco no lo protege;
- SHA-256 prueba consistencia, no autoría criptográfica;
- timings de JavaScript y cancelación cooperativa no son aislamiento fuerte de
  recursos.

Estos riesgos son aceptables para el Reference Provider local y el alcance M6.
Herramientas agenticas, cloud, autonomía o paralelismo requieren un nuevo threat
review y no pueden apoyarse en este dictamen.

## Gate de salida

- contracts, lint y tipos sin errores;
- unitarios de boundaries, budgets, retención y tampering;
- E2E de las cinco capabilities con approvals, memoria, evaluación y evidencia;
- build de producción y Electron E2E;
- Codex/Claude/Gemini continúan bloqueados;
- `ROADMAP.md` e `IMPLEMENTATION_STATUS.md` solo cambian a `DONE` después de
  pasar el gate completo.
