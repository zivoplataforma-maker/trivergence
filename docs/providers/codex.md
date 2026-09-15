# Gate de proveedor — Codex/OpenAI

Estado: `UNRESOLVED`; candidato preferido, no habilitado  
Verificado contra fuentes oficiales: 2026-09-15  
M5: `PARTIAL`

La investigación M5-A confirmó que Codex App Server ofrece una interfaz oficial
para integrar Codex en productos propios mediante JSON-RPC/JSONL por `stdio`,
schemas generados para la versión instalada, threads/turns, streaming,
cancelación, approvals y autenticación ChatGPT gestionada por Codex. La misma
documentación califica actualmente el comando como experimental y no soportado
para producción.

No confirmó de forma inequívoca que una aplicación open-source de terceros pueda
usar esa interfaz con cuentas personales Plus/Pro. La invitación técnica a
embedding convive con una restricción de extracción programática en los Terms of
Use, sin una aclaración oficial que delimite este caso. Además, App Server no
documenta reanudación idempotente de un turn desde un checkpoint compatible con
las dos pruebas de recovery de Trivergence.

Por ello:

- Codex sigue `unavailable` y no tiene dispatcher ni adapter productivo;
- no se modificó el trust store;
- no se creó spike ni se accedió a credenciales;
- no se permiten API keys, tokens externos, cookies ni WebSocket;
- la instalación futura sería oficial y separada, nunca modificada por
  Trivergence;
- M5 continúa `PARTIAL`.

Expediente completo:

- [Gate M5-A](codex-app-server-gate.md)
- [Preguntas para OpenAI](codex-app-server-open-questions.md)
- [Threat model específico](../security/threat-model-codex-app-server.md)
- [Metodología general](gate-methodology.md)
