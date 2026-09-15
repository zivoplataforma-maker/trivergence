# Gate de proveedor — Claude/Anthropic

Estado global: `UNRESOLVED`  
Verificado contra fuentes oficiales: 2026-09-15  
Próxima revisión: ante respuesta oficial, cambio de términos o interfaz

## Mejor vía oficial encontrada

La vía mejor alineada con el requisito sin API keys es una instalación
independiente, oficial e inalterada de Claude Code, ejecutada mediante
`claude -p`. Anthropic documenta su uso programático y permite ejecutar el
binario publicado dentro de productos si cada usuario autentica su propia cuenta
y su consumo se factura bajo su propio acuerdo.

Trivergence no ofrecería un OAuth de Claude.ai ni vería contraseñas, cookies,
tokens o credential stores. El login seguiría siendo una función del cliente
oficial. Claude Platform mediante el CLI `ant` y OAuth de Console queda como
alternativa oficial sin clave manual, pero con facturación API separada.

## Decisión

- Technical Gate: `UNRESOLVED`; streaming y cancelación están documentados, pero
  no existe recovery del mismo turn interrumpido.
- Security Gate: `CONDITIONALLY_APPROVED`; los modos safe/restricted y tools
  vacías permiten un diseño aislado, todavía sin prueba real.
- Authentication Gate: `CONDITIONALLY_APPROVED`; el cliente oficial posee el
  login, mientras Agent SDK con OAuth propio sigue prohibido sin aprobación.
- Contractual Gate: `UNRESOLVED`; debe confirmarse que usar `claude -p` como
  provider cae dentro del permiso para ejecutar Claude Code en productos.
- Distribution Gate: `CONDITIONALLY_APPROVED`; el binario no se modifica ni
  redistribuye y debe instalarse por un canal oficial independiente.
- Commercial/Billing Gate: `CONDITIONALLY_APPROVED`; Pro, Max, Team y Enterprise
  pueden usar hoy límites de suscripción; Free no incluye Claude Code.
  Console/API se paga aparte.

No se construye adapter ni spike mientras los gates técnico y contractual sigan
sin resolver.

## Límites expresos

La autorización condicional no permite incorporar Agent SDK con login Claude.ai,
copiar sesiones de Claude Code ni intermediar consumo. Tampoco convierte Claude
Desktop en backend. Trivergence no lee credenciales y no utiliza
`claude setup-token`. Un futuro adapter solo podría lanzar el binario oficial
externo con tools, plugins, hooks, MCP y acceso al workspace deshabilitados.

## Documentos de control

- [Expediente completo M5-A2](claude-gate.md)
- [Preguntas abiertas para Anthropic](claude-open-questions.md)
- [Threat model específico](../security/threat-model-claude.md)
- [Comparación oficial](comparison-2026-08-07.md)

Fuentes oficiales principales:

- [Legal y compliance de Claude Code](https://code.claude.com/docs/en/legal-and-compliance)
- [Ejecución programática](https://code.claude.com/docs/en/headless)
- [Referencia CLI](https://code.claude.com/docs/en/cli-usage)
- [Agent SDK](https://code.claude.com/docs/en/agent-sdk)
- [Uso del plan con Agent SDK](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Autenticación de `ant`](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication)
- [Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
