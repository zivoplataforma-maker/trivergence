# Gate de proveedor — Claude/Anthropic

Estado: Claude Platform `CONDITIONAL — SECOND`; Claude Code OAuth `REJECTED`  
Verificado contra fuentes oficiales: 2026-08-07  
Vence: 2026-09-07 o ante cambios de interfaz/términos

## Ruta sin API key candidata

El CLI oficial `ant` permite OAuth contra Claude Console, con token limitado a
un workspace, para desarrollo y scripting en la propia máquina. Trivergence
delegaría login, refresh y perfiles al CLI, sin imprimir credenciales. Para
servidores/empresa, Workload Identity Federation usa identidad del IdP y tokens
breves.

Fuentes:

- [Autenticación de ant](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/authentication)
- [Scripting con ant](https://platform.claude.com/docs/en/cli-sdks-libraries/cli/scripting)
- [Autenticación de Claude Platform](https://platform.claude.com/docs/en/manage-claude/authentication)
- [Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
- [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)
- [Usage Policy](https://www.anthropic.com/legal/aup)

## Ruta rechazada

Claude Code autenticado con Claude.ai Free/Pro/Max no será backend de
Trivergence. Consumer Terms prohíbe acceso automatizado/no humano salvo API key
o permiso explícito. No se ofrece login Claude.ai, no se lee su credential store
y no se invoca `claude -p` con esa suscripción.

## Alcance inicial si se aprueba

Messages/streaming, JSON estricto, conteo y propuestas `tool_use`; las tools
vuelven a Planner/Policy/Runtime. Managed Agents, Files, Batches, code
execution, MCP, server tools y beta requieren gates independientes.

## Bloqueos

Confirmación escrita de Anthropic para wrapper comercial de `ant`,
no-reventa/no-competencia y redistribución; exigir inicialmente instalación y
login del usuario; Commercial Terms/DPA/Usage Policy; privacidad, retención/ZDR,
región/export, disclosure/HITL, versión/fixtures y attestation firmada.

`ant auth status` solo informa origen/configuración; no prueba salud. Un futuro
probe debería usar además una operación read-only como listado de modelos.

Ver [expediente comparativo](comparison-2026-08-07.md).
