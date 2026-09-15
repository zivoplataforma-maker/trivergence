# M5-A3 — Gate de Google/Gemini

Estado: `UNRESOLVED` — ningún provider autorizado, implementado o habilitado  
Fecha de evaluación: 2026-09-15  
Próxima revisión: 2026-10-15 o ante un cambio material de términos,
autenticación o API

Este expediente es una evaluación técnica y de riesgo basada exclusivamente en
fuentes oficiales de Google. No sustituye una revisión jurídica. `PASSABLE` y
`ADAPTABLE` describen viabilidad documental; no significan que exista una
implementación probada.

## Decisión ejecutiva

Google sí ofrece APIs oficiales para aplicaciones de terceros, pero no una única
ruta que cumpla hoy todos los requisitos de Trivergence:

- **Gemini CLI: `REJECTED` como provider con login Google de consumidor.**
  Google prohíbe que software de terceros acceda al servicio subyacente mediante
  el OAuth de Gemini CLI. Además, desde el 18 de junio de 2026, Gemini CLI dejó
  de servir solicitudes de Individual, Google AI Pro y Google AI Ultra.
- **Gemini Code Assist: `REJECTED` como interfaz de provider.** Es asistencia en
  IDE/Cloud, no una API de terceros. Su entitlement no se transfiere a
  Trivergence y la licencia del plugin restringe su redistribución/inclusión.
- **Gemini Developer API: `CONDITIONALLY_APPROVED` como alternativa oficial con
  credencial y billing propios, no para implementación.** La Interactions API es
  GA, tiene streaming, estado, background execution, cancelación y reconexión
  verificable, pero exige una API key/auth key asociada a un proyecto.
  Contradice el flujo principal sin keys de Trivergence.
- **Vertex AI Gemini: `UNRESOLVED`, y mejor ruta sin API key.** Admite
  ADC/OAuth, IAM, proyecto y billing del usuario, SDK/REST oficiales y uso en
  Customer Applications. No se encontró evidencia de que la semántica de
  recovery de Interactions API esté disponible en Vertex AI con ADC. La
  inferencia online documentada no permite recuperar exactamente una ejecución
  interrumpida.

**Decisión global Google: `UNRESOLVED`.** No se autoriza adapter ni spike. La
mejor arquitectura candidata es usuario → Trivergence → Google Gen AI SDK/REST →
Vertex AI, con proyecto Cloud del usuario y ADC oficial; queda bloqueada por
recovery y por decisiones de custodia/aislamiento de credenciales.

## Distinciones obligatorias

| Producto o entitlement                    | Qué autoriza                                                               | Qué no autoriza para Trivergence                                                |
| ----------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Gemini Apps / Google AI Plus, Pro o Ultra | Uso de las aplicaciones de consumidor según sus límites                    | No es cuota API, Cloud billing ni consentimiento OAuth para un provider tercero |
| Gemini CLI login Google                   | Uso dentro del cliente oficial sujeto a sus términos                       | No permite piggyback, extracción o reutilización de OAuth por software tercero  |
| Gemini Code Assist Standard/Enterprise    | Uso licenciado en superficies oficiales, incluido el CLI donde corresponda | No es una API general ni transfiere el entitlement a Trivergence                |
| Gemini Developer API / AI Studio          | API para crear aplicaciones; proyecto y key/auth key propios               | No usa la suscripción de consumidor ni ofrece el flujo principal sin keys       |
| Vertex AI Gemini                          | API Cloud para Customer Applications con IAM/ADC y proyecto facturable     | No hereda límites de Google AI, Code Assist ni Gemini Apps                      |
| OAuth de Google                           | Autoriza scopes concretos para un cliente identificado                     | Autenticar identidad no concede automáticamente Vertex, cuota ni billing        |

## 1. Vías oficiales

### A. Gemini CLI

**Propósito y madurez.** Cliente agentic open-source Apache-2.0, con modo
interactivo y headless, salida JSON/stream-JSON, herramientas, sandbox,
aprobaciones, sesiones y checkpoints. El software sigue mantenido para clientes
empresariales, pero el acceso de consumidor por login Google fue retirado el 18
de junio de 2026.

**Autenticación y terceros.** Sus rutas documentadas incluyen login Google para
entitlements compatibles, Gemini API key y Vertex AI. Los términos y el FAQ
dicen expresamente que acceder a los servicios que impulsan Gemini CLI mediante
software de terceros —incluido piggyback sobre su OAuth— viola los términos y
puede causar suspensión. Trivergence no copiará tokens, no leerá caches, no
reutilizará client IDs y no presentará la CLI como backend autorizado.

**Operación.** Headless y `--output-format stream-json` son técnicamente
adaptables; una señal al proceso permite cancelación. `--resume` y los
checkpoints recuperan conversación/estado local, no la misma ejecución remota
interrumpida. No existe una garantía documentada de idempotencia o reanudación
del turn exacto.

**Distribución.** El código fuente es Apache-2.0, pero esa licencia no concede
derecho de uso del servicio ni del OAuth. Trivergence no lo redistribuirá ni lo
instalará; incluso una instalación oficial externa no resuelve la prohibición
contractual del uso de su autenticación como backend tercero.

Decisión: **`REJECTED` para el caso solicitado.** Una eventual ejecución con
Vertex/API credentials sería una variante de las APIs correspondientes, no una
aprobación del login de Gemini CLI.

### B. Gemini Code Assist

**Propósito.** Asistente oficial integrado en VS Code, JetBrains y superficies
Google Cloud. Standard y Enterprise requieren suscripción/licencia, proyecto,
API habilitada y roles de IAM. No publica una interfaz general de inferencia
para aplicaciones como Trivergence.

**Distribución.** La licencia del plugin permite su uso limitado y restringe
distribuirlo o incluirlo en productos de terceros. La instalación oficial
independiente no convierte el plugin/editor integration en ProviderAdapter.

**Consumidor.** Individual, Google AI Pro y Google AI Ultra dejaron de recibir
servicio en Code Assist y Gemini CLI el 18 de junio de 2026. Standard y
Enterprise no fueron afectados, pero siguen siendo entitlements del producto, no
cuota de API transferible.

Decisión: **`REJECTED` como provider**; las APIs de Vertex se evalúan aparte.

### C. Gemini Developer API / Google AI Studio

**Propósito y madurez.** API oficial para crear aplicaciones de terceros. Desde
junio de 2026, Interactions API es GA y la interfaz recomendada; el antiguo
`generateContent` sigue soportado pero se considera legado.

**Autenticación.** La documentación exige API key. Las nuevas authorization keys
se vinculan a una service account y reemplazarán las standard keys. No hay un
flujo documentado que convierta Google AI Plus/Pro/Ultra en autorización API de
un usuario para una app de escritorio.

**Capacidades.** Interactions ofrece streaming, JSON Schema, function calling,
estado opcional por `previous_interaction_id`, pasos observables y background
execution. Un interaction ID permite consultar estado, cancelar, recuperar el
resultado y reconectar un stream desde `last_event_id`. Esto sí es recovery de
la misma ejecución cuando se creó como background interaction; no debe
generalizarse a `generateContent` ni a Vertex sin evidencia.

**Retención.** `store=true` es el valor predeterminado en Interactions: 55 días
en paid tier y 1 día en free tier; `store=false` impide background execution y
continuación por ID. El usuario puede borrar la interacción. Esta tensión exige
preview y consentimiento explícitos para cualquier futuro modo recuperable.

**Billing y datos.** Free tier y paid tier son cuotas del proyecto, no de la
suscripción Gemini. El paid tier requiere Cloud Billing/créditos y cobra al
proyecto. En unpaid services Google puede usar contenido para mejorar productos,
con la excepción regional documentada; en paid services no usa
prompts/respuestas para mejorar productos, sujeto a sus términos y controles de
abuso.

Decisión: **`CONDITIONALLY_APPROVED` como candidato alternativo con keys**, sin
autorización de implementación. Queda fuera de la UX principal por decisión de
producto y requeriría un gate independiente de credenciales, retención y costos.

### D. Vertex AI Gemini

**Propósito y madurez.** Servicio Google Cloud de producción para construir
aplicaciones generativas. Expone API/SDK, streaming, structured output y
function calling. Las features Preview conservan términos Pre-GA y no deben
formar parte del baseline.

**Autenticación oficial sin API key.** ADC puede localizar credenciales creadas
por `gcloud auth application-default login`, una configuración de Workforce o
Workload Identity Federation, o una identidad adjunta. En escritorio, Google
documenta OAuth 2.0 Authorization Code con navegador del sistema, PKCE y
callback loopback. El cliente debe identificarse, pedir scopes mínimos y pasar
la verificación aplicable. El quickstart de Vertex recomienda ADC local y exige
el rol `roles/aiplatform.user`.

La variante preferida para un piloto sería **gcloud externo + ADC del usuario**:
Trivergence no captura contraseña ni copia tokens y la biblioteca oficial
obtiene access tokens desde ADC. Sin embargo, el archivo ADC local contiene
credenciales renovables y el proceso que usa la biblioteca puede acceder a
ellas. Por ello no equivale a “sin secretos”; exige aislamiento de proceso,
no-log, account/project binding, revocación y una decisión explícita sobre si
esta lectura mediada por la biblioteca cumple la frontera de credenciales del
producto.

Para organizaciones, Workforce/Workload Identity Federation evita service
account keys estáticas y emite credenciales de corta duración, pero requiere
infraestructura IAM/IdP. Las service account keys se excluyen: Google las
considera un riesgo y no son necesarias para este diseño.

**Billing.** El usuario u organización selecciona un proyecto Google Cloud,
habilita Vertex AI y billing, y recibe cargos/quota/DSQ en ese proyecto. La
suscripción Google AI no paga esos requests. Trivergence debe mostrar cuenta,
project ID, región, modelo, presupuesto y estimación antes de ejecutar.

**Términos.** Google Cloud describe explícitamente la construcción de
“production-ready applications” y sus términos contemplan Customer Applications
y End Users. Generated Output es Customer Data y Google no entrena modelos con
Customer Data sin permiso/instrucción. Aplican AUP, política de IA generativa,
restricciones de edad/health y reglas especiales para grounding. Trivergence no
habilitará grounding, code execution ni agent services en el primer baseline.

**Recovery.** `streamGenerateContent` es una solicitud HTTP de inferencia. No se
encontraron operation ID, idempotency key, reconnect ni reanudación del mismo
request tras caída. Reenviar contexto genera otra ejecución y no satisface el
contrato. Batch jobs sí tienen recursos y cancelación, pero son otra modalidad y
no reparan el recovery de inferencia interactiva. Falta confirmar si
Interactions API y background recovery están disponibles bajo Vertex/ADC con
garantías GA.

Decisión: **`UNRESOLVED`**. Es la mejor vía oficial sin API key, pero no supera
recovery ni el gate interno de custodia de ADC.

### E. Antigravity como sucesor de consumidor

Google migró el acceso consumidor de CLI/Code Assist hacia Antigravity. Aunque
su CLI documenta headless, JSON/stream-JSON, schema, conversaciones y timeout,
sus términos prohíben usar productos no provistos por Google para acceder al
servicio y citan explícitamente el piggyback de OAuth por herramientas de
terceros. No es una salida para Trivergence y no se incluye como candidato.

## 2. Gates por alternativa

| Gate               | Gemini CLI                                    | Code Assist                                 | Gemini API                                 | Vertex AI                                                    |
| ------------------ | --------------------------------------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Technical          | `ADAPTABLE` en headless; recovery bloqueado   | `BLOCKED`: no API de provider               | `SUPPORTED`: Interactions GA y structured  | `SUPPORTED` salvo recovery online                            |
| Security           | `BLOCKED`: frontera OAuth/CLI no autorizada   | `BLOCKED`: superficie IDE y permisos ajenos | `ADAPTABLE`: key vault, retención y egress | `ADAPTABLE`: ADC/IAM, account binding y proceso aislado      |
| Authentication     | `REJECTED` para piggyback/login consumidor    | `REJECTED` como auth transferible           | `SUPPORTED` solo key/auth key              | `SUPPORTED` mediante ADC/OAuth/IAM                           |
| Contractual        | `REJECTED` para backend tercero con OAuth CLI | `REJECTED` como interfaz/redistribución     | `SUPPORTED` para apps sujetas a API Terms  | `SUPPORTED` para Customer Applications sujetas a Cloud Terms |
| Distribution       | `UNRESOLVED`; no se redistribuye              | `REJECTED` para inclusión                   | `SUPPORTED`: REST/SDK Apache-2.0           | `SUPPORTED`: REST/SDK; gcloud queda externo                  |
| Commercial/Billing | `BLOCKED`: entitlement no transferible        | `BLOCKED`: licencia no es cuota API         | `ADAPTABLE`: free/paid por proyecto        | `ADAPTABLE`: Cloud project PayGo/provisioned                 |
| **Decisión**       | **`REJECTED`**                                | **`REJECTED`**                              | **`CONDITIONALLY_APPROVED`**               | **`UNRESOLVED`**                                             |

`SUPPORTED` no equivale a `PASS` de conformance y no autoriza implementación.

## 3. Mapping a ProviderAdapter

### Alternativas razonablemente viables

| Campo            | Gemini Developer API / Interactions                                  | Vertex AI Gemini / ADC                                            |
| ---------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `prepare`        | `ADAPTABLE`: token count, modelo y schema; preview es de Trivergence | `ADAPTABLE`: igual más project/region/IAM                         |
| `execute`        | `SUPPORTED`: create interaction / generate                           | `SUPPORTED`: generateContent API/SDK                              |
| `stream`         | `SUPPORTED`: eventos tipados/SSE                                     | `SUPPORTED`: streamGenerateContent                                |
| `cancel`         | `SUPPORTED`: background interaction cancelable                       | `ADAPTABLE`: abort local; cancelación remota exacta no demostrada |
| `recover`        | `SUPPORTED` para background: ID, get y `last_event_id`               | `BLOCKED` para inferencia online exacta                           |
| `health`         | `ADAPTABLE`: auth, model/list y request controlado                   | `ADAPTABLE`: ADC, IAM, API/model/location                         |
| `authentication` | `BLOCKED` para UX principal: requiere key/auth key                   | `SUPPORTED`: ADC/OAuth/IAM sin API key                            |
| `version`        | `SUPPORTED`: versión/revisión API y SDK                              | `SUPPORTED`: v1/v1beta y SDK fijable                              |
| `fingerprint`    | `ADAPTABLE`: backend, model, revision, SDK                           | `ADAPTABLE`: suma project, region y credential class              |
| `capabilities`   | `SUPPORTED`: models, schema, tools e interaction states              | `ADAPTABLE`: modelo/región/feature lifecycle                      |
| `approvals`      | `SUPPORTED`: `requires_action`; autoridad queda en Runtime           | `ADAPTABLE`: function call como propuesta, no efecto              |
| `timeouts`       | `ADAPTABLE`: HTTP/background deadline y budget local                 | `ADAPTABLE`: deadline HTTP/gRPC y budget local                    |
| `budgets`        | `ADAPTABLE`: max output, usage y cuotas/costo local                  | `ADAPTABLE`: max output, usage, quota y Cloud budget local        |
| `typed errors`   | `ADAPTABLE`: HTTP/RPC/status normalizado                             | `ADAPTABLE`: Google RPC/HTTP normalizado                          |
| `provenance`     | `ADAPTABLE`: interaction ID, model, usage, revision                  | `ADAPTABLE`: response ID, model, project, region, SDK             |

Gemini CLI es técnicamente `ADAPTABLE` en execute/stream/cancel y `BLOCKED` en
auth, contractual y exact recovery. Code Assist carece de interfaz: sus campos
son `BLOCKED` o `UNKNOWN`. No se justifica diseñar un adapter para ninguno.

## 4. Evaluación contra las 14 comprobaciones

No hay `PASS` real: no se implementó ni ejecutó ningún provider.

| Comprobación              | Gemini CLI  | Code Assist | Gemini API / Interactions  | Vertex AI        |
| ------------------------- | ----------- | ----------- | -------------------------- | ---------------- |
| `capability_declaration`  | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `prepare_context_preview` | `ADAPTABLE` | `BLOCKED`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `execute_and_stream`      | `PASSABLE`  | `BLOCKED`   | `PASSABLE`                 | `PASSABLE`       |
| `cancellation`            | `ADAPTABLE` | `UNKNOWN`   | `PASSABLE`                 | `ADAPTABLE`      |
| `recovery`                | `BLOCKED`   | `UNKNOWN`   | `PASSABLE` en background   | `BLOCKED` online |
| `interrupted_recovery`    | `BLOCKED`   | `UNKNOWN`   | `PASSABLE` con ID/event ID | `BLOCKED` online |
| `timeout`                 | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `typed_failure`           | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `input_budget`            | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `output_budget`           | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `provenance`              | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `approval_boundary`       | `ADAPTABLE` | `BLOCKED`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `malformed_response`      | `ADAPTABLE` | `UNKNOWN`   | `ADAPTABLE`                | `ADAPTABLE`      |
| `unavailable_provider`    | `ADAPTABLE` | `ADAPTABLE` | `ADAPTABLE`                | `ADAPTABLE`      |

Gemini API alcanza 3 `PASSABLE` y 11 `ADAPTABLE`; Vertex alcanza 1 `PASSABLE`,
11 `ADAPTABLE` y 2 `BLOCKED`; Gemini CLI 1 `PASSABLE`, 11 `ADAPTABLE` y 2
`BLOCKED`. Code Assist no constituye una interfaz evaluable. Todos conservan 0
`PASS` hasta existir adapter autorizado, fixtures y ejecución real.

## 5. Modelo de costo y responsabilidad

| Ruta                    | Quién paga                                     | Requisitos                                | Relación con consumidor                            |
| ----------------------- | ---------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Gemini CLI login Google | Usuario/organización según entitlement oficial | Producto y plan compatible                | El acceso consumidor fue retirado; no transferible |
| Code Assist             | Organización con licencias Standard/Enterprise | Proyecto, licencia asignada, API y rol    | No es cuota de inferencia para terceros            |
| Gemini API free         | Proyecto del usuario/desarrollador             | Project + key/auth key; cuotas limitadas  | Independiente de Plus/Pro/Ultra                    |
| Gemini API paid         | Proyecto/billing account asociado              | Cloud Billing/créditos, límites por gasto | Independiente de Plus/Pro/Ultra                    |
| Vertex AI               | Proyecto Cloud del usuario u organización      | Billing, API, IAM, región y cuota/DSQ     | Independiente de Gemini Apps/Google AI             |

Trivergence no debe ocultar el pagador: un futuro preview mostrará cuenta,
proyecto, modelo, región, tier/cuota y estimación. No se permite usar un
proyecto del desarrollador como proxy compartido sin un modelo comercial y
contractual separado.

## 6. Distribución

| Alternativa                            | Resultado                 | Condición                                                                       |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| CLI oficial externa                    | `UNRESOLVED`              | instalación separada; no resuelve autorización de backend/OAuth                 |
| Gemini Code Assist plugin              | `REJECTED`                | no incluir ni redistribuir; no es provider API                                  |
| Google Gen AI SDK                      | `SUPPORTED`               | Apache-2.0, versión fijada, notices y supply-chain verification                 |
| REST oficial                           | `SUPPORTED`               | endpoints documentados, TLS y API revision fijada                               |
| gcloud CLI                             | `CONDITIONALLY_SUPPORTED` | instalación externa; solo bootstrap/ADC oficial, nunca tokens copiados          |
| OAuth propio de desktop                | `CONDITIONALLY_SUPPORTED` | cliente propio, navegador externo, PKCE, loopback, consent/verificación y vault |
| Workforce/Workload Identity Federation | `CONDITIONALLY_SUPPORTED` | configuración empresarial y credenciales cortas; no consumer UX                 |

## 7. Seguridad y límites de la primera capacidad

El [threat model específico](../security/threat-model-google-gemini.md) exige
fail-closed, cuenta/proyecto/región fijados por ejecución, scopes/roles mínimos,
preview de egress/costo/retención, credenciales fuera de logs/audit, SDK fijado
y verificado, parser y stream acotados, tools como propuestas, cancelación con
estado explícito y conciliación de jobs. No se habilitan grounding, code
execution, managed agents ni tools remotas.

## 8. Fuentes oficiales y evidencia

Consultadas el 2026-09-15:

- [Gemini CLI: términos y privacidad](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md)
  — licencia y prohibición de acceso tercero/piggyback OAuth.
- [Gemini CLI FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md)
  — métodos autorizados para herramientas de terceros.
- [Gemini CLI authentication](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx)
  — login, key/Vertex y headless.
- [Gemini CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md)
  y
  [commands/checkpoints](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md)
  — JSON, sesiones, sandbox y checkpoints.
- [Fin de Code Assist Individual y consumer CLI](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
  — corte del 18 de junio de 2026.
- [Gemini Code Assist setup](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini)
  y
  [plugin license](https://developers.google.com/gemini-code-assist/resources/plugin-license)
  — licencia, proyecto, roles e integración IDE.
- [Antigravity terms](https://antigravity.google/terms) y
  [headless CLI](https://antigravity.google/docs/cli/headless/) — sucesor de
  consumidor y prohibición equivalente de acceso tercero.
- [Gemini API authentication](https://ai.google.dev/gemini-api/docs/api-key) —
  keys/auth keys y vínculo a proyecto.
- [Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview),
  [background execution](https://ai.google.dev/gemini-api/docs/background-execution)
  y [streaming](https://ai.google.dev/gemini-api/docs/streaming) — GA, IDs,
  estados, cancelación, polling y reconnect.
- [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing),
  [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
  [pricing](https://ai.google.dev/gemini-api/docs/pricing) y
  [Additional Terms](https://ai.google.dev/gemini-api/terms) — tiers, pagador y
  tratamiento de datos.
- [Vertex AI quickstart](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/quickstart),
  [overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs) y
  [function calling](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling)
  — SDK/REST, producción y capacidades.
- [ADC](https://docs.cloud.google.com/docs/authentication/application-default-credentials),
  [Cloud authentication](https://docs.cloud.google.com/docs/authentication),
  [OAuth desktop](https://developers.google.com/identity/protocols/oauth2/native-app)
  y
  [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
  — credenciales, PKCE, navegador, scopes y verificación.
- [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
  — credenciales temporales sin service account key.
- [Google APIs Terms](https://developers.google.com/terms),
  [Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms) y
  [Cloud services summary](https://cloud.google.com/terms/services) — APIs
  documentadas, Customer Applications y términos generativos.
- [Google Gen AI SDK oficial](https://github.com/googleapis/js-genai) — SDK
  unificado y licencia Apache-2.0.
- [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)
  y [quotas](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/quotas)
  — PayGo/provisioned y límites por proyecto/región.

## 9. Criterio para reabrir

No se construirá spike hasta que Google confirme de forma citable una de estas
dos rutas completas:

1. Interactions API GA con background recovery disponible en Vertex AI mediante
   ADC/OAuth y proyecto del usuario; o
2. una autenticación oficial de Gemini Developer API para desktop de terceros
   que no requiera introducir/custodiar una key y conserve IDs/reconnect.

Además deben aprobarse el ADR de credenciales ADC, el tratamiento de retención,
la revisión legal y el plan de billing. Hasta entonces, Reference Provider sigue
siendo el único provider ejecutable.
