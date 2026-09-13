# Prioridades por área

Estado: activo  
Fecha: 2026-09-10

Este orden combina valor, dependencia y riesgo. Una prioridad posterior puede
investigarse, pero no entra en implementación si su gate anterior no está
verificado.

## 1. Calidad e integración — cerrar M2

Estado: `DONE` — verificado el 2026-08-04.

**Objetivo:** demostrar que el preview funciona de extremo a extremo en la app
real, no solo en pruebas unitarias.

Entregables:

- E2E aislado que abre Electron con el build de producción;
- interacción renderer → preload → IPC → Orchestration Engine → renderer;
- verificación de estrategia secuencial, dos pasos dependency-first y estado
  `ready` sin ejecución;
- smoke y E2E sin reutilizar el perfil global de Electron.

Gate: `pnpm check`, `pnpm e2e:desktop` y `pnpm smoke:desktop` pasan. M2 puede
marcarse `DONE`.

## 2. Integridad del dominio de orquestación

Estado: `DONE` — verificado el 2026-08-04.

**Objetivo:** producir artefactos que M3 pueda persistir y autorizar sin
ambigüedad.

Entregables: representación canónica de plan, hash estable, identidad de
snapshot del Registry, contratos de run/step/evidence y revalidación explícita.

Gate: mutar plan, policy, capability snapshot o target cambia/invalida el hash;
fixtures y contract tests cubren compatibilidad de versión.

## 3. Persistencia y auditoría

Estado: `DONE` — verificado el 2026-08-04.

**Objetivo:** registrar intención, estrategia, plan, evaluación, aprobación y
resultado antes de permitir efectos privilegiados.

Entregables verificados: adaptador `node:sqlite`, migraciones con checksum,
único escritor, repositorio transaccional, append-only lógico y SQL,
sanitización de auditoría, backup con manifiesto y recuperación read-only.
Drizzle se difiere por ADR-0003 mientras su driver `node:sqlite` no sea estable
y no aporte valor suficiente para justificar otra capa.

Gate: migración/rollback y restauración pasan sobre fixtures; una caída de
auditoría bloquea acciones privilegiadas.

## 4. Runtime, aprobaciones y seguridad de ejecución

Estado: `DONE` — verificado el 2026-08-07.

**Objetivo:** ejecutar únicamente pasos persistidos, evaluados y autorizados.

Entregables: dispatcher por subsistema, executable/argv sin shell, cwd/env
acotados, aprobación de un uso, timeout, cancelación de árbol y evidencia ligada
a run/plan/step.

Gate: E2E de allow, deny, approval, timeout, cancel y orphan recovery; mecanismo
Windows de process tree validado.

## 5. Workspace y tools locales

Estado: `DONE` — verificado el 2026-08-07.

**Objetivo:** entregar el primer flujo útil sin IA.

Entregables: selección y canonización, límites de raíz, exclusiones,
symlinks/junctions, lectura/búsqueda, Git status/diff y capabilities publicadas
al Registry.

Gate: fixture temporal completa intención → plan → ejecución read-only →
evidencia sin escape de workspace. Verificado con lectura, búsqueda, status y
diff; traversal, rutas absolutas, secretos, junction externo y configuración Git
hostil fallan cerrado.

## 6. UI, accesibilidad y control del usuario

Estado: `DONE` — verificación automatizada completada el 2026-08-07; la prueba
manual con Narrator queda como gate humano previo a beta.

**Objetivo:** hacer comprensibles planificación, aprobación, ejecución y
recuperación.

Entregables: intención editable, DAG/lista accesible, centro de aprobación,
timeline, estados de error, teclado, Narrator, zoom 200% y contraste WCAG 2.1
AA.

Gate: flujo crítico pasa axe, teclado y prueba guiada; ningún estado depende
solo del color. Ver
[auditoría de accesibilidad M6](../design/accessibility-audit-m6.md).

## 7. Proveedores y compatibilidad externa

Estado: `PARTIAL`; expediente, base fail-closed y contrato ejecutable genérico
verificados el 2026-08-07. Solo la ejecución de proveedores externos está
`BLOCKED` hasta un gate contractual/legal vigente.

**Objetivo:** incorporar un conector solo con evidencia técnica y jurídica.

Entregables completados: metodología, matriz oficial por ruta, ADR, contratos de
attestation, candidatos para Codex/Claude/Gemini, trust store vacío, publicación
`unavailable`, contrato `ProviderAdapter`, dispatcher genérico y Reference
Provider local con transporte, streaming, cancelación, budgets, aprobación,
preview, provenance, errores, recuperación y E2E. Pendientes externos: detección
de versión, fixtures de una versión aprobada, auth delegada visible y parser
acotado del protocolo oficial.

Gate: dictamen humano y confirmación del proveedor cuando corresponda; después,
contract tests de versión desconocida, auth requerida, truncado, cancelación y
formato hostil. Codex App Server es el primer candidato recomendado, sin
habilitación actual.

## 8. Workflows, agentes y memoria

Estado: `DONE` — verificado el 2026-09-10 sin proveedores externos.

**Objetivo:** sumar coordinación avanzada sin transferir autoridad de policy a
un agente o modelo.

Entregables verificados: workflow versionado de cinco capabilities, roles
acotados al Reference Provider local, provenance integral, memoria por workspace
con retención/borrado/poda, aislamiento de outputs y replanificación limitada
por budgets compartidos.

La implementación y las pruebas usan capabilities locales/Reference Provider.
Codex, Claude y Gemini permanecen `unavailable` con trust store vacío.

Gate: ADR-0009 y threat model específicos; ciclos, prompt injection como datos,
tampering y budget exhaustion fallan cerrado. `pnpm check` (105 tests) y el E2E
de Electron pasan.

## 9. Distribución, operaciones y gobernanza

Estado: `PLANNED`.

**Objetivo:** convertir el producto validado en una beta instalable.

Entregables: NSIS/portable, SBOM, licencia/notices, firma, actualización segura,
rollback, revisión de marca y documentación para máquina limpia.

Gate: build reproducible y smoke de instalación/desinstalación en Windows
limpio; firma y canal de actualización verificados.

## Regla de repriorización

Un incidente de seguridad, pérdida de datos o incompatibilidad contractual pasa
por delante de cualquier área. Cambios de orden requieren actualizar este
documento, `ROADMAP.md` e `IMPLEMENTATION_STATUS.md` con la evidencia que los
justifica.
