# Gate de proveedor — Codex/OpenAI

Estado: `CONDITIONAL — PREFERRED`; no habilitado  
Verificado contra fuentes oficiales: 2026-08-07  
Vence: 2026-09-07 o ante cambios de interfaz/términos

## Operación candidata

`provider.codex.prompt.structured` mediante Codex App Server local, transporte
`stdio`, con login ChatGPT por navegador/device code gestionado por el propio
servidor. No usa Platform API key y Trivergence nunca lee `auth.json`.

App Server se documenta para integrar autenticación, historial, approvals y
eventos dentro de productos propios. Ofrece JSON-RPC, schemas TypeScript/JSON
generados para la versión instalada, streaming, interrupción y solicitudes de
aprobación estructuradas.

Fuentes:

- [App Server](https://developers.openai.com/codex/app-server/)
- [Authentication](https://developers.openai.com/codex/auth/)
- [Access tokens empresariales](https://learn.chatgpt.com/docs/enterprise/access-tokens)
- [Terms of Use](https://openai.com/policies/terms-of-use/)
- [Services Agreement](https://openai.com/policies/services-agreement/)

## Autenticación permitida si se aprueba

- usuario presente: browser flow o device code del App Server;
- Business/Enterprise: access token para workflow local confiable cuando el
  administrador lo habilite;
- API key: fuera del requisito y del primer gate;
- `chatgptAuthTokens`: experimental y excluido;
- lectura/copia de credential store: prohibida.

## Alcance inicial

Thread/turn, texto y eventos estructurados, streaming, cancelación y uso. Toda
solicitud de comando, archivo, red o tool se rechaza en Codex y se transforma en
una propuesta que debe volver al Orchestration Engine. No se habilitan efectos,
WebSocket, MCP/apps, dynamic tools, cloud jobs ni ejecución desatendida.

## Bloqueos

1. fijar Terms of Use vs Services Agreement por tipo de cuenta;
2. confirmación escrita para distribución con cuentas personales, porque los
   términos de consumo restringen extracción programática;
3. revisión de licencia/redistribución o exigir instalación oficial del usuario;
4. versión exacta, schemas, fixtures, parser incremental y destinos de red;
5. privacy/DPA, egress preview, costes, retención y respuesta a incidentes;
6. attestation técnica, contractual y legal firmada e incluida en el release.

Hasta resolverlos la capability permanece `unavailable` y no existe dispatcher.

Ver también [expediente comparativo](comparison-2026-08-07.md) y
[ADR-0007](../architecture/adr/0007-provider-attestations-and-first-candidate.md).
