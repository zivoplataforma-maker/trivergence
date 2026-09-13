# Expediente comparativo de proveedores sin API keys

Estado: investigación completa; ninguna integración aprobada ni habilitada  
Corte de fuentes: 2026-08-07  
Renovación obligatoria: 2026-09-07 o ante cualquier cambio de fuente

Este expediente es análisis de producto y riesgo, no asesoramiento legal. Solo
un revisor jurídico autorizado puede aprobar la columna legal del gate.

## Dictamen ejecutivo

| Proveedor/ruta                 | Autenticación oficial sin API key                                                           | Interfaz estructurada                                               | Aplicación de terceros                                                                     | Gate actual                |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| Codex App Server               | ChatGPT browser/device code; access token Business/Enterprise para automatización confiable | JSON-RPC sobre `stdio`, streaming, cancelación, schemas y approvals | La documentación indica usarlo para integración profunda en un producto propio             | `CONDITIONAL — PREFERRED`  |
| Claude Platform mediante `ant` | OAuth de Claude Console para desarrollo/scripting local; WIF para workloads                 | CLI/API JSON, streaming, Messages, strict output y tool proposals   | Scripting está permitido; embedding/distribución por un tercero no está dicho expresamente | `CONDITIONAL — SECOND`     |
| Gemini en Vertex AI            | OAuth/ADC/IAM con proyecto Cloud, billing y cliente OAuth propio                            | API/SDK, streaming, schema JSON y function calling                  | Customer Applications están contempladas, con Cloud/IAM/OAuth propios                      | `CONDITIONAL — ENTERPRISE` |
| Gemini CLI/Code Assist OAuth   | Login Google del producto oficial                                                           | La CLI tiene modos agentic/estructurados                            | Google prohíbe que software de terceros use/piggyback ese OAuth/backend                    | `REJECTED`                 |
| Claude Code Pro/Max OAuth      | Login de suscripción dentro de Claude Code                                                  | `-p`, JSON/stream-json                                              | Consumer Terms bloquean automatización salvo API key o permiso explícito                   | `REJECTED`                 |

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

## 2. Claude/Anthropic

### Ruta sin claves

El nuevo CLI oficial `ant` permite `ant auth login` mediante OAuth de Claude
Console sin crear API key. El token queda limitado a un workspace y está
destinado a desarrollo y scripting en la propia máquina. La documentación
también permite scripts que usan esas credenciales, aunque Trivergence no debe
imprimirlas ni copiarlas. Para servidores, WIF intercambia identidad de AWS,
Google Cloud, Azure u otro IdP por tokens breves.

Fuentes oficiales:

- [Autenticación de ant CLI](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication)
- [Scripting con ant CLI](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/scripting)
- [Autenticación de Claude Platform](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
- [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)
- [Usage Policy](https://www.anthropic.com/legal/aup)

### Separación obligatoria

- `ant` + Claude Console OAuth: candidato comercial condicionado.
- WIF/Bedrock/Vertex: candidato empresarial condicionado.
- Claude Code con Free/Pro/Max: no es un puente de autenticación. Los términos
  de consumo prohíben acceso automatizado/no humano salvo API key o permiso
  explícito; Trivergence nunca lee ni reutiliza su sesión.

### Capacidades defendibles

Messages/streaming, JSON estricto, propuestas `tool_use`, conteo y modelos. Las
tools son ejecutadas únicamente por Runtime tras plan/policy/approval. Managed
Agents, Files, Batches, code execution, MCP, server tools y features beta
requieren gates separados por retención y autoridad.

### Riesgo contractual

Commercial Terms exige revisión humana/apropiada, aviso de inexactitud y
cumplimiento de Usage Policy; restringe productos competidores y reventa salvo
aprobación. La documentación permite scripting local pero no afirma
explícitamente que un tercero pueda distribuir un wrapper comercial de `ant`. Se
requiere confirmación escrita sobre ese uso, no-reventa/no-competencia y la
licencia de redistribución. La primera versión exigiría instalación y login del
usuario, sin bundlear el CLI.

## 3. Gemini/Google

### Rutas rechazadas

Google afirma que software de terceros que accede al servicio detrás de Gemini
CLI usando/piggyback su OAuth viola los términos y puede causar suspensión. Por
ello Trivergence no reutiliza caché, client ID, tokens ni login de Gemini CLI o
Code Assist, aun cuando pueda lanzar la CLI externamente para uso humano.

Fuentes oficiales:

- [Gemini CLI: licencia, términos y privacidad](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md)
- [Gemini CLI FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md)

### Ruta sin claves admitida

Gemini sobre Vertex AI puede usar OAuth/ADC/IAM y bearer tokens sin API key. El
usuario aporta un proyecto Google Cloud con billing, Vertex habilitado y rol
mínimo. Para una app Desktop pública, la ruta estándar exigiría OAuth client
propio, navegador externo, Authorization Code + PKCE, callback loopback, scopes
mínimos, verificación/branding y vault del sistema. Eso contradice la frontera
actual de Trivergence, que no custodia tokens: Vertex queda bloqueado hasta un
ADR de credenciales o una arquitectura empresarial WIF/ADC aislada. “Sign in
with Google” por sí solo autentica identidad y no autoriza Vertex.

Fuentes oficiales:

- [OAuth para apps Desktop](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Políticas OAuth](https://developers.google.com/identity/protocols/oauth2/policies)
- [Google Cloud Terms](https://cloud.google.com/terms)
- [Service Specific Terms](https://cloud.google.com/terms/service-terms)
- [Vertex AI y zero data retention](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention)
- [Function calling](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling)
- [Structured JSON](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2)

### Capacidades defendibles

Generación/streaming de texto, salida JSON con schema, multimodal admitido por
modelo y propuestas de function calls. Grounding Search/Maps, code execution,
computer use, agents gestionados, tuning y embeddings quedan fuera del primer
gate por términos, retención o autoridad adicional.

### Riesgo contractual

Vertex contempla Customer Applications y trata generated output como Customer
Data; no usa Customer Data para training sin permiso. No obstante, Trivergence
debe confirmar que su carácter multi-provider no cae en “producto similar o
competidor” y que BYO Cloud Project no es reventa/sublicencia. También requiere
OAuth verification, privacy/terms propios, age gate de 18 años, IAM mínimo, cost
preview y matriz de regiones.

Gemini Developer API/AI Studio no se recomienda: su OAuth actual y la referencia
general de generación no son suficientemente consistentes para aprobar una app
de producción sin confirmación oficial.

## Comparación ponderada

Escala 1–5; es una evaluación arquitectónica, no una conclusión legal.

| Criterio                            | Codex App Server | Claude `ant` | Gemini Vertex |
| ----------------------------------- | ---------------: | -----------: | ------------: |
| Integración local sin API key       |                5 |            4 |             2 |
| Protocolo estructurado/versionable  |                5 |            4 |             5 |
| Encaje con approvals de Trivergence |                5 |            4 |             4 |
| Claridad para producto de terceros  |                4 |            3 |             4 |
| Onboarding/coste operativo          |                5 |            4 |             2 |
| Separación de credenciales          |                4 |            4 |             3 |
| Total orientativo                   |           **28** |       **23** |        **20** |

## Recomendación

Preparar primero `CodexAppServerCandidateAdapter`, exclusivamente inerte. Es la
ruta más alineada con el producto: el proveedor ofrece una interfaz para un
cliente propio, schema por versión, eventos y approvals que pueden traducirse a
propuestas. Claude Platform mediante `ant` es el segundo candidato y Gemini
Vertex el camino empresarial de Google.

La recomendación no aprueba el gate. Codex pasa a implementación solo cuando
existan confirmación contractual para los tipos de cuenta soportados, revisor
legal identificado, attestation vigente, fixtures y trust-store de release.

## Pendientes comunes antes de cualquier `ENABLED`

- dictamen firmado y, cuando se indica, respuesta escrita del proveedor;
- términos/privacidad propios de Trivergence, DPA y mapa controller/processor;
- egress preview, modelo/región/cuenta/coste y consentimiento del usuario;
- version pin, fixtures, parser hostil, budgets, cancelación y redacción;
- threat model de OAuth/token vault y procedimiento de incidente/revocación;
- disclosures de IA, revisión humana y restricciones de alto impacto;
- prueba de región/export, marca, redistribución y actualización de términos.
