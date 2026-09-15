# Preguntas abiertas para Google — Trivergence M5-A3

Fecha: 2026-09-15  
Estado: bloqueantes; el silencio no constituye autorización

Contexto breve para enviar: Trivergence es una aplicación desktop open-source de
orquestación multi-provider. No redistribuye clientes Google, no extrae cookies
o tokens, no lee credential stores directamente y mantiene herramientas/efectos
bajo aprobación propia.

## Vertex AI e Interactions/recovery

1. ¿Está la Interactions API GA —incluidos `background=true`, interaction ID,
   `get`, `cancel` y reanudación por `last_event_id`— disponible para Gemini en
   Vertex AI usando ADC/OAuth y billing del proyecto Cloud del usuario? Indiquen
   endpoint, versión y documentación contractual aplicable.
2. Si no lo está, ¿qué primitive soportada de Vertex permite recuperar
   exactamente la misma inferencia online después de una caída del proceso o de
   red, sin crear una segunda inferencia ni facturación duplicada?
3. ¿Vertex ofrece idempotency keys o deduplicación documentada para requests de
   inferencia? ¿Cuál es la ventana y la garantía tras una respuesta incierta?
4. ¿La cancelación de `streamGenerateContent` al cerrar el transporte detiene y
   deja de facturar el trabajo servidor, o solo desconecta al cliente? ¿Cómo se
   consulta el resultado final de la cancelación?

## Autenticación de una aplicación desktop open-source

5. ¿Es `gcloud auth application-default login` + ADC una arquitectura soportada
   para una aplicación desktop distribuida que usa el proyecto del usuario, o se
   considera exclusivamente un flujo de desarrollo local?
6. Si el flujo recomendado es un OAuth client propio, ¿el scope `cloud-platform`
   y el uso de Vertex AI por una app desktop pública requieren verificación
   adicional, evaluación de seguridad o una modalidad de cliente específica en
   Windows?
7. ¿Puede una app open-source usar Authorization Code + PKCE + loopback y
   guardar el refresh token en Windows Credential Manager, o recomiendan un
   broker/SDK diferente para evitar que la app custodie credenciales renovables?
8. ¿Existe una ruta oficial para que cada usuario seleccione y facture su propio
   proyecto sin que el desarrollador de Trivergence sea reseller ni pagador?
9. ¿Qué mecanismo oficial recomiendan para enlazar de manera verificable
   account, billing project, quota project y resource project y evitar
   confused-deputy?

## Términos y distribución

10. Confirmen si una aplicación open-source multi-provider que enruta tareas
    entre modelos, sin entrenar ni construir modelos competidores, es una
    “Customer Application” permitida bajo los Google Cloud Terms.
11. ¿El modelo BYO-project descrito constituye uso ordinario del cliente o
    suministro/reventa de Google Cloud Services que exigiría un acuerdo partner?
12. ¿Puede Trivergence distribuir `@google/genai` bajo Apache-2.0 y requerir
    `gcloud` como instalación oficial externa, sin redistribuir el Cloud SDK?
13. ¿Hay requisitos de marca o atribución adicionales al mostrar “Gemini on
    Vertex AI” como provider configurable junto con otros proveedores?

## Gemini CLI y Code Assist

14. ¿La prohibición de “third-party software” que piggybackea OAuth también
    prohíbe que una aplicación lance un Gemini CLI oficial, inalterado y
    previamente instalado, y consuma únicamente su `stream-json`, sin leer ni
    reutilizar las credenciales?
15. Si esa ejecución externa pudiera autorizarse para Standard/Enterprise, ¿qué
    acuerdo, API o consentimiento del administrador lo habilita expresamente?
16. ¿Existe alguna interfaz soportada de Gemini Code Assist para aplicaciones de
    terceros fuera de sus plugins/CLI oficiales?

## Privacidad, retención y costos

17. ¿Las garantías de retención y borrado de Interactions API son idénticas bajo
    Vertex AI? ¿Puede usarse background recovery con una retención inferior a la
    predeterminada y qué metadatos persisten tras borrar una interacción?
18. ¿Qué identificadores y usage metadata debe conservar una app para conciliar
    costos, cancelaciones y reintentos sin almacenar prompts ni outputs?
19. ¿Qué combinación de budgets, quotas y Cloud Billing alerts permite impedir
    gasto —no solo alertarlo— por usuario/proyecto en una aplicación desktop?

No se autorizará un spike por una respuesta comercial informal. Las respuestas
deben señalar documentación pública vigente o una autorización escrita aplicable
al caso exacto y revisable por seguridad/legal.
