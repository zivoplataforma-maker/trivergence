# Auditoría crítica de la especificación inicial

Fecha: 2026-08-03  
Entrada auditada: versión inicial de `TRIVERGENCE_PROMPT_MAESTRO_CODEX.md`

## Dictamen

La visión es valiosa, pero la especificación inicial no era implementable como
contrato único. El principal problema era de alcance: trataba un producto de
varios trimestres como una sola entrega y daba igual prioridad a la base segura,
la UI completa, cuatro proveedores, multiagencia, memoria, MCP y distribución.
También contenía una incompatibilidad jurídica material con Claude Code.

La revisión conserva el objetivo —orquestación local y segura de subsistemas y
herramientas oficiales— y lo convierte en un programa por hitos con un vertical
slice verificable.

## Addendum arquitectónico — 2026-08-04

La primera revisión todavía describía el producto desde su superficie
(`workspace`) y colocaba al Runtime/coordinator demasiado cerca del centro. Se
adopta una corrección adicional: Trivergence no es un IDE ni una IA; es un
sistema de orquestación.

El Orchestration Engine pasa a ser el núcleo con Strategy Engine, Execution
Planner, Capability Registry y Evaluation Engine. Runtime, agentes, proveedores,
memoria, workflows, workspace, tools y persistencia son subsistemas. Policy
Engine permanece como guardrail por acción.

Esta decisión resuelve cuatro ambigüedades de la versión anterior:

- separa elegir, planificar, autorizar, ejecutar y evaluar;
- evita que Runtime o un proveedor inventen el flujo global;
- permite utilidad y pruebas sin IA, filesystem ni procesos;
- hace visible una cadena causal antes de cualquier efecto.

Se posponen intencionalmente paralelismo, replanificación dinámica y registry
mutable hasta definir conflictos, budgets, provenance y revalidación.

## Contradicciones y correcciones

| Hallazgo                                                                  | Riesgo                                                                                                          | Corrección adoptada                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| “Sin claves API” y, a la vez, automatización uniforme de las tres CLI.    | No todas las suscripciones autorizan uso desde productos de terceros.                                           | Capacidades por proveedor: estructurada, interactiva o no disponible. Gate legal por capacidad.                 |
| Claude por login de suscripción dentro de un orquestador tercero.         | Anthropic declara que terceros no pueden ofrecer ese login o enrutar solicitudes con credenciales Free/Pro/Max. | Claude P0 queda en detección y lanzamiento visible; automatización deshabilitada salvo canal oficial permitido. |
| “Local-first” podía interpretarse como que los datos no salen del equipo. | Falsa expectativa de privacidad al usar modelos cloud.                                                          | La UI identifica proveedor y archivos salientes; modo privado bloquea todos los conectores cloud.               |
| “Enmascarar secretos” parecía una garantía absoluta.                      | Los detectores tienen falsos negativos y positivos.                                                             | Capas: exclusión obligatoria, selección explícita, escaneo, vista previa y consentimiento.                      |
| Acciones de red “configurables” frente a HTTP y proveedores cloud.        | La operación normal depende de red y puede exfiltrar datos.                                                     | Red siempre visible; reglas persistentes solo para destino/capacidad acotados.                                  |
| Escritura configurable y Git automatizado, pero “nunca main”.             | Un repositorio puede no tener Git, estar detached o usar otra rama protegida.                                   | Política basada en estado detectado; snapshots locales antes de escribir cuando Git no ayuda.                   |
| Electron main acumulaba DB, PTY, Git, parsers y proveedores.              | Compromiso del renderer o parser amplía el impacto a todo el host.                                              | Workers por capacidad y contratos estrechos; main coordina, no interpreta contenido no confiable.               |
| “Árbol completo cancelable” sin mecanismo Windows definido.               | Matar solo el padre deja procesos huérfanos.                                                                    | Supervisor con Job Object o mecanismo verificado; autonomía bloqueada si no se puede garantizar.                |
| Un `ProviderAdapter` único asumía simetría.                               | Fuerza implementaciones ficticias para login, modelos, eventos o cancelación.                                   | Descriptor de capacidades y operaciones opcionales; negociación por versión y modo.                             |
| Pedir `listModels()` para todas las CLI.                                  | Algunas CLI eligen modelos mediante configuración o no exponen catálogo estable.                                | Catálogo opcional; modelo “gestionado por proveedor” cuando no existe interfaz oficial.                         |
| SQLite FTS5 se asumía presente.                                           | La compilación concreta puede no incluir la extensión.                                                          | Self-check al inicio y fallback sin índice; empaquetado prueba la misma build distribuida.                      |
| PDF dentro del indexador general.                                         | Parsers de formatos complejos aumentan superficie de ataque y consumo.                                          | PDF pasa a P2 y a worker aislado con límites de tamaño/tiempo.                                                  |
| “Torneo evolutivo” junto a un MVP.                                        | Coste, complejidad y ruido antes de validar el flujo básico.                                                    | P2; solo artefactos verificables y presupuesto explícito.                                                       |
| Métrica de “uso local aproximado” sin fuente.                             | Métrica inventada o engañosa.                                                                                   | Solo recursos medidos; consumo/coste remoto figura como desconocido salvo dato oficial.                         |
| Firmas y auto-update “preparados”.                                        | Una actualización sin firma madura incrementa riesgo de cadena de suministro.                                   | Auto-update desactivado hasta tener releases firmadas, rotación y rollback probados.                            |
| “Completar fases 0–9 en una ejecución”.                                   | Incentiva placeholders y pruebas superficiales.                                                                 | Roadmap con puertas de calidad; el estado distingue hecho, parcial, bloqueado y planificado.                    |

## Partes incompletas detectadas

- No había personas usuarias prioritarias ni investigación que justificara cada
  vista.
- No había métricas medibles sin telemetría remota.
- No se definían límites de tamaño, enlaces simbólicos/junctions, rutas UNC o
  filesystem case-insensitive.
- Faltaba protocolo de aprobación (identidad de solicitud, expiración, alcance y
  revocación).
- Faltaban retención y protección del log de auditoría, backups y borrado
  seguro.
- No se separaban datos de usuario, configuración, caché, logs y artefactos
  temporales.
- No había estrategia de migración/rollback ni manejo de corrupción de SQLite.
- No se definía trust boundary para plugins/MCP ni OAuth de servidores MCP.
- No se distinguía terminal visible de proceso estructurado.
- No había tratamiento de TOCTOU: un archivo o comando puede cambiar entre vista
  previa y ejecución.
- No había requisitos de accesibilidad comprobables ni flujo UI prioritario.
- No había política para salidas gigantes, ANSI malicioso, terminal escape
  sequences o Markdown activo.
- No había presupuesto de rendimiento ni capacidad mínima del equipo.
- No había política de licencias de dependencias ni gate jurídico por proveedor.

## Oportunidades de mejora

1. Lanzar primero un producto valioso sin IA: policy engine, approvals y
   auditoría pueden probarse con acciones locales deterministas.
2. Hacer que las capacidades sean datos. La UI puede explicar exactamente qué
   admite cada versión.
3. Usar recetas de tareas verificables en lugar de “agentes” antropomorfizados
   como abstracción base.
4. Tratar la interoperabilidad como integración externa versionada, no como un
   protocolo universal.
5. Medir éxito localmente y permitir que el usuario exporte métricas agregadas
   sin activar telemetría.
6. Separar el historial conversacional de la auditoría de seguridad: tienen
   retención y sensibilidad distintas.

## Fuentes primarias consultadas

- [OpenAI Codex authentication](https://developers.openai.com/codex/auth)
- [OpenAI Codex CLI reference](https://developers.openai.com/codex/cli/reference)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Gemini CLI authentication](https://google-gemini.github.io/gemini-cli/docs/get-started/authentication.html)
- [Gemini CLI headless mode](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)

Estas fuentes son referencias fechadas, no garantías permanentes. Cada release
debe revalidarlas.
