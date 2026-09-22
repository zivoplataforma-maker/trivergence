# P3-0.1 — revisión técnica final de ADR-0012 a ADR-0015

Fecha: 2026-09-22  
Resultado: **DONE** para revisión y decisión documental  
Implementación de las decisiones: **PENDING**

## Resumen ejecutivo

Los cuatro ADR fueron revisados contra ADR-0011 y los contratos ejecutables de
ProviderAdapter, AdapterHost, Runtime, persistence, Policy/Approval,
Audit/Evidence, workflows, Memory y provider conformance; también contra el
ownership previsto de Project Context, threat models y documentos gobernantes.

Los cuatro recibieron inicialmente `ACCEPT_WITH_CORRECTIONS`. Después de aplicar
las correcciones documentales y repetir la revisión, quedan `ACCEPTED`. La
aceptación fija arquitectura; no implementa schemas, migraciones, harness,
clasificador ni snapshots.

M5 y M7 continúan `PARTIAL`. Ningún provider fue habilitado y Reference Provider
continúa siendo el único ejecutable. P3-A1 y M5-B1 no comenzaron.

## ADR-0012 — recovery envelope

Decisión inicial: `ACCEPT_WITH_CORRECTIONS`.  
Decisión final: **`ACCEPTED`**.

La propuesta original usaba variantes independientes para conceptos que pueden
coexistir. Se corrigió a un envelope con tres compartimentos ortogonales:
identidad remota, continuación e idempotencia. Se añadieron schema/canonical
versioning, digest, size/expiry, validación del adapter, retención/private mode,
redacción, provenance/budget por referencia y migración fail-closed.

El estado opaco quedó limitado a una extensión namespaced, versionada, acotada y
validada. No es bolsa genérica, credencial, capability, autorización, evidencia
terminal ni permiso de retry. `remote_state_unknown` no se resuelve por poseer
el envelope.

Compatibilidad real: `ProviderRecoveryCheckpoint` versión 1 mantiene
`nextChunkIndex`, `emittedBytes` y `recoveryCursor`. Solo puede migrar a la
variante local del Reference Provider y no adquiere identidad remota.

## ADR-0013 — integrated interrupted recovery conformance

Decisión inicial: `ACCEPT_WITH_CORRECTIONS`.  
Decisión final: **`ACCEPTED`**.

Se conserva exactamente la superficie pública de 14 checks. `recovery` acredita
honestidad/compatibilidad del adapter; `interrupted_recovery` requiere un
harness de ProviderAdapter + AdapterHost + Runtime + persistence.

El fixture puede inyectar fallos y demostrar dónde los inyectó, pero no emitir
el veredicto. Las aserciones pertenecen al harness y observan attempts, conteo
de dispatches, remote state, runs/dependencias, checkpoints, budget/usage,
provenance, Evidence y Audit después de restart/reopen.

Se incorporó explícitamente la matriz mínima pedida: pre/durante dispatch, ACK o
respuesta perdidos, stream, cancelación sin confirmar, recovery vacío, query,
reconnect, idempotencia, efectos side-effectful/irreversible, Runtime restart,
persistence reopen, budget/provenance y resolución humana.

Compatibilidad real: `ProviderConformanceSubject` todavía acepta
`verifyInterruptedRecoveryBoundary`; esa callback puede autoatestiguar el check.
La aceptación no cambia la suite ni cuenta sus tests actuales como harness
integrado.

## ADR-0014 — clasificación conservadora de efectos

Decisión inicial: `ACCEPT_WITH_CORRECTIONS`.  
Decisión final: **`ACCEPTED`**.

`REVERSIBLE` no es un nivel ordinal entre read-only y side-effectful. Se
separan:

- severity: `PURE < READ_ONLY < SIDE_EFFECTFUL < IRREVERSIBLE`;
- compensation assurance: `NOT_APPLICABLE | NONE | DEFINED | VERIFIED`.

Una operación reversible sigue siendo side-effectful. Una compensación definida
o verificada no rebaja severity, no sustituye approval y no demuestra
idempotencia. La declaración explícita solo puede elevar el mínimo derivado de
kind, risk/destructive, destino y policy metadata.

El Planner será owner de una `EffectiveEffectAssessment` versionada. Policy,
Approval, Runtime, Recovery y Audit la consumen/revalidan contra el plan, sin
crear decisiones paralelas. El valor histórico `reversible` se migrará a
`SIDE_EFFECTFUL + DEFINED`, nunca a una clase de menor riesgo.

Compatibilidad real: `classifyOperationEffect` devuelve hoy la declaración antes
de derivar el mínimo; Planner y Runtime invocan el clasificador por separado, y
Policy opera con kind/risk. Todo ello permanece como deuda de implementación.

## ADR-0015 — workflow execution snapshots

Decisión inicial: `ACCEPT_WITH_CORRECTIONS`.  
Decisión final: **`ACCEPTED`**.

`WorkflowExecutionSnapshot` es un manifest inmutable de referencias y digests de
un punto confirmado, no una copia de estado. No puede contener UNKNOWN como
confirmado, afirmar estado remoto, reutilizar approvals, resetear budgets ni
duplicar Memory, Project Context, Audit o Evidence.

La eliminación/expiración de una fuente vuelve el snapshot degradado o no
reanudable; nunca se extiende retención copiando contenido. Private mode puede
impedir persistencia y renunciar explícitamente a resume durable. P3-E1 podrá
usar el concepto para crash recovery/resume, pero branching continúa
`LATER/EXPERIMENTAL`.

Compatibilidad real: no existe schema ni tabla de snapshot de workflow. Los
checkpoints actuales pertenecen exclusivamente al provider.

## Correcciones realizadas

1. Se separaron identidad, continuación e idempotencia en ADR-0012.
2. Se acotó y tipó el estado opaco; se añadieron límites, expiración, digest,
   redacción, retención, private mode y migración histórica.
3. ADR-0013 asignó el veredicto al harness y completó escenarios/oráculos.
4. Se mantuvieron exactamente los 14 checks públicos.
5. ADR-0014 eliminó `REVERSIBLE` como escalón ordinal y separó compensation.
6. Se asignó ownership único de la evaluación efectiva al Planner.
7. ADR-0015 pasó de “datos posibles” a manifest de referencias/digests.
8. Se precisaron invalidación por retención, private mode, budgets y approvals.
9. ADR-0011 recibió una aclaración normativa limitada sobre effect assessment.
10. Prompt Maestro, Roadmap, estado y ownership distinguen decisión aceptada de
    capacidad implementada.

## Contradicciones encontradas y resolución

La contradicción normativa relevante era la jerarquía de ADR-0011/0014 con
`REVERSIBLE` como nivel ordinal. ADR-0011 ahora remite a ADR-0014 y conserva el
valor solo como compatibilidad ejecutable histórica. No cambian sus garantías de
UNKNOWN, retry o recovery.

No quedan contradicciones normativas importantes entre ADR-0011 a ADR-0015:

- capability no equivale a operación;
- checkpoint actual es una variante local histórica, no el envelope universal;
- envelope de provider no es snapshot de workflow;
- estado remoto incierto no es estado local confirmado;
- compensation no rebaja effect severity ni approval;
- conformidad interrumpida es propiedad del sistema integrado.

## Riesgos residuales

- un envelope mal cifrado o con retención excesiva puede filtrar material de
  continuación;
- canonicalización o migración incorrecta puede aceptar replay/cruce de cuenta;
- el harness futuro puede observar una frontera simulada que no represente el
  transporte real;
- compensation “verified” puede fallar en condiciones externas cambiantes;
- snapshots con referencias expiradas pueden impedir resume;
- divergencia entre evaluación persistida y descriptor ejecutado puede producir
  approval/recovery inseguro.

Estos riesgos requieren threat review y tests al implementar cada decisión. Los
threat models actuales ya cubren replay/checkpoint, duplicación de efectos,
UNKNOWN, approvals, budgets, retención y auditoría; no se modificaron porque en
esta fase no cambia la superficie ejecutable.

## Deuda técnica

| Deuda                                                            | Destino mínimo futuro                   |
| ---------------------------------------------------------------- | --------------------------------------- |
| AdapterHost exige `recover()` para cualquier capability no vacía | contrato de operaciones de recovery     |
| `ProviderRecoveryCheckpoint` solo representa cursor local        | implementación ADR-0012 + migración     |
| callback autoatestiguada en `interrupted_recovery`               | harness integrado ADR-0013              |
| enum histórico y declaración de efecto con precedencia           | implementación ADR-0014                 |
| Planner/Runtime calculan effect class de forma independiente     | assessment único ligado al plan         |
| no existe schema/persistence de `WorkflowExecutionSnapshot`      | P3-E1, después de diseño/amenazas/tests |
| no hay invalidación de snapshot por retención/private mode       | P3-E1                                   |

## Compatibilidad con ADR-0011

ADR-0011 sigue siendo la base normativa de recovery. ADR-0012 define el
material; ADR-0013 define cómo demostrar la garantía integrada; ADR-0014 refina
la representación ortogonal de efecto/compensación; ADR-0015 separa recovery de
provider y estado confirmado de workflow. Ninguno reduce el tratamiento
conservador de `remote_state_unknown` ni autoriza retry automático.

## Impacto futuro sobre P3

- **P3-A1:** Project Context debe ser una referencia versionada desde snapshots,
  no contenido duplicado. Puede avanzar sin implementar recovery envelope.
- **P3-D0:** deberá consumir la evaluación efectiva única y exponer lifecycle
  sin crear otro clasificador o supervisor.
- **P3-E1:** deberá implementar ADR-0015 y usar ADR-0012/0013 solo en la
  frontera de providers. Branching queda fuera.

## Gates

| Gate               | Resultado | Evidencia                                                          |
| ------------------ | --------- | ------------------------------------------------------------------ |
| Format             | `PASS`    | Prettier oficial sobre todo el repositorio                         |
| Relative links     | `PASS`    | enlaces relativos de todos los Markdown modificados resuelven      |
| Whitespace         | `PASS`    | `git diff --check` sin errores                                     |
| Secret scan        | `PASS`    | sin patrones de tokens/private keys en Markdown modificado         |
| Scope verification | `PASS`    | 23 cambios del árbol son Markdown; cero código/config/dependencias |
| Lint               | `PASS`    | ESLint general sin errores                                         |
| Typecheck          | `PASS`    | 12 proyectos, ejecución fresca                                     |
| Build              | `PASS`    | 12 proyectos, ejecución fresca                                     |
| Tests              | `PASS`    | 149/149 en Windows fuera del sandbox de Codex                      |

`pnpm check:fresh` completó format, lint, build y typecheck. Dentro del sandbox,
el test conocido de terminación del árbol Windows obtuvo
`treeTerminationConfirmed=false`; la repetición de `pnpm test:fresh` en el
entorno Windows normal pasó 149/149. No se modificó código para alterar el
resultado.

## Diffstat y Git

El working tree acumulado de P3-0 + P3-0.1 contiene 19 archivos tracked
modificados (`1.602` inserciones, `789` eliminaciones en el diffstat) y cuatro
Markdown nuevos. P3-0.1 solo tocó documentación.

`main` y `origin/main` continúan sincronizados (`0/0`) en el commit
`8f87e12d1aac29aac81a021da5591221ea2c7cc3`; el árbol está sucio por los cierres
documentales todavía no committeados. No se creó commit ni se publicó en esta
fase.

## Siguiente paso mínimo recomendado

Detenerse tras P3-0.1. En una tarea nueva, iniciar **P3-A1 — Project Context
mínimo**, usando fuentes existentes y sin mezclar las implementaciones de
ADR-0012/0013/0014/0015, providers externos, M5-B1 o M7.
