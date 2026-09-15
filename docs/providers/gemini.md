# Gate de proveedor — Gemini/Google

Estado: Google `UNRESOLVED`; Vertex AI `UNRESOLVED`; Gemini API
`CONDITIONALLY_APPROVED` solo como alternativa con credencial; Gemini CLI y Code
Assist `REJECTED` como provider routes  
Verificado contra fuentes oficiales: 2026-09-15  
Vence: 2026-10-15 o ante cambios de interfaz, términos o autenticación

Este resumen queda subordinado al [expediente M5-A3](google-gemini-gate.md), las
[preguntas abiertas](google-gemini-open-questions.md) y el
[threat model](../security/threat-model-google-gemini.md).

## Resultado

Google no ofrece hoy una ruta demostrada que reúna simultáneamente el flujo
principal sin API key y el contrato de recovery de Trivergence:

- Gemini CLI con login Google no puede usarse como backend tercero ni mediante
  piggyback OAuth. El acceso consumidor Individual/Google AI Pro/Ultra terminó
  el 18 de junio de 2026.
- Gemini Code Assist es un producto IDE/Cloud, no una API de provider, y su
  entitlement no es transferible.
- Gemini Developer API Interactions es una interfaz oficial para terceros con
  exact recovery documentado, pero requiere API key/auth key, proyecto y billing
  propios. No se implementa ni se agrega una UX de keys.
- Vertex AI mediante ADC/OAuth/IAM y proyecto Cloud del usuario es la mejor ruta
  sin API key. Sigue `UNRESOLVED` porque no se ha demostrado exact recovery para
  inferencia online/Vertex ni cerrado la frontera de custodia ADC.

No se construye adapter o spike, no se modifica ProviderAdapter o el trust store
y Gemini permanece deshabilitado. Reference Provider es el único ejecutable.
