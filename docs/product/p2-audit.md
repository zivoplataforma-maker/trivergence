# Auditoría P2 — product hardening y preparación de M5

Fecha: 2026-09-15  
Base auditada: `main` en `6f81f26ac42887d9ce80d9bdac02495e14e8628e`

## Alcance y línea base

Se contrastaron código y pruebas —no solo documentación— en Orchestration
Engine, Strategy, Planner, Evaluation preflight/postflight, Runtime,
AdapterHost, ProviderAdapter, Policy, aprobaciones, persistencia, privacidad,
recuperación y renderer. `IMPLEMENTATION_STATUS.md` y `ROADMAP.md` ya describían
P1 como terminado y mantenían M5/M7 en `PARTIAL`.

Antes de modificar, pasaron sin caché formato, lint, build, typecheck y 139
tests. También pasaron Electron E2E, smoke, seguridad y SBOM con 451 componentes
y cero vulnerabilidades conocidas.

## Hallazgos y resolución

| Severidad | Hallazgo                                                                                                                                      | Resolución P2                                                                                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alta      | Un dispatcher futuro podía devolver un error que repitiese datos privados; su `summary` se persistía como evidencia y motivo del run.         | Runtime sustituye summaries y excepciones por motivos estructurales en modo privado. Una regresión inyecta objetivo, argumento y error secretos y verifica el export completo. |
| Media     | Las pruebas del Reference Provider cubrían el contrato, pero estaban repartidas y no constituían una puerta reutilizable para otro adaptador. | Suite framework-neutral exportada con 14 checks, ejecutada contra Reference Provider.                                                                                          |
| Media     | La configuración tipada podía representar combinaciones imposibles, por ejemplo ejecución habilitada con gate pendiente.                      | Invariantes cruzadas fail-closed y estado `availability` separado de bloqueo y habilitación.                                                                                   |
| Media     | `ProviderStepDispatcher` conservaba una construcción heredada capaz de crear un host privado.                                                 | El dispatcher exige ahora un `AdapterHost` explícito; Desktop y todos los fixtures comparten esa única frontera.                                                               |
| Baja      | El backend ya recorría objetivo → postflight, pero la UI lo presentaba como paneles independientes y usaba “preview” en la acción principal.  | Rail de seis etapas y acción “Comparar rutas y crear plan”, sin cambiar capacidades.                                                                                           |
| Baja      | Faltaban capturas reales y revisables para GitHub.                                                                                            | Seis PNG generados por el E2E real con datos desechables y documentación de regeneración.                                                                                      |

No se encontró una segunda ruta de ejecución externa, una credencial accesible
al renderer ni código muerto confirmado por lint/búsqueda. La superposición
entre tests unitarios, E2E de Runtime y la nueva conformidad se conserva: cada
nivel prueba una frontera distinta.

## Flujo verificado

`Objetivo → Strategy → Plan → preflight → aprobación → AdapterHost/Runtime → ejecución → postflight → resultado → evidencia/historial`

Strategy compara rutas publicadas por Registry. Evaluation no ejecuta; Runtime
revalida plan/policy/descriptor. Todo paso provider-owned se resuelve por el
dispatcher único y AdapterHost. El Reference Provider continúa siendo una
fixture local, no una IA ni autorización para terceros.

## Riesgos que permanecen

- M5 depende del gate técnico, contractual y legal de una interfaz oficial, su
  autenticación y fixtures por versión. Ningún candidato externo está alojado.
- La detección por PATH no prueba versión, fingerprint, salud ni autenticación;
  por eso no concede disponibilidad ni ejecución.
- M7 sigue pendiente de reproducibilidad NSIS, firma, matriz limpia Windows
  10/11, revisión de notices transitivos y canal de actualización autorizado.
- La cadena append-only, backups, cuarentenas y exportaciones no se eliminan al
  borrar datos activos; la UI y privacidad lo comunican expresamente.
- Las capturas automatizadas no sustituyen validación humana con Narrator ni
  revisión visual en configuraciones Windows adicionales.

## Evidencia local posterior

Tras los cambios pasaron formato, lint, build y typecheck de los 12 proyectos,
142 tests, Electron E2E, smoke, auditoría de dependencias y verificación del
SBOM CycloneDX de 451 componentes. No se detectaron vulnerabilidades conocidas.
El estado permanece `READY_FOR_CI` hasta validar el commit en Windows CI.

## Puerta del próximo adaptador

Un adaptador externo solo puede proponerse después de su gate. Debe publicar
capability/attestation/observación verificables, construir un AdapterHost
explícito, pasar sin excepciones la suite de conformidad y los E2E de Runtime,
privacidad y Desktop. No requiere cambios en los cuatro motores del núcleo.
