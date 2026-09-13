# Gate de proveedor — Gemini/Google

Estado: Vertex `CONDITIONAL — ENTERPRISE`; CLI OAuth `REJECTED`  
Verificado contra fuentes oficiales: 2026-08-07  
Vence: 2026-09-07 o ante cambios de interfaz/términos

## Restricción material

Google prohíbe expresamente que software de terceros acceda/piggyback al backend
de Gemini CLI mediante su OAuth y advierte sobre suspensión. Trivergence no lee
ni reutiliza tokens, client IDs, cache o sesión de Gemini CLI/Code Assist y no
los automatiza como proveedor estructurado.

Fuentes:

- [Gemini CLI: términos y privacidad](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md)
- [Gemini CLI FAQ](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/faq.md)

## Ruta sin API key candidata

Gemini sobre Vertex AI con proyecto y billing del cliente, OAuth/ADC/IAM y, para
una app pública, cliente OAuth propio. Esa ruta requiere navegador externo,
Authorization Code + PKCE, callback loopback, scopes mínimos, verificación y
vault. Como la arquitectura actual prohíbe a Trivergence custodiar tokens,
Vertex permanece bloqueado hasta un ADR de credenciales o una arquitectura
empresarial WIF/ADC aislada. Trivergence nunca suplanta la identidad OAuth de
otro cliente ni reutiliza la sesión de Gemini CLI.

Fuentes:

- [OAuth Desktop](https://developers.google.com/identity/protocols/oauth2/native-app)
- [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Vertex function calling](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling)
- [Structured JSON](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2)
- [Cloud service terms](https://cloud.google.com/terms/service-terms)
- [Zero data retention](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention)

## Alcance inicial si se aprueba

Texto/streaming, salida JSON con schema y propuestas de function calls. Runtime
ejecuta las tools tras plan/policy/approval. Quedan fuera grounding Search/Maps,
code execution, computer use, agentes gestionados, embeddings y tuning.

## Bloqueos

Dictamen sobre competitive use y BYO Cloud Project/no-reventa; confirmación del
patrón OAuth Desktop + Vertex; OAuth verification/branding; privacy/DPA y roles;
age gate 18+; región/residencia; IAM mínimo; coste/cuota; fixtures/modelos GA y
attestation firmada. Gemini Developer API OAuth permanece en `HOLD` por
documentación de generación aún inconsistente.

Ver [expediente comparativo](comparison-2026-08-07.md).
