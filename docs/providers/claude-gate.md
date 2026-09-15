# M5-A2 — Gate de Claude/Anthropic

Estado global: `UNRESOLVED`  
Fecha de consulta: 2026-09-15  
Operación evaluada: `provider.claude.prompt.structured`  
Modalidad: aplicación desktop open-source, local y atendida  
Mejor vía: Claude Code oficial e inalterado, instalado externamente, mediante
`claude -p` y autenticación propia del usuario

Este expediente es una evaluación técnica y de riesgo, no asesoramiento legal.
No habilita Claude, no aprueba una attestation y no cambia M5 de `PARTIAL`.

## Decisión

| Gate                    | Resultado                | Motivo determinante                                                                                                                        |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Technical Gate          | `UNRESOLVED`             | `claude -p` documenta JSONL, cancelación y sesiones, pero no recupera el mismo turn interrumpido y el modo seguro con OAuth debe probarse. |
| Security Gate           | `CONDITIONALLY_APPROVED` | `--safe-mode`, `--restricted` y tools vacías permiten diseñar aislamiento; falta verificar que ninguna autoridad escape.                   |
| Authentication Gate     | `CONDITIONALLY_APPROVED` | El binario oficial puede autenticar al usuario; Trivergence no puede ofrecer, copiar ni intermediar el login Claude.ai.                    |
| Contractual Gate        | `UNRESOLVED`             | La página legal permite ejecutar Claude Code inalterado en productos, pero Agent SDK exige aprobación para login/rate limits propios.      |
| Distribution Gate       | `CONDITIONALLY_APPROVED` | Anthropic permite ejecutar el binario publicado sin modificar; se exige instalación independiente y verificación de release.               |
| Commercial/Billing Gate | `CONDITIONALLY_APPROVED` | Hoy `claude -p` y apps de terceros consumen límites de la suscripción; Free no incluye Claude Code y el modelo anunciado está pausado.     |

Regla aplicada: los gates técnico y contractual obligatorios permanecen
`UNRESOLVED`; por tanto, la decisión global es **`UNRESOLVED`**.

## Respuesta central

**Pregunta:** ¿existe un mecanismo oficial para que una aplicación open-source
de terceros permita al usuario acceder a Claude con su propia autenticación?

**Respuesta:** existe una vía oficial condicionada: ejecutar una instalación
externa e inalterada de Claude Code mediante `claude -p`. Anthropic documenta
expresamente su ejecución dentro de productos si cada usuario se autentica y
paga bajo su propio acuerdo. La autenticación permanece enteramente dentro del
binario oficial; Trivergence no ofrece un OAuth propio ni accede a tokens.

La autorización no se extiende a incorporar Agent SDK con login Claude.ai en la
aplicación: esa documentación exige aprobación previa. Tampoco resuelve si usar
`claude -p` como provider genérico de un orquestador multi-IA encaja en la
excepción exacta. Por esa tensión entre documentos oficiales, el Contractual
Gate sigue `UNRESOLVED` hasta obtener confirmación escrita.

Claude Platform mediante `ant auth login` es la alternativa oficial: evita una
clave manual, pero usa Console/API y billing separado. Es técnicamente más
próxima a una API de provider, aunque hoy su contrato CLI de streaming es menos
completo que el de Claude Code.

## Vías oficiales evaluadas

| Vía                                       | Uso previsto oficialmente                          | Autenticación                                        | Resultado para Trivergence                                        |
| ----------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Claude API / Messages                     | Integrar Claude en aplicaciones                    | API key, WIF o App Attest en plataformas compatibles | `CONDITIONALLY_SUPPORTED`; API billing separado                   |
| `ant` CLI + Console OAuth                 | API desde terminal, desarrollo local y scripting   | Browser OAuth, token de workspace poseído por `ant`  | `CONDITIONALLY_SUPPORTED`; alternativa con billing API            |
| SDK TypeScript oficial                    | Cliente de la Claude API en aplicaciones           | API key o WIF                                        | `SUPPORTED`; no resuelve por sí solo el ownership de credenciales |
| Workload Identity Federation              | Servidores, CI, cloud y Kubernetes                 | Token breve de IdP                                   | `SUPPORTED` para empresa; no es login de consumidor               |
| App Attest                                | Apps iOS/macOS registradas                         | Attestation Apple y token breve                      | `REJECTED` para la distribución Windows actual                    |
| Claude Code inalterado mediante `-p`      | Automatización y ejecución en productos            | Login propio Pro/Max/Team/Enterprise                 | `CONDITIONALLY_SUPPORTED`; mejor vía sin API billing              |
| Claude Agent SDK con login Claude.ai      | Solo terceros previamente aprobados                | OAuth de suscripción                                 | `REJECTED` sin aprobación escrita                                 |
| Claude Desktop                            | Aplicación nativa; no ofrece interfaz de scripting | OAuth propio                                         | `REJECTED` como backend                                           |
| MCP/connectors                            | Claude consume herramientas o servicios externos   | OAuth hacia el servidor conectado                    | `REJECTED` como autenticación hacia Claude                        |
| Bedrock, Vertex, Foundry, Platform on AWS | Integración empresarial mediante cloud             | IAM/OAuth/WIF del cloud                              | `CONDITIONALLY_SUPPORTED`; infraestructura y billing adicionales  |
| Managed Agents                            | Runtime de agentes administrado, actualmente beta  | Claude Platform                                      | `REJECTED` para M5-A2; duplica el núcleo orquestador              |

## Distribución por alternativa

| Alternativa solicitada                         | Resultado                                                 | Condición                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A. Comunicarse con instalación oficial externa | `CONDITIONALLY_SUPPORTED`                                 | Claude Code o `ant` instalados por el usuario; gate, versión y fingerprint válidos.                                     |
| B. Utilizar SDK oficial                        | `SUPPORTED` para Platform; `REJECTED` con OAuth Claude.ai | Client SDK exige credencial API/WIF; Agent SDK necesita aprobación para login/rate limits de suscripción.               |
| C. Distribuir componente oficial               | `CONDITIONALLY_SUPPORTED`                                 | Claude Code debe permanecer publicado e inalterado; `ant` es MIT. Trivergence no los bundleará sin revisión de release. |
| D. Requerir instalación independiente          | `SUPPORTED`                                               | Es la única modalidad propuesta para reducir custodia, licencia y supply chain.                                         |
| E. OAuth oficial para terceros                 | `CONDITIONALLY_SUPPORTED` solo detrás de cliente oficial  | Claude Code y `ant` poseen sus flujos; no existe OAuth Claude.ai genérico que Trivergence pueda implementar.            |

## Compatibilidad por tipo de cuenta

| Cuenta             | Acceso desde Trivergence con autenticación de suscripción | Ruta oficial alternativa                                   |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| Claude Free        | `REJECTED`; no incluye Claude Code                        | Crear una cuenta Console independiente si resulta elegible |
| Claude Pro         | `CONDITIONALLY_SUPPORTED` mediante Claude Code inalterado | Console/API con billing separado                           |
| Claude Max         | `CONDITIONALLY_SUPPORTED` mediante Claude Code inalterado | Console/API con billing separado                           |
| Claude Team        | `CONDITIONALLY_SUPPORTED` mediante Claude Code inalterado | Console/API, workspace comercial o cloud empresarial       |
| Claude Enterprise  | `CONDITIONALLY_SUPPORTED` mediante Claude Code inalterado | Console/API, WIF o cloud bajo controles de la organización |
| Claude Console/API | No es una suscripción Claude.ai                           | `CONDITIONALLY_SUPPORTED`; OAuth de `ant`, API key o WIF   |

Una misma dirección de correo puede tener cuenta Claude y cuenta Console, pero
son productos y facturaciones diferentes.

## Registro de evidencia oficial

Todos los enlaces se consultaron el 2026-09-15.

| ID  | Fuente oficial                                                                                                                                                                                            | Evidencia relevante                                                                                     | Conclusión permitida                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E1  | [API overview](https://platform.claude.com/docs/en/api/overview)                                                                                                                                          | Messages es la interfaz REST para acceso programático; exige Console y API key o WIF.                   | La API está diseñada para integración de terceros.                                    |
| E2  | [Autenticación de Claude Platform](https://platform.claude.com/docs/en/manage-claude/authentication)                                                                                                      | Métodos documentados: API key, WIF y App Attest para Apple.                                             | No existe OAuth genérico de consumidor para una app Windows.                          |
| E3  | [Quickstart de `ant`](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/quickstart)                                                                                                              | `ant` expone Claude API, inicia OAuth de Console y ejecuta `messages create`.                           | Es una frontera oficial alternativa sin clave manual.                                 |
| E4  | [Autenticación de `ant`](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication)                                                                                                       | Login browser, token ligado a workspace y credenciales poseídas por el CLI; uso local y scripting.      | Trivergence puede delegar login sin leer secretos.                                    |
| E5  | [Uso de `ant`](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/using)                                                                                                                          | Body completo por `stdin`, salida JSON/JSONL y errores formateables.                                    | Prompt fuera de argv y parsing acotado son viables.                                   |
| E6  | [Scripting con `ant`](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/scripting)                                                                                                               | El CLI está diseñado para shell tooling; también puede imprimir tokens para curl.                       | Scripting está soportado, pero Trivergence prohíbe `print-credentials`.               |
| E7  | [SDK TypeScript](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)                                                                                                                  | SDK oficial con tipos, SSE, abort, timeouts, retries y usage.                                           | La API tiene primitives maduras; no soluciona auth sin secretos local.                |
| E8  | [Legal y compliance de Claude Code](https://code.claude.com/docs/en/legal-and-compliance)                                                                                                                 | Permite ejecutar Claude Code publicado e inalterado en productos; cada usuario autentica y paga su uso. | El binario externo es candidato, sin convertir su OAuth en OAuth de Trivergence.      |
| E9  | [Automatización de Claude Code](https://code.claude.com/docs/en/headless)                                                                                                                                 | `claude -p` ofrece JSON, JSONL, schema, cancelación y ejecución programática.                           | Existe una interfaz oficial estructurada para scripts.                                |
| E10 | [Suscripción vs API](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console) | Pro/Max/Team/Enterprise no incluyen API ni Console.                                                     | El consumo de Trivergence no puede ocultarse dentro de la suscripción.                |
| E11 | [Commercial Terms](https://www.anthropic.com/legal/commercial-terms)                                                                                                                                      | Permiten usar Services para productos propios, con restricciones de competencia, reventa y cuenta.      | La categoría producto está permitida; el carácter multi-provider requiere aclaración. |
| E12 | [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)                                                                                                                                          | Free, Pro y Max se rigen por términos de consumidor y Claude Code por su guía específica.               | El permiso se limita al cliente oficial; no habilita OAuth propio.                    |
| E13 | [Billing de API](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage)                                                                                                     | Normalmente usa créditos prepagos; desconexiones/timeouts pueden seguir cobrando.                       | El usuario/organización Console asume consumo y riesgo de coste.                      |
| E14 | [Versionado de API](https://platform.claude.com/docs/en/api/versioning)                                                                                                                                   | Header versionado y compatibilidad aditiva documentada.                                                 | Puede fijarse versión y fallar cerrado ante variantes nuevas.                         |
| E15 | [Deprecaciones](https://platform.claude.com/docs/en/about-claude/model-deprecations)                                                                                                                      | Modelos públicos reciben aviso antes del retiro.                                                        | Hace falta policy de actualización y modelo permitido.                                |
| E16 | [Repositorio de `ant`](https://github.com/anthropics/anthropic-cli)                                                                                                                                       | CLI oficial, código MIT y releases para Windows con checksums.                                          | Distribución es legalmente posible, aunque se prefiere instalación externa.           |
| E17 | [Repositorio del SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)                                                                                                                  | SDK oficial bajo MIT.                                                                                   | Puede añadirse en una futura extensión con notices.                                   |
| E18 | [Claude Desktop](https://code.claude.com/docs/en/desktop)                                                                                                                                                 | Desktop no ofrece scripting/automation; MCP conecta herramientas hacia Claude.                          | No es una interfaz de provider para Trivergence.                                      |
| E19 | [Agent SDK](https://code.claude.com/docs/en/agent-sdk)                                                                                                                                                    | Terceros no pueden ofrecer login Claude.ai o rate limits sin aprobación previa.                         | SDK embebido con suscripción queda rechazado sin aprobación.                          |
| E20 | [Uso de Agent SDK con un plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)                                                                            | La migración a créditos separados fue pausada; hoy `claude -p` y apps de terceros consumen el plan.     | Pro/Max/Team/Enterprise pueden cubrir uso actual, sujeto a límites y cambios.         |
| E21 | [Referencia CLI](https://code.claude.com/docs/en/cli-usage)                                                                                                                                               | Documenta auth status JSON, tools vacías, restricted/safe mode, budgets, streaming y sesiones.          | Los controles son evaluables sin leer credential stores.                              |

El anuncio de separar `claude -p` en créditos mensuales fue pausado. La página
oficial confirma que, por ahora, `claude -p` y las apps de terceros siguen
consumiendo los límites de la suscripción. Esto describe billing vigente, pero
no elimina la exigencia de aprobación previa para ofrecer OAuth propio mediante
Agent SDK.

## Arquitectura propuesta, todavía inerte

```text
Orchestration Engine
  -> AdapterHost
    -> futuro ClaudeCodeExternalAdapter (no implementado)
      -> ExecutableResolver / BinaryVerifier
      -> ClaudeCodeSchemaGate
      -> StdioRequestTransport
      -> ProcessSupervisor
      -> ClaudeEventMapper
      -> CredentialBlindOfficialAuth
        -> claude oficial --safe-mode --restricted -p
          -> cuenta propia del usuario
```

Reglas obligatorias:

1. Claude Code se instala por el canal oficial, permanece separado, publicado e
   inalterado;
2. login atendido enteramente por Claude Code; Trivergence no ofrece OAuth;
3. nunca invocar `setup-token`, leer config/credentials o heredar API keys, auth
   tokens, base URLs o credenciales cloud;
4. spawn directo sin shell, argv constante y request JSON por `stdin`;
5. `--safe-mode`, `--restricted`, `--tools ""`, `--disallowedTools "*"`,
   `--permission-prompts none` y MCP vacío; sin `--bare` porque excluye OAuth;
6. cualquier tool, hook, plugin, subagent o solicitud de approval inesperada
   cancela y demuestra fallo del aislamiento;
7. modelo y CLI fijados por versión/digest; JSONL validado fail-closed;
8. provenance con session ID, modelo, versión CLI y digests no sensibles;
9. sin registro, trust digest, dispatcher o UI ejecutable hasta aprobar gates.

## Mapping contra `ProviderAdapter`

| Claude Code oficial                            | ProviderAdapter | Clasificación | Adaptación o gap                                                               |
| ---------------------------------------------- | --------------- | ------------- | ------------------------------------------------------------------------------ |
| construcción local del request                 | `prepare`       | `ADAPTABLE`   | Preview local; no hay token count previo documentado para la CLI.              |
| `claude --safe-mode --restricted -p`           | `execute`       | `SUPPORTED`   | Prompt por stdin, tools vacías y configuración cerrada.                        |
| `--output-format stream-json`                  | `stream`        | `SUPPORTED`   | JSONL incremental y mensaje final documentados.                                |
| SIGINT/SIGTERM o `interrupt()`                 | `cancel`        | `SUPPORTED`   | Semánticas documentadas; falta validación específica en Windows.               |
| `--resume` / session ID                        | `recover`       | `MISSING`     | Reanuda conversación, no el mismo turn interrumpido; SIGTERM no guarda result. |
| `claude auth status` + probe acotado           | `health`        | `ADAPTABLE`   | JSON oficial, pero puede contener identidad y no prueba inferencia.            |
| login dentro del binario oficial               | authentication  | `SUPPORTED`   | Trivergence no inicia un OAuth propio ni accede a credenciales.                |
| `claude --version`                             | version         | `SUPPORTED`   | Versión exacta allowlisted; no auto-update durante una release.                |
| ejecutable publicado + digest local            | fingerprint     | `ADAPTABLE`   | Falta definir identidad verificable del instalador oficial en Windows.         |
| flags/modelo allowlisted                       | capabilities    | `ADAPTABLE`   | Declaración estática; no inferir capacidades desde output.                     |
| tools vacías + prompts sin host                | approvals       | `ADAPTABLE`   | Todo efecto debe quedar fuera de Claude Code; verificar fail-closed.           |
| supervisor + señales                           | timeouts        | `ADAPTABLE`   | Deadline, cierre del árbol y rechazo de eventos tardíos.                       |
| `--max-budget-usd`, turnos, bytes y tiempo     | budgets         | `ADAPTABLE`   | Coste es estimado y el límite de suscripción no tiene preflight estable.       |
| JSONL/result/exit code                         | typed errors    | `ADAPTABLE`   | Tabla cerrada; algunos fallos se emiten por stdout.                            |
| session ID/model/version/coste estimado/digest | provenance      | `ADAPTABLE`   | Redactar identidad, rutas y datos de cuenta.                                   |

## Resultado frente a las 14 comprobaciones

No se ejecutó la suite contra Claude: no existe adapter ni autorización. Los
resultados siguientes son conceptuales y la suite no fue modificada.

| Comprobación              | Resultado   | Evidencia o gap                                                        |
| ------------------------- | ----------- | ---------------------------------------------------------------------- |
| `capability_declaration`  | `PASSABLE`  | Manifest estático y flags allowlisted permiten declaración cerrada.    |
| `prepare_context_preview` | `PASSABLE`  | Se realiza localmente antes de iniciar Claude Code.                    |
| `execute_and_stream`      | `PASSABLE`  | `-p` y `stream-json` están documentados oficialmente.                  |
| `cancellation`            | `ADAPTABLE` | SIGINT/SIGTERM están documentados; falta probar Windows y late events. |
| `recovery`                | `BLOCKED`   | Resume conserva sesión, no reinicia el mismo turn exactamente.         |
| `interrupted_recovery`    | `BLOCKED`   | SIGTERM deja el turn sin result; no hay checkpoint idempotente.        |
| `timeout`                 | `ADAPTABLE` | Supervisor, señales y kill tree con límite estricto.                   |
| `typed_failure`           | `ADAPTABLE` | Result JSON y exit code existen; algunos errores llegan por stdout.    |
| `input_budget`            | `ADAPTABLE` | Límite local de bytes; falta conteo de tokens preflight.               |
| `output_budget`           | `ADAPTABLE` | Presupuesto monetario/turnos y límite incremental de bytes.            |
| `provenance`              | `PASSABLE`  | Session ID, modelo, coste estimado, versión y digest.                  |
| `approval_boundary`       | `ADAPTABLE` | Tools vacías y prompts sin host deben verificarse como fail-closed.    |
| `malformed_response`      | `ADAPTABLE` | Parser JSONL incremental y schemas cerrados.                           |
| `unavailable_provider`    | `PASSABLE`  | Sin attestation no se registra en AdapterHost.                         |

Resumen: **5 `PASSABLE`, 7 `ADAPTABLE`, 2 `BLOCKED`, 0 PASS reales**.

## Comparación objetiva con Codex

| Dimensión               | Codex App Server                                 | Mejor vía Claude: Claude Code oficial e inalterado                |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| Technical               | Comando experimental/no soportado en producción  | `-p`, JSONL, cancel y controles documentados; recovery incompleto |
| Authentication          | ChatGPT login poseído por Codex                  | Login poseído por Claude Code; OAuth no se expone a Trivergence   |
| Contractual             | Plus/Pro de terceros no aclarado                 | Ejecución en productos permitida; frontera Agent SDK ambigua      |
| Distribution            | Código Apache-2.0; instalación externa preferida | Binario propietario inalterado; instalación externa obligatoria   |
| Recovery                | Sin checkpoint de turn                           | Resume sesión, no el mismo turn interrumpido                      |
| Conformance             | 12 adaptables, 2 bloqueadas                      | 5 passables, 7 adaptables, 2 bloqueadas                           |
| Cost model              | Entitlement Plus/Pro no resuelto                 | Límites Pro/Max/Team/Enterprise propios; política puede cambiar   |
| Production maturity     | App Server expresamente experimental             | CLI oficial de producción con interfaz programática               |
| Third-party suitability | Intención técnica, autorización ambigua          | Puede correr inalterado en productos; no OAuth/SDK propio         |

Claude presenta una ruta sin API key más explícita, pero no cumple hoy el
recovery obligatorio y la diferencia entre lanzar el cliente oficial y ofrecer
un login propio requiere confirmación. No existe todavía un ganador habilitable.

## Coste y ownership

- En la ruta preferida, cada usuario paga su propia suscripción y, por ahora,
  `claude -p` y las apps de terceros consumen sus límites. Free no incluye
  Claude Code.
- La migración anunciada a créditos mensuales separados fue pausada; no se debe
  diseñar una promesa estable sobre esos límites.
- Pro, Max, Team y Enterprise no incluyen el consumo de Console/API. Si se usa
  `ant`, el dueño del workspace paga créditos/prepago o su acuerdo comercial.
- El coste que imprime Claude Code es una estimación local y puede diferir de la
  factura; además, una cancelación puede no revertir consumo ya realizado.
- Trivergence necesitaría preview de límite/coste, hard stop local y aviso claro
  de quién factura cada modalidad.

## Bloqueos y criterio de reapertura

- confirmación de que lanzar `claude -p` como provider, sin ofrecer OAuth ni
  intermediar consumo, entra en el permiso para ejecutar Claude Code en
  productos;
- aclaración de la tensión con la prohibición de login/rate limits del Agent
  SDK;
- recovery idempotente compatible con ambas pruebas;
- combinación segura y soportada de `--safe-mode`, `--restricted`, tools vacías,
  MCP vacío y autenticación de suscripción;
- política Windows de instalación externa, firma/digest, updates y soporte;
- estado de auth machine-readable sin exponer tokens o datos de cuenta;
- política estable de límites/costes de `claude -p` y aceptación explícita de la
  alternativa Console con facturación API separada;
- revisión legal, privacidad/DPA y experiencia de budgets/costes;
- spike aislado posterior y 14/14 de conformidad.

No se creó un spike porque los gates técnico y contractual permanecen
`UNRESOLVED`. Las preguntas formales están en
[`claude-open-questions.md`](claude-open-questions.md) y las mitigaciones en
[`threat-model-claude.md`](../security/threat-model-claude.md).
