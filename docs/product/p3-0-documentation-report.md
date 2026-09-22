# P3-0 — informe de normalización documental

Fecha: 2026-09-22  
Resultado: **DONE** para el alcance exclusivamente documental  
Fuente: [auditoría de coherencia v2](master-v2-consistency-audit.md)

P3-0 no modifica código, contratos ejecutables, Runtime, ProviderAdapter,
AdapterHost, autenticación ni trust store. No habilita providers y no inicia
P3-A1. M5 y M7 continúan `PARTIAL`.

## Documentos modificados

### Gobernanza

- [Prompt Maestro](../../TRIVERGENCE_PROMPT_MAESTRO_CODEX.md)
- [Roadmap](../../ROADMAP.md)
- [Estado de implementación](../../IMPLEMENTATION_STATUS.md)

### Arquitectura y decisiones

- [Ownership arquitectónico](../architecture/ownership.md) — nuevo
- [ADR-0011](../architecture/adr/0011-recovery-semantics.md) — clarificado
- [ADR-0012](../architecture/adr/0012-provider-agnostic-recovery-envelope.md) —
  nuevo
- [ADR-0013](../architecture/adr/0013-integrated-interrupted-recovery-conformance.md)
  — nuevo
- [ADR-0014](../architecture/adr/0014-conservative-operation-effect-classification.md)
  — nuevo
- [ADR-0015](../architecture/adr/0015-workflow-execution-snapshots.md) — nuevo
- [Arquitectura de Provider Adapters](../architecture/provider-adapters.md)

### Expedientes y amenazas de providers

- [Codex App Server](../providers/codex-app-server-gate.md) y
  [resumen Codex](../providers/codex.md)
- [Claude](../providers/claude-gate.md) y
  [resumen Claude](../providers/claude.md)
- [Google/Gemini](../providers/google-gemini-gate.md) y
  [resumen Gemini](../providers/gemini.md)
- [Comparación vigente](../providers/comparison-2026-08-07.md)
- [Threat model Codex](../security/threat-model-codex-app-server.md),
  [Claude](../security/threat-model-claude.md) y
  [Google/Gemini](../security/threat-model-google-gemini.md)

La auditoría fuente permanece como documento nuevo pendiente en el árbol. Este
informe es el único documento adicional creado para el cierre de P3-0.

## ADRs creados o modificados

| ADR      | Estado                         | Resolución documental                                                                                                                             |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0011 | `ACCEPTED`, clarificación P3-0 | Capability no equivale automáticamente a método `recover()`; query y cancel pueden ser operaciones independientes; deuda de AdapterHost explícita |
| ADR-0012 | `PROPOSED` al cierre de P3-0   | Envelope discriminado para cursor local, operation ID, reconnect cursor, resume token, idempotency ID y estado opaco validado                     |
| ADR-0013 | `PROPOSED` al cierre de P3-0   | `interrupted_recovery` pertenece a Adapter + AdapterHost + Runtime + persistence; el fixture no puede autoatestiguar seguridad                    |
| ADR-0014 | `PROPOSED` al cierre de P3-0   | La clasificación efectiva es como mínimo el mayor riesgo derivado; una declaración nunca puede rebajarlo                                          |
| ADR-0015 | `PROPOSED` al cierre de P3-0   | `WorkflowExecutionSnapshot` confirmado e inmutable es distinto de `ProviderRecoveryCheckpoint`                                                    |

Esta tabla conserva el estado histórico al cerrar P3-0. Los cuatro ADR fueron
corregidos y aceptados posteriormente en [P3-0.1](p3-0-1-adr-review.md); su
implementación continúa pendiente.

## Resolución de las 12 correcciones

| #   | Estado     | Resolución                                                                                |
| --- | ---------- | ----------------------------------------------------------------------------------------- |
| 1   | `RESOLVED` | Prompt separa routing actual de selección integral futura de providers                    |
| 2   | `RESOLVED` | Formatter oficial aplicado a gobernantes y documentos P3-0; format global pasa            |
| 3   | `RESOLVED` | ADR-0011 asigna capabilities a operaciones y registra el desajuste de AdapterHost         |
| 4   | `RESOLVED` | ADR-0012 define el recovery envelope provider-agnostic sin implementarlo                  |
| 5   | `RESOLVED` | ADR-0013 define conformance integrada y evita autoatestiguación conceptual                |
| 6   | `RESOLVED` | ADR-0014 establece elevación conservadora de effect class                                 |
| 7   | `RESOLVED` | Dossiers y threat models usan ADR-0011 como conclusión vigente; lo previo queda histórico |
| 8   | `RESOLVED` | Matriz comparativa renovada documentalmente al 2026-09-22 sin nueva investigación externa |
| 9   | `RESOLVED` | Arquitectura no elige ganador y registra metadata histórica de código como deuda          |
| 10  | `RESOLVED` | ADR-0015 separa workflow snapshot de provider checkpoint                                  |
| 11  | `RESOLVED` | Roadmap adopta P3-0→A1→D0→E1→B1→B2→C→A2→F1→F2                                             |
| 12  | `RESOLVED` | Tabla normativa y documento de ownership definen una única responsabilidad principal      |

Todas se consideran resueltas **documentalmente**. Las correcciones que exigen
código permanecen diferidas y no forman parte de P3-0.

## Contradicciones remanentes

No queda una contradicción documental activa entre los documentos gobernantes,
ADR-0011 y las conclusiones vigentes de providers. Permanecen discrepancias
documentación-código deliberadamente registradas:

1. `AdapterHost` exige hoy `recover()` ante cualquier lista no vacía de recovery
   capabilities.
2. `ProviderRecoveryCheckpoint` sigue materializando el cursor local del
   Reference Provider.
3. La suite reusable aún acepta una callback de interrupted recovery provista
   por el fixture.
4. La clasificación explícita de efecto puede preceder al mínimo conservador
   derivado.
5. Catálogo/manifests conservan “Anthropic ant CLI” y
   `recommendedFirstProviderId = "codex"`.

Estas discrepancias no habilitan providers ni autorizan modificar contratos.

## Deuda técnica que requiere código

| Deuda                                                  | Fase mínima futura                  | Condición previa                               |
| ------------------------------------------------------ | ----------------------------------- | ---------------------------------------------- |
| Validación capability→operación en AdapterHost         | decisión posterior a ADR-0011       | aprobar contrato versionado y tests            |
| Recovery envelope discriminado y migración             | fase específica posterior           | aprobar ADR-0012                               |
| Harness integrado de conformance                       | fase específica de tests            | aprobar ADR-0013; conservar 14 checks          |
| Combinación conservadora de effect class               | fase específica de contratos/policy | aprobar ADR-0014 y migración                   |
| Schema/persistence de WorkflowExecutionSnapshot        | P3-E1 futuro                        | aprobar ADR-0015; branching sigue experimental |
| Limpiar catálogo/manifests y recomendación de provider | deuda M5 separada                   | no elegir ganador; no cambiar trust store      |

## Gates

| Gate               | Resultado | Observación                                                                        |
| ------------------ | --------- | ---------------------------------------------------------------------------------- |
| Format             | `PASS`    | `prettier --check .` sobre todo el repositorio                                     |
| Relative links     | `PASS`    | Todos los enlaces relativos de los Markdown modificados resuelven                  |
| Whitespace         | `PASS`    | `git diff --check` sin errores                                                     |
| Secret scan        | `PASS`    | Sin tokens, claves o private keys en documentos modificados                        |
| Scope verification | `PASS`    | Todos los cambios del árbol son archivos Markdown; cero código/config/dependencias |
| Lint               | `PASS`    | Control general fresco                                                             |
| Build              | `PASS`    | 12 proyectos, control general fresco                                               |
| Typecheck          | `PASS`    | 12 proyectos, control general fresco                                               |
| Tests              | `PASS`    | 149/149 fuera del sandbox de Codex                                                 |

El primer `pnpm check:fresh` dentro del sandbox pasó format, lint, build y
typecheck, pero el test Windows de terminación del árbol de procesos no pudo
confirmar `taskkill /T`. La repetición de `pnpm test:fresh` en el entorno
Windows normal pasó 149/149. No se modificó código para alterar el resultado.

## Scope verification y garantías negativas

- ningún archivo TypeScript/JavaScript/JSON/config fue modificado;
- no se agregaron dependencias;
- ProviderAdapter, AdapterHost y Runtime no cambiaron;
- el trust store y autenticación no cambiaron;
- ningún provider fue habilitado;
- Reference Provider sigue siendo el único ejecutable;
- P3-A1, M5-B1 y M7 no avanzaron.

## Diffstat y Git

El cierre contiene 15 documentos tracked modificados y 7 documentos Markdown
nuevos en el working tree: la auditoría fuente, ownership, cuatro ADRs y este
informe. El diffstat final y `git status` se reportan también en la entrega de
la tarea; no se creó commit.

## Siguiente paso mínimo recomendado

Al cierre histórico de P3-0 correspondía someter ADR-0012 a ADR-0015 a revisión.
Esa revisión se completó en P3-0.1. El siguiente paso mínimo pasa a ser **P3-A1
— Project Context mínimo**, con alcance propio y sin mezclar las deudas de
recovery ni iniciar providers.
