# ADR-0014: clasificación conservadora de efectos

Estado: `PROPOSED` — decisión documental; implementación diferida  
Fecha: 2026-09-22

## Contexto

ADR-0011 exige clasificar operaciones de forma conservadora para impedir retries
o approvals inseguros. La función actual acepta un `effectClass` explícito antes
de derivar el mínimo por kind/risk. Una declaración errónea podría etiquetar
`DELETE` como `PURE`. Policy conserva defensas adicionales, pero recovery y
auditoría registrarían un efecto subestimado.

## Decisión propuesta

La clasificación efectiva nunca puede ser inferior al nivel mínimo derivado de
la naturaleza observable de la operación. Debe calcularse como el máximo de:

- operation kinds;
- destructive flag o riesgo equivalente;
- destino y frontera de confianza;
- efecto declarado por la capability;
- policy metadata aplicable.

Orden conservador conceptual:

`PURE < READ_ONLY < REVERSIBLE < SIDE_EFFECTFUL < IRREVERSIBLE`.

Una declaración puede elevar el nivel, nunca reducirlo. Por ejemplo:

`declared = PURE + operation = DELETE → effective = IRREVERSIBLE`.

## Reglas mínimas

1. `delete` o destructive implica al menos `IRREVERSIBLE` salvo que exista una
   semántica de compensación explícita y aprobada en un contrato futuro; no se
   infiere reversibilidad.
2. `write`, `execute`, `network`, `git`, `system` o `credentials` implica al
   menos `SIDE_EFFECTFUL`.
3. Un destino externo o billing observable no puede clasificarse `PURE`.
4. `REVERSIBLE` requiere compensación definida; tener un comando inverso no
   basta.
5. Metadata desconocida o contradictoria eleva riesgo o falla cerrado.
6. Planner, Policy, Runtime, approval, audit y recovery deben usar la misma
   clasificación efectiva versionada.

## Consecuencias y deuda

Será necesaria una función de combinación versionada, fixtures de
subclasificación y migración/compatibilidad de descriptors. El código actual no
cambia en P3-0; la discrepancia permanece deuda técnica explícita.
