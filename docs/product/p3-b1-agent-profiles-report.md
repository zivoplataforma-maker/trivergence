# P3-B1 — informe de Agent Profiles

Fecha: 2026-09-25  
Estado: `DONE`

## Resultado y arquitectura

P3-B1 evoluciona el equipo secuencial M6: `planner`, `critic` y `synthesizer`
son ahora perfiles declarativos `planning`, `critique` y `synthesis`. No se creó
otro sistema de agentes, worker, scheduler ni negociación multiagente.

`AgentProfile` v1 contiene ID estable, revisión, responsabilidad, guidance de
baja confianza, requisitos abstractos de capability, contexto, constraints,
límites medibles y provenance de configuración. El catálogo normaliza listas y
calcula SHA-256 sobre JSON canónico. Los perfiles no contienen provider ID,
modelo, backend, credential, Policy grant o approval. Un perfil describe el
trabajo, no su autoridad ni su ejecutor.

El flujo actual es:

`Objective → Project Context → Strategy (elegibilidad) → Planner (refs de perfil) → Runtime (revalidación) → equipo M6 secuencial → Evidence`

Capability Registry determina disponibilidad; Strategy descarta rutas con
requisitos ausentes. Planner fija referencias `profileId/revision/digest` en el
step y en el digest del plan. Runtime exige el catálogo y rechaza sustitución o
versión histórica ausente antes de dispatch. El equipo verifica la misma
secuencia y atribuye cada contribución a su perfil. La reparación exige la
referencia exacta del perfil de síntesis. No hay fallback a `latest`.

## Persistencia, privacy y budgets

Migration `0010_agent_profile_references` añade JSON acotado a `plan_steps` y
`durable_workflow_steps`; los datos son solo referencias. Los perfiles viven en
el catálogo local versionado, sin tabla propia. Al reabrir SQLite, la referencia
durable debe seguir coincidiendo con el plan y la configuración actual; si no,
el run no despacha. Project Context se referencia, no se copia.

Los límites de input bytes, output bytes, tiempo y coste del perfil se aplican
como mínimo con los globales; no hay métrica inventada de tokens. El budget
durable de Runtime no se reinicia. Policy/Approval no cambian y siguen siendo
obligatorios. Private mode puede conservar la referencia de configuración en el
plan redacted existente, pero no crea workflow durable ni nuevos prompts
persistidos.

## Límites explícitos

- Reference Provider sigue siendo el único provider ejecutable; el equipo M6
  conserva su gate local, separado de las definiciones provider-agnostic.
- Los perfiles iniciales son configuración empaquetada; no hay editor, descarga
  ni plugins de perfiles.
- `AgentTeam` conserva ejecución secuencial y el máximo de tres contribuciones
  del contrato M6. P3-B2 deberá versionar sus propios contratos para fan-out.
- El guidance puede influir en el texto generado, no en Policy, Approval,
  Registry, budgets o el plan.
- ADR-0012/0013/0014 completo/0015 siguen pendientes de implementación;
  `WorkflowExecutionSnapshot` no se materializó.

## Verificación

Se añadieron 28 tests de identidad/revisión/digest, normalización, requisitos
obligatorios/opcionales, Policy y privacidad, constraints/budgets, provenance,
reparación, SQLite reopen/migration, Runtime restart, rechazo de sustitución y
regresión del flujo M6. Total: **240 tests**.

| Gate               | Resultado |
| ------------------ | --------- |
| format             | PASS      |
| lint               | PASS      |
| typecheck fresco   | PASS      |
| build fresco       | PASS      |
| tests frescos      | PASS      |
| Electron E2E       | PASS      |
| Electron smoke     | PASS      |
| security           | PASS      |
| SBOM               | PASS      |
| relative links     | PASS      |
| whitespace         | PASS      |
| secret scan        | PASS      |
| scope verification | PASS      |

El test Windows de terminación de árbol, E2E y smoke se verifican fuera del
sandbox de Codex, que no permite esas operaciones. Ningún provider externo fue
habilitado. M5 y M7 permanecen `PARTIAL`.

## Siguiente paso mínimo

Detenerse tras commit local de P3-B1. P3-B2 (fan-out/fan-in) requiere una tarea
separada; no comenzó aquí.
