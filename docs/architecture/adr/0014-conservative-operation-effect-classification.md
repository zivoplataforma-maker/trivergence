# ADR-0014: clasificación conservadora de efectos

Estado: `ACCEPTED` — decisión arquitectónica; implementación pendiente  
Fecha: 2026-09-22  
Aceptado: 2026-09-22

## Contexto

ADR-0011 exige clasificar operaciones de forma conservadora para impedir retries
o approvals inseguros. La función actual devuelve un `effectClass` explícito
antes de derivar el mínimo por kind/risk. Una declaración errónea puede
etiquetar `DELETE` como `PURE`. Policy conserva defensas por kind/risk, pero el
plan, recovery y auditoría registrarían un efecto subestimado.

La jerarquía anterior ubicaba `REVERSIBLE` entre `READ_ONLY` y `SIDE_EFFECTFUL`.
Eso mezcla dos preguntas: si una operación produce efectos y si existe una
compensación confiable. Una operación reversible sigue siendo side-effectful,
puede afectar un sistema externo, requerir approval y fallar al compensarse.

## Decisión

La evaluación efectiva tendrá dos ejes independientes:

1. **Effect severity:** `PURE < READ_ONLY < SIDE_EFFECTFUL < IRREVERSIBLE`.
2. **Compensation assurance:** `NOT_APPLICABLE | NONE | DEFINED | VERIFIED`.

`VERIFIED` significa que existe una compensación contractualmente identificada,
permitida, probada para la misma clase de destino y sujeta a Policy/Approval. No
promete que la compensación siempre tendrá éxito. `DEFINED` solo documenta una
compensación; no permite recovery automático ni reduce severity.

La severidad efectiva es, como mínimo, el máximo conservador derivado de:

- operation kinds;
- destructive flag/risk;
- destino y frontera de confianza;
- efecto declarado por la capability;
- policy metadata aplicable.

Una declaración puede elevar riesgo, nunca reducirlo. Por ejemplo:

`declared = PURE + operation = DELETE → effective = IRREVERSIBLE`.

## Reglas mínimas

1. `delete` o destructive implica `IRREVERSIBLE` salvo que un contrato futuro
   demuestre una semántica menos severa; la mera presencia de compensación no lo
   rebaja automáticamente.
2. `write`, `execute`, `network`, `git`, `system` o `credentials` implica al
   menos `SIDE_EFFECTFUL`, excepto una operación Git demostrablemente read-only.
3. Un destino externo, comunicación, publicación o billing observable no puede
   clasificarse `PURE` ni `READ_ONLY`.
4. Reversibilidad/compensación nunca sustituye approval ni prueba idempotencia.
5. Metadata desconocida, incompleta o contradictoria eleva riesgo o falla
   cerrado.
6. La clasificación conserva versión, inputs normalizados y digest para evitar
   reinterpretación posterior.

## Ownership y consumo

El **Execution Planner**, como parte del Orchestration Core, produce una única
`EffectiveEffectAssessment` versionada al construir el plan. La capability y la
Policy aportan entradas, pero no son fuentes paralelas de la decisión efectiva.

- Evaluation preflight verifica que la evaluación exista y sea coherente.
- Policy y Approval consumen esa evaluación al decidir y ligar el descriptor.
- Runtime la revalida contra el plan íntegro, pero no escoge otra clase.
- Recovery usa severity y compensation para prohibir retries/continuaciones
  inseguras.
- Audit/Evidence registran identidad, versión y digest, no una reclasificación.
- Strategy podrá usarla como señal solo cuando el contrato de selección integral
  sea implementado; hoy no se atribuye esa capacidad.

Si los inputs cambian, el plan y su aprobación dejan de ser válidos; no se
actualiza la evaluación in-place.

## Compatibilidad

El valor ejecutable histórico `reversible` se migra conceptualmente a:

`severity = SIDE_EFFECTFUL + compensation = DEFINED`.

La migración no concede `VERIFIED`, no reduce approvals y no autoriza retry. Los
valores `pure`, `read_only`, `side_effectful` e `irreversible` mantienen su
severidad histórica, sujetos a elevación conservadora.

Esta decisión refina únicamente la representación de clase de efecto de
[ADR-0011](0011-recovery-semantics.md); no cambia sus invariantes de UNKNOWN,
retry ni recovery.

## Consecuencias y deuda

La separación evita falsa seguridad y permite modelar compensación sin esconder
efectos. La implementación futura requiere contrato versionado, migración,
clasificador único, actualización de plan/integridad/policy/approval/runtime y
fixtures de subclasificación.

El código actual todavía usa el enum ordinal con `reversible` y calcula la clase
en Planner y Runtime. Esta aceptación no lo modifica ni afirma que la nueva
evaluación esté implementada.
