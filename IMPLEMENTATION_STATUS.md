# Estado de implementación

Última actualización: 2026-09-14

Leyenda: `DONE` verificado, `PARTIAL` existe pero no cumple toda la aceptación,
`PLANNED` no iniciado, `BLOCKED` requiere una decisión o dependencia externa.

| Hito                                | Estado  | Evidencia / bloqueo                                                                                                |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| M0 — especificación y riesgos       | DONE    | Documentos reencuadrados: orquestación como núcleo, ADR-0002, seguridad, UI, datos y roadmap coherentes.           |
| M1 — foundation segura              | DONE    | Shell seguro, IPC nominal, diagnóstico, Policy Engine, build, smoke y E2E aislado verificados.                     |
| M2 — kernel de orquestación         | DONE    | Cuatro motores, contratos y preview verificados de renderer a UI sobre el build real de Electron.                  |
| M3 — Runtime, aprobación y audit    | DONE    | Plan persistido, aprobación de un uso, supervisión, evidencia, timeout/cancel y orphan recovery verificados.       |
| M4 — workspace/capacidades reales   | DONE    | Selección, preview, ejecución/cancelación, resultado y evidencia read-only verificados desde la UI.                |
| M5 — primer conector                | PARTIAL | Contrato/Reference Provider local verificados; ningún proveedor externo superó aún su gate.                        |
| M6 — workflows, agentes y memoria   | DONE    | Pipeline local de cinco pasos, budgets, provenance, memoria, evaluación, auditoría, E2E y build verificados.       |
| M7 — hardening/distribución Windows | PARTIAL | Controles y paquete unsigned verificados localmente; faltan reproducibilidad NSIS, firma y matriz limpia Win10/11. |

## P1 transversal hacia v1.0 (2026-09-14)

Estado: `DONE` para el alcance P1 descrito aquí. Gates locales frescos `PASS` y
CI Windows del commit `cf2146fb329d3cd06ca57994fbd9fd9c77ea14ff`
[run 34903034199](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34903034199)
`success`: instalación limpia, check sin Turbo cache, E2E, smoke y seguridad. M5
y M7 siguen `PARTIAL`.

- Historial persistido y eventos de auditoría consultables por workspace desde
  la UI, con estado visible de la cadena y exportación JSON.
- Recuperación mostrada al arrancar, incluso antes de elegir carpeta: motivo,
  archivos, ubicación de cuarentena, modo de la base y ejecuciones huérfanas. Un
  fallo que impida abrir o preservar la base muestra error modal y cierra.
- Modo privado no persiste nuevos textos de objetivo ni argumentos de pasos; el
  workflow no recuerda memoria guardada ni persiste su resultado temporal. El
  modo estándar conserva la memoria funcional con retención acotada.
- Retención de 1–365 días solo tras guardarla explícitamente, borrado confirmado
  de datos activos por workspace y vaciado de contenido/provenance de memoria
  eliminada o expirada. La cadena append-only, backups y exportaciones no se
  borran; no se afirma eliminación forense.
- El journal de archivos M7 se documenta como SHA-256 no autenticado. El número
  de versión se declara únicamente en `apps/desktop/package.json`; SBOM y
  verificación de paquete lo leen de esa fuente.
- Licencia Apache-2.0 y notices del repositorio añadidos al paquete de ensayo.
  La revisión exhaustiva de dependencias y sus obligaciones sigue en M7.
- Evidencia local: `pnpm check:fresh` pasó con formato, lint, build/typecheck de
  12 proyectos y 139 tests; `pnpm e2e:desktop`, `pnpm smoke:desktop`,
  `pnpm sbom:generate` y `pnpm security` pasaron. No se detectaron
  vulnerabilidades conocidas; SBOM verificado con 451 componentes.
- `pnpm package:win` generó el instalador unsigned; en `win-unpacked/resources`
  se verificó presencia de `LICENSE`, `NOTICE` y `THIRD_PARTY_NOTICES.md`. Esto
  no satisface firma, reproducibilidad ni licencias transitivas de M7.

## Orchestration Space y preparación de proveedores (2026-09-14)

Estado: interfaz y configuración local `DONE`; conexión y ejecución externa
siguen `PARTIAL` dentro de M5. Ninguna evidencia de este cambio cierra M7.

- Rediseño de navegación, superficie objetivo primero, resumen de sesión y
  sección separada Proveedores. Los detalles técnicos de la carpeta siguen
  disponibles bajo desplegable. La vista de Proveedores distingue instalación,
  autenticación, gate, ejecución y bloqueo con razones explícitas.
- Preferencias locales versionadas y validadas: proveedor preferido, dirección
  loopback y nombre de modelo Ollama. No hay campos de key/token/password, login
  ni conexión de red. Guardar no altera el Registry, AdapterHost, Strategy
  Engine ni las attestations. La preferencia todavía no enruta ejecuciones.
- Archivo de preferencias con límite, rechazo de campos desconocidos, temporal
  exclusivo y rename; corrupción preservada en modo solo lectura. Modelos cloud
  de Ollama no se ejecutan. APIs con key quedan como extensión futura aislada.
- Evidencia local fresca: `pnpm check:fresh` pasa con formato, lint,
  compilación, typecheck y **138 tests**. En el sandbox, la prueba de
  terminación de árbol Windows falla por restricciones del entorno; fuera del
  sandbox pasa. `pnpm e2e:desktop` pasa el workflow completo y el
  guardado/rechazo de gate falsificado. axe WCAG AA y zoom 200 % pasan en ambas
  vistas. También pasan `pnpm smoke:desktop`, `pnpm sbom:generate` y
  `pnpm security`; npm no informa vulnerabilidades conocidas y el SBOM
  verificado contiene 451 componentes.
- Detalle de diseño, límites y amenaza: `docs/design/orchestration-space.md` y
  `docs/architecture/provider-configuration.md`.

## Entorno de descubrimiento

- Windows 11, PowerShell 5.1.
- Node `v24.14.0`.
- pnpm configurado y verificado en `11.19.0`.
- Git `2.53.0.windows.1`.
- Codex detectado; Claude Code detectado; Gemini CLI no detectado.
- El directorio inicial no era un repositorio Git.
- `npm.ps1` está bloqueado por la execution policy local; los scripts usarán
  `pnpm` y no alterarán la política del sistema.

## P0 de la auditoría v1.0

Estado: `DONE` para el alcance P0. Los gates frescos pasaron localmente y la CI
Windows del commit `bf80d3213895ff080dfc6057f423182abe0909cb` terminó verde
([run 34871238822](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34871238822)).
No implica cierre de M5 ni M7.

- `DONE` en código local: Strategy v2 genera/compara/selecciona rutas a partir
  del objetivo y metadatos del Registry; mantiene selección explícita por
  compatibilidad. Privacidad filtra rutas con red y Runtime vuelve a comprobar.
- `DONE` en código local: un `AdapterHost` por sesión aloja el Reference
  Provider; Runtime y equipo de agentes M6 pasan por él. Verifica identidad de
  preview, stream y provenance. No hay adaptadores externos registrados.
- `DONE` en código local: Evaluation Engine separa preflight y postflight;
  postflight comprueba run, snapshot, digest, evidencia y outcomes, y se audita.
- `DONE` en código local: IDs de proveedor extensibles y validados; el trust
  store externo continúa vacío.
- `DONE` en código local: UI objetivo primero, rutas comparadas, privacidad,
  historial acotado por workspace, estado de persistencia y recuperación.
- `DONE`: Git en `main`, commit publicado y workflow Windows de gates frescos
  ejecutado en GitHub Actions.
- Evidencia final: ver sección de auditoría P0 al final de este documento.
  Electron E2E/smoke y Runtime process-tree necesitan ejecutarse fuera del
  sandbox de Codex; dentro de él Chromium y `taskkill /T` son bloqueados.
  `sandbox: true` permanece intacto en el producto.

## Evidencia histórica M1–M7 (2026-09-11)

- `pnpm install --frozen-lockfile`: verificado con política de madurez y scripts
  permitidos por paquete.
- `pnpm lint`: pasa sin warnings.
- `pnpm typecheck`: pasa en los doce paquetes/aplicaciones.
- `pnpm test`: 115 pruebas pasan; 14 corresponden al Orchestration Engine, 12 a
  persistencia/auditoría, 15 al Runtime, 11 al Workspace, 14 a contratos
  estables, 2 a contratos de coordinación, 22 a gate/Provider Adapters/Reference
  Provider, 8 a policy, 3 a agentes, 1 a memoria, 3 a workflows y 10 al desktop.
- `pnpm build`: genera main ESM, preload CJS mínimo y renderer Vite.
- `pnpm smoke:desktop`: Electron usa un perfil de prueba aislado, carga y cierra
  con código 0.
- `pnpm e2e:desktop`: selecciona un workspace real, persiste previews, ejecuta
  una lectura, muestra evidencia, cancela una búsqueda y completa el flujo del
  Reference Provider con preview de contexto, aprobación de un uso, stream y
  resultado; además ejecuta el workflow M6 completo de cinco pasos con tres
  aprobaciones de un uso, resultado/budget/provenance visibles, cinco
  evidencias, axe, teclado y reflow al 200 %.
- `pnpm audit`: cero vulnerabilidades conocidas al 2026-09-11; se fijaron
  `nanoid` 3.3.18 y Vitest 4.1.11 por advisories detectados durante M7.
- Preview: intención de diagnóstico → strategy secuencial → dos pasos
  dependency-first → policy por paso → evaluación `ready` → SHA-256 canónico,
  sin ejecutar.
- Revalidación: mutaciones de plan, policy, target o Capability Registry
  invalidan el artefacto; canonicalization version desconocida se rechaza.
- Persistencia: migraciones/checksum, vínculo run-plan-snapshot-digest,
  auditoría append-only, único escritor, backup/restore y recovery read-only
  verificados.
- Runtime: allow/deny, aprobación granted/denied/expired/consumed, descriptor
  inmutable, timeout, cancelación, árbol Windows y orphan recovery verificados.
- Provider Adapter: puente genérico, transporte streaming, cancelación, budgets,
  preview de contexto, provenance y errores tipados verificados; el uso parcial
  y el último checkpoint válido sobreviven a fallos/cancelación.
- Recuperación de proveedor: checkpoint persistido y ligado a plan/paso/adapter,
  reinicio de Runtime, aprobación nueva, reanudación y consumo único
  verificados.
- Workspace: raíz canónica e identidad revalidada, exclusiones obligatorias y
  del usuario, `.gitignore` conservador, UTF-8/tamaño, traversal, ADS, rutas
  absolutas y junction externo verificados.
- Git read-only: ejecutable absoluto, repo root local, environment/argv
  acotados, porcelain NUL, diff por path explícito y rechazo de helpers,
  includes, object alternates y metadata externa verificados.
- Flujo local: parámetros ligados al hash del plan → Registry → Runtime →
  resultado efímero → evidencia con digest; auditoría no contiene el contenido.
- Desktop: IPC nominal sin bus genérico para selección, preview, ejecución,
  consulta, cancelación y aprobaciones; Main conserva raíz canónica, Registry y
  artefactos, mientras el renderer solo envía intención y referencias opacas.
- Accesibilidad: cero violaciones axe en el flujo crítico, skip link, foco
  visible, controles de 44 px, estados textuales y reflow al 200 %. Narrator
  queda como validación humana previa a beta.
- Proveedores externos: expediente comparativo y attestations candidatas
  creados; el trust store está vacío y las tres capabilities se publican
  `unavailable`. Ninguna versión, auth, login, dispatcher o ejecución externa
  está habilitada. El Reference Provider es local, sin red ni credenciales y no
  forma parte de ese trust store.
- M6: `memory.local.recall` → `agent.reference.team` →
  `workflow.local.synthesis` → `memory.local.commit` → `workflow.local.evaluate`
  se expande por dependencias sin cambios en Strategy, Planner, Registry ni
  Evaluation Engine.
- Agentes: roles planner/critic/synthesizer sin autoridad de policy/tools,
  restringidos por manifest al Reference Provider local y por budgets agregados
  de llamadas, input, output, coste y tiempo.
- Workflows: definición `workflow.local.team-memory-evaluation@1.0.0`, checks
  deterministas y como máximo una reparación usando únicamente budget remanente.
- Memoria: namespace de workspace, límites de cantidad/bytes, TTL, borrado,
  poda, contenido/provenance inmutables salvo redacción al borrar y eventos de
  auditoría content-free.
- Provenance: digests encadenan contribuciones, equipo, candidato, memoria y
  evaluación; alteración falla antes de persistir o produce rechazo.
- Runtime: dispatchers solo ven copias profundas e inmutables de outputs de sus
  dependencias directas; un test impide mutación y acceso lateral.
- Archivos M7: watcher acotado, snapshot de contenido/metadata/digest, rechazo
  de symlink/hardlink, temp en el mismo volumen, `fsync`, rename, journal con
  SHA-256 **no autenticado**, rollback y recovery que no pisan contenido
  inesperado.
- Persistencia M7: una base ilegible se preserva con SQLite/WAL/SHM y hashes en
  cuarentena antes de crear una base sana; un backup solo se activa tras
  SHA-256, `quick_check` y audit chain válidos, preservando la base desplazada.
- Update M7: manifest canónico Ed25519, key id fijado, HTTPS y host allowlist,
  anti-downgrade y verificación de tamaño/digest probados. La red de updates
  permanece deshabilitada (`externalUpdatesEnabled = false`).
- Paquete M7: Electron Builder 26.15.3 + NSIS x64, ASAR integrity y fuses; SBOM
  CycloneDX 1.7 de 451 componentes y manifest de artefactos SHA-256.
- Ensayo local Windows: instalador one-click unsigned instala, arranca el smoke
  empaquetado y desinstala con código 0. Esto no sustituye una VM limpia.
- Gate de reproducibilidad: `app.asar` fue idéntico en dos builds consecutivos
  (`d8848f…cd61`), pero NSIS no (`d8168b…a6e6` frente a `f29beb…62dd`); el
  control queda automatizado y M7 no se cierra hasta resolverlo y repetirlo en
  un segundo host.
- Artefacto final local: `Trivergence-0.7.0-windows-x64-UNSIGNED.exe`, SHA-256
  `f29beb67c82a6df2d8050e4714b5acb878c6d3c1c02e9e536a94dad87cb862dd`;
  instalación, arranque empaquetado y desinstalación `PASS`, firma `NotSigned`.
- Gate final M7: `pnpm check`, `pnpm e2e:desktop`, `pnpm smoke:desktop`,
  `pnpm security`, SBOM y manifest de 79 artefactos pasan el 2026-09-11. M5
  continúa `PARTIAL` y el trust store externo vacío.

## Afirmaciones todavía no permitidas

- Existen flujos locales read-only y de coordinación M6 accesibles de extremo a
  extremo, pero no el MVP completo con proveedor externo, distribución y
  validación humana final.
- Hay un paquete Windows instalable solo para ensayo local, marcado `UNSIGNED`;
  no es una release distribuible y no existe canal de actualización habilitado.
- El centro de aprobación está validado con el Reference Provider local; aún
  falta validarlo contra la interfaz real de un proveedor después de su gate.
- Ningún proveedor externo está integrado o aprobado. Codex App Server es solo
  el primer candidato condicionado; Claude `ant` y Gemini Vertex conservan gates
  separados.
- No se ha realizado revisión legal ni de marca.
- No hay firma Authenticode, evidencia de Windows 10/11 limpios ni instalador
  byte-reproducible; por ello M7 permanece `PARTIAL`.

## Auditoría final P0 — 2026-09-12

- `pnpm check:fresh`: `PASS` sin Turbo cache; Prettier, ESLint, typecheck de los
  12 proyectos, 123 tests de 12 proyectos y build directo de 12 proyectos.
- `pnpm e2e:desktop`: `PASS` tras rebuild directo; workspace, lectura,
  búsqueda/cancelación, Reference Provider y workflow M6, incluidas rutas,
  historial, privacidad y evaluación posterior.
- `pnpm smoke:desktop`: `PASS` con perfil aislado.
- `pnpm sbom:generate` + `pnpm security`: `PASS`; sin vulnerabilidades conocidas
  y SBOM CycloneDX verificado con 451 componentes.
- `graphify update .`: `PASS`; grafo AST actualizado (1.942 nodos, 2.753
  relaciones). Los archivos generados están ignorados por Git.
- Electron/Runtime: los fallos iniciales dentro del sandbox de Codex se
  reprodujeron como restricciones de procesos del entorno; fuera de ese sandbox,
  Runtime 15/15, Electron E2E y smoke pasaron. No se deshabilitó `sandbox: true`
  de Electron ni se incorporó `--no-sandbox` al producto.
- Git: al corte de esta auditoría (2026-09-12) aún no había commit ni remoto.
  Posteriormente se publicó `bf80d321` y la CI Windows pasó en el run
  [34871238822](https://github.com/zivoplataforma-maker/trivergence/actions/runs/34871238822),
  cerrando el alcance P0 sin cambiar M5 ni M7.
- Gates no cubiertos por este P0: reproducibilidad/firma/VM limpia de M7,
  revisión humana/legal y conector oficial de M5. Ambos hitos permanecen
  `PARTIAL`.
