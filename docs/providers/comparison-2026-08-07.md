# Expediente comparativo de proveedores sin API keys

Estado: investigación completa; ninguna integración aprobada ni habilitada  
Corte de fuentes: 2026-08-07  
Renovación obligatoria: 2026-09-07 o ante cualquier cambio de fuente

> Actualización Codex 2026-09-15: el expediente M5-A reemplaza la evaluación de
> Codex de este comparativo. El resultado actual es `UNRESOLVED`, no
> `CONDITIONAL`, porque el comando figura experimental/no soportado para
> producción, falta claridad contractual para Plus/Pro y existe un gap de
> recovery. Véase [codex-app-server-gate.md](codex-app-server-gate.md). La
> evaluación M5-A2 de Claude también fue reemplazada el 2026-09-15: la mejor
> ruta es ejecutar Claude Code oficial e inalterado, pero su resultado global
> sigue `UNRESOLVED`. La evaluación M5-A3 de Google reemplaza ahora la columna
> Gemini: Vertex AI mediante ADC es la mejor ruta sin key, pero continúa
> `UNRESOLVED` por recovery y frontera de credenciales. Véase
> [google-gemini-gate.md](google-gemini-gate.md).

Este expediente es análisis de producto y riesgo, no asesoramiento legal. Solo
un revisor jurídico autorizado puede aprobar la columna legal del gate.

## Dictamen ejecutivo

| Proveedor/ruta                   | Autenticación oficial sin API key                                           | Interfaz estructurada                                               | Aplicación de terceros                                                                       | Gate actual                |
| -------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| Codex App Server                 | ChatGPT browser/device code gestionado por Codex                            | JSON-RPC sobre `stdio`, streaming, cancelación, schemas y approvals | El embedding técnico está documentado; el entitlement de terceros con Plus/Pro no está claro | `UNRESOLVED — APP SERVER`  |
| Claude Code oficial e inalterado | Login del propio usuario dentro del cliente oficial                         | `-p`, JSON/JSONL, schema, cancelación, sesiones y budgets           | Anthropic permite ejecutarlo en productos; el límite frente al Agent SDK necesita aclaración | `UNRESOLVED — CLAUDE CODE` |
| Claude Platform mediante `ant`   | OAuth de Claude Console para desarrollo/scripting local; WIF para workloads | CLI/API JSON; el contrato de streaming/recovery aún no basta        | La API admite productos; competencia/reventa necesita aclaración para un orquestador         | `UNRESOLVED — PLATFORM`    |
| Gemini en Vertex AI              | OAuth/ADC/IAM con proyecto Cloud y billing del usuario                      | API/SDK, streaming, schema JSON y function calling                  | Customer Applications contempladas; exact recovery no demostrado                             | `UNRESOLVED — VERTEX`      |
| Gemini CLI/Code Assist OAuth     | Login Google del producto oficial                                           | La CLI tiene modos agentic/estructurados                            | Google prohíbe que software de terceros use/piggyback ese OAuth/backend                      | `REJECTED`                 |
| Agent SDK con OAuth Claude.ai    | Login de suscripción embebido en una app                                    | SDK Python/TypeScript                                               | Anthropic exige aprobación previa para ofrecer login o rate limits                           | `REJECTED`                 |

“Condicional” significa que existe una ruta técnica oficial, no que Trivergence
tenga autorización jurídica para distribuirla. Se requiere aprobación humana
identificada y, donde se indica, confirmación escrita del proveedor.

## 1. Codex/OpenAI

### Ruta sin claves

Codex App Server está documentado como la interfaz para integrar autenticación,
historial, approvals y eventos del agente dentro de un producto propio. Admite
login ChatGPT por navegador y device code; el servidor conserva/renueva la
sesión. Para Business/Enterprise existen Codex access tokens destinados a
workflows locales no interactivos confiables. No son Platform API keys, pero sí
secretos que exigen vault, expiración y revocación.

Fuentes oficiales:

- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Autenticación de Codex](https://developers.openai.com/codex/auth/)
- [Access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens)
- [Términos de uso](https://openai.com/policies/terms-of-use/)
- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/)

### Capacidades defendibles para la primera iteración

- login oficial atendido y consulta de estado sin leer credenciales;
- inicialización/versionado del protocolo y schemas generados por la CLI exacta;
- thread/turn, streaming textual, progreso y cancelación;
- eventos estructurados y métricas de uso/rate limit disponibles;
- solicitudes de comando, archivo, red o tool tratadas solo como propuestas. El
  adapter las rechaza en Codex y las remite al Planner/Policy/Runtime de
  Trivergence para un plan nuevo.

Quedan fuera inicialmente WebSocket, `chatgptAuthTokens` experimental, dynamic
tools, MCP/apps, ejecución de comandos por Codex, escritura y cloud jobs.

### Riesgo contractual

Los términos individuales prohíben compartir cuentas y extraer programáticamente
datos/output; al mismo tiempo, App Server documenta el uso en productos propios
y expone formalmente el flujo de login. No corresponde inferir que una cláusula
anula la otra para todo tipo de cuenta. Antes de distribuir:

1. asesoría debe fijar si el piloto usa Terms of Use o Services Agreement;
2. OpenAI debe confirmar por escrito el uso de App Server con cuentas personales
   si se desea admitir Plus/Pro;
3. Business/Enterprise debe validar permisos de Codex Local y, si hay
   automatización desatendida, access tokens;
4. Trivergence no comparte, exporta ni inspecciona `auth.json` y no expone el
   servicio en entornos públicos/no confiables.

Esta conclusión queda reemplazada por el
[gate M5-A de 2026-09-15](codex-app-server-gate.md). No debe utilizarse la
antigua etiqueta `CONDITIONAL` para habilitar ninguna capability.

## 2. Claude/Anthropic

> Esta sección refleja el gate M5-A2 de 2026-09-15 y reemplaza la evaluación
> condicional original. Véase el [expediente completo](claude-gate.md).

### Ruta sin claves principal

Anthropic documenta `claude -p` para automatización con JSON, JSONL, schema,
cancelación, sesiones y budgets. También permite ejecutar Claude Code publicado
e inalterado dentro de productos si cada usuario autentica y paga directamente
su uso. Pro, Max, Team y Enterprise pueden utilizar hoy sus límites de
suscripción; Free no incluye Claude Code.

Trivergence no puede ofrecer su propio login Claude.ai: solo podría lanzar una
instalación oficial externa y dejar autenticación, refresh y credenciales en el
cliente oficial. La documentación del Agent SDK exige aprobación previa para
incorporar login o rate limits Claude.ai en una app. Esa frontera exacta debe
confirmarse antes de un spike.

### Alternativa Claude Platform

El CLI oficial `ant` permite OAuth de Claude Console sin API key manual y está
destinado a scripting local. Usa la API y facturación separada de Claude.ai. WIF
cubre workloads empresariales no interactivos.

Fuentes oficiales:

- [Autenticación de ant CLI](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication)
- [Scripting con ant CLI](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/scripting)
- [Autenticación de Claude Platform](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Legal y compliance de Claude Code](https://code.claude.com/docs/en/legal-and-compliance)
- [Automatización de Claude Code](https://code.claude.com/docs/en/headless)
- [Agent SDK](https://code.claude.com/docs/en/agent-sdk)
- [Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
- [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)
- [Usage Policy](https://www.anthropic.com/legal/aup)

### Separación obligatoria

- Claude Code oficial externo: candidato condicionado; no se leen sus tokens.
- Agent SDK con login Claude.ai propio: rechazado sin aprobación previa.
- `ant` + Claude Console OAuth: alternativa API condicionada.
- WIF/Bedrock/Vertex: candidato empresarial condicionado.

### Capacidades defendibles

Solo inferencia estructurada sin tools: `--safe-mode`, `--restricted`, tools y
MCP vacíos, configuración cerrada, stdin y JSONL. El Runtime conserva toda la
autoridad. El agent loop, comandos, archivos, web, hooks, plugins, memoria,
subagentes y permisos nativos quedan fuera.

### Resultado actual

`UNRESOLVED`. Claude Code ofrece la vía oficial más alineada con el producto,
pero no recupera el mismo turn interrumpido y debe aclararse si usar el binario
como provider cae dentro del permiso de ejecución en productos sin convertirse
en un login/rate-limit propio del Agent SDK. No se autoriza adapter ni spike.

### Comparación M5-A: Codex frente a la mejor vía Claude

| Criterio                | Codex App Server                                         | Claude Code oficial e inalterado                               |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Technical               | Experimental; protocolo rico; recovery bloqueado         | `-p`, JSONL y cancel documentados; recovery bloqueado          |
| Authentication          | Login ChatGPT gestionado; entitlement de terceros dudoso | Login gestionado por Claude Code; no se expone OAuth           |
| Contractual             | Uso Plus/Pro por terceros sin confirmación inequívoca    | Ejecución en productos permitida; límite Agent SDK por aclarar |
| Distribution            | Código Apache; interfaz no soportada en producción       | Binario propietario inalterado; instalación externa            |
| Recovery                | `BLOCKED`                                                | `BLOCKED`                                                      |
| Conformance             | 12 `ADAPTABLE`, 2 `BLOCKED`; 0 `PASS` real               | 5 `PASSABLE`, 7 `ADAPTABLE`, 2 `BLOCKED`; 0 `PASS`             |
| Cost model              | Entitlement ChatGPT no aclarado para este producto       | Límites propios del plan; Console/API alternativa separada     |
| Production maturity     | App Server experimental                                  | Cliente oficial con interfaz programática documentada          |
| Third-party suitability | Técnica documentada; gate de cuenta/contrato abierto     | Ejecutable en productos; OAuth propio/SDK requiere aprobación  |

## 3. Gemini/Google

> Esta sección refleja el gate M5-A3 de 2026-09-15 y reemplaza la evaluación
> condicional original. Véase el [expediente completo](google-gemini-gate.md).

### Rutas rechazadas

Google afirma que software de terceros que accede al servicio detrás de Gemini
CLI usando/piggyback su OAuth viola los términos y puede causar suspensión. Por
ello Trivergence no reutiliza caché, client ID, tokens ni login de Gemini CLI o
Code Assist, aun cuando pueda lanzar la CLI externamente para uso humano.

Fuentes oficiales:

- [Gemini CLI: licencia, términos y privacidad](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md)
- [Gemini CLI FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md)

### Mejor ruta sin key

Gemini sobre Vertex AI puede usar OAuth/ADC/IAM y bearer tokens sin API key. El
usuario aporta un proyecto Google Cloud con billing, Vertex habilitado y rol
mínimo. ADC creado por `gcloud auth application-default login` evita que
Trivergence capture contraseña o copie tokens, pero el proceso sigue usando una
credencial renovable local. OAuth propio requeriría navegador externo, PKCE,
callback loopback, scopes mínimos, verificación/branding y vault. Vertex queda
abierto hasta un ADR de credenciales y una primitive de recovery exacto. “Sign
in with Google” por sí solo autentica identidad y no autoriza Vertex.

Fuentes oficiales:

- [OAuth para apps Desktop](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Políticas OAuth](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google Cloud Terms](https://cloud.google.com/terms)
- [Service Specific Terms](https://cloud.google.com/terms/service-terms)
- [Vertex AI y zero data retention](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention)
- [Function calling](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling)
- [Structured JSON](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2)

### API alternativa con credencial

Gemini Developer API es una API oficial para terceros y su Interactions API GA
documenta interaction IDs, background execution, cancelación, polling y
reconexión por event ID. Es la única ruta Google evaluada que satisface
documentalmente exact recovery, pero exige API key/auth key y proyecto/billing
separados. Queda `CONDITIONALLY_APPROVED` solo como extensión futura fuera del
flujo principal; no se autoriza implementación ni UX de keys.

### Capacidades defendibles de Vertex

Generación/streaming de texto, salida JSON con schema, multimodal admitido por
modelo y propuestas de function calls. Grounding Search/Maps, code execution,
computer use, agents gestionados, tuning y embeddings quedan fuera del primer
gate por términos, retención o autoridad adicional.

### Riesgo contractual y técnico

Vertex contempla Customer Applications y trata generated output como Customer
Data; no usa Customer Data para training sin permiso. No obstante, Trivergence
debe confirmar que su carácter multi-provider no cae en “producto similar o
competidor” y que BYO Cloud Project no es reventa/sublicencia. También requiere
OAuth verification, privacy/terms propios, age gate de 18 años, IAM mínimo, cost
preview y matriz de regiones.

La inferencia online de Vertex no documenta operation IDs, idempotencia o
reconnect de la misma ejecución. Reenviar contexto crea otra inferencia. Tampoco
se ha confirmado que Interactions API background esté disponible bajo
Vertex/ADC. Por eso Vertex es `UNRESOLVED`, no `CONDITIONAL` ni `APPROVED`.

### Matriz objetiva de los tres ecosistemas

| Criterio                   | Codex App Server                                                  | Claude Code oficial                                      | Mejor vía Google: Vertex AI + ADC                             |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Technical maturity         | Protocolo rico, comando experimental/no soportado para producción | Headless/JSONL documentado                               | API Cloud de producción; recovery online incompleto           |
| Third-party suitability    | Embedding técnico documentado; entitlement abierto                | Ejecución en productos documentada; frontera SDK abierta | Customer Applications y SDK/REST documentados                 |
| Authentication             | Login ChatGPT gestionado; Plus/Pro por confirmar                  | Login gestionado en CLI; Free no incluido                | ADC/OAuth/IAM del usuario y proyecto Cloud                    |
| Subscription compatibility | ChatGPT entitlement sin confirmación para este caso               | Pro/Max/Team/Enterprise en cliente oficial               | Ninguna: Google AI Plus/Pro/Ultra no paga Vertex              |
| Contractual clarity        | `UNRESOLVED`                                                      | `UNRESOLVED`                                             | API Cloud clara; BYO-project/multi-provider requiere revisión |
| Streaming                  | Documentado                                                       | JSONL documentado                                        | `streamGenerateContent` documentado                           |
| Cancellation               | Documentada                                                       | Señal/proceso documentado                                | Abort adaptable; estado remoto online no demostrado           |
| Recovery                   | `BLOCKED`                                                         | `BLOCKED`                                                | `BLOCKED` para inferencia online exacta                       |
| Conformance                | 12 `ADAPTABLE`, 2 `BLOCKED`; 0 `PASS`                             | 5 `PASSABLE`, 7 `ADAPTABLE`, 2 `BLOCKED`; 0 `PASS`       | 1 `PASSABLE`, 11 `ADAPTABLE`, 2 `BLOCKED`; 0 `PASS`           |
| Distribution               | Código Apache; interfaz experimental                              | Binario propietario, instalación externa                 | SDK Apache/REST; gcloud externo                               |
| Cost/billing               | Entitlement ChatGPT por aclarar                                   | Plan propio; Platform separada                           | Proyecto Cloud del usuario, PayGo/quota                       |
| Security boundary          | Proceso oficial + app server                                      | Proceso oficial inalterado                               | Adapter → Google Auth/ADC → endpoint Cloud allowlisted        |

## Recomendación

No preparar todavía ningún adapter externo. Codex App Server, Claude Code
oficial y Vertex AI permanecen `UNRESOLVED` por bloqueos distintos. Gemini API
Interactions es técnicamente el candidato Google con mejor recovery, pero exige
key/auth key y billing API separados, por lo que no satisface el flujo
principal.

El siguiente paso Google es enviar
`docs/providers/google-gemini-open-questions.md`, sobre todo para confirmar
Interactions background/reconnect en Vertex con ADC y la arquitectura BYO
project. Solo después de respuestas citables, ADR de credenciales y revisión
legal corresponde reconsiderar un spike aislado.

## Pendientes comunes antes de cualquier `ENABLED`

- dictamen firmado y, cuando se indica, respuesta escrita del proveedor;
- términos/privacidad propios de Trivergence, DPA y mapa controller/processor;
- egress preview, modelo/región/cuenta/coste y consentimiento del usuario;
- version pin, fixtures, parser hostil, budgets, cancelación y redacción;
- threat model de OAuth/token vault y procedimiento de incidente/revocación;
- disclosures de IA, revisión humana y restricciones de alto impacto;
- prueba de región/export, marca, redistribución y actualización de términos.
