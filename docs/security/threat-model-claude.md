# Threat model — Claude mediante cliente oficial externo

Estado: diseño previo; proveedor no habilitado  
Fecha: 2026-09-15  
Alcance: futura ruta Claude Code oficial por proceso/`stdio` y alternativa
Claude Platform mediante `ant`, ambas sujetas a M5-A2

## Activos y fronteras

Activos: workspace local, contexto seleccionado, decisiones de approval,
credenciales poseídas por el cliente oficial, cuenta/plan o workspace Console,
presupuesto, salida, session/request IDs, historial y provenance.

Fronteras:

1. Orchestration Engine -> AdapterHost;
2. AdapterHost -> futuro adapter Claude;
3. adapter -> proceso oficial Claude Code por pipes;
4. Claude Code -> autenticación/credential store propios y servicio Anthropic;
5. alternativa: adapter -> `ant` -> Claude API/workspace Console del usuario.

Todo stdout, stderr, exit code y contenido del proveedor es no confiable. Estar
autenticado no significa estar autorizado por el gate.

## Amenazas y mitigaciones obligatorias

| Amenaza                   | Impacto                                 | Mitigación concreta                                                                                      | Evidencia antes de habilitar  |
| ------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| OAuth interception        | secuestro de login/callback             | navegador y callback controlados por cliente oficial; sin webview, listener o token handling             | flujo hostil y allowlist      |
| Token leakage             | acceso y cargos no autorizados          | nunca leer credential files, `setup-token` o `print-credentials`; redactor en stdout/stderr              | tests de secretos canario     |
| Credential storage        | Trivergence se vuelve custodio          | login almacenado y renovado únicamente por cliente oficial; sin backups/export                           | inspección de persistencia    |
| Credential precedence     | usa otra cuenta o key heredada          | child environment allowlist; remover keys, tokens, base URLs, proxy y cloud vars sin inspeccionar stores | fixtures de cuentas múltiples |
| Account confusion         | datos o cobros en cuenta incorrecta     | confirmar modalidad no sensible antes de dispatch; nunca inferir entitlement                             | tests de cambio/logout        |
| Billing abuse             | consumo inesperado                      | preview de límites/coste, cap por turn, concurrencia, kill switch y aviso de owner                       | fixtures de agotamiento       |
| Process spawning          | autoridad local excesiva                | spawn directo sin shell; argv constante; body por stdin; cwd aislado; Job Object                         | tests argv/env/cwd/tree       |
| Executable discovery      | PATH hijacking                          | ruta oficial canónica allowlisted; owner/ACL; sin reparse point                                          | fixture binario falso         |
| Replacement/impersonation | proceso malicioso roba contexto         | publisher/digest/version allowlisted; rehash antes de spawn; invalidar cambios                           | TOCTOU y spoof tests          |
| Supply-chain compromise   | cliente o SDK comprometido              | instalación oficial externa, SBOM/notices propios, pin, review de release y kill switch                  | auditoría de release          |
| Protocol mismatch         | parsing ambiguo o policy bypass         | versión CLI fijada; schema JSONL cerrado; unknown event/enum fail closed                                 | corpus multiversión           |
| Prompt/tool injection     | output intenta ejecutar efectos         | output siempre dato; tools vacías y MCP negado; evento tool inesperado cancela                           | fixtures de tool injection    |
| Approval bypass           | efecto ocurre fuera del Runtime         | Runtime aprueba antes; `--permission-prompts none`; ninguna approval nativa aceptada                     | E2E replay/mismatch           |
| Workspace escape          | lectura fuera de scope                  | safe/restricted, `--tools ""`, cwd vacío dedicado y contexto solo por stdin                              | canarios externos             |
| Malicious output          | terminal/HTML/control chars             | UTF-8 estricto, schema, escaping UI; nunca interpretar config/comando                                    | fuzz de contenido             |
| Oversized stream          | memoria/disco/DoS                       | límites por línea/chunk/bytes, backpressure, timeout y truncado fail closed                              | boundary/fuzz tests           |
| Cancellation failure      | proceso/consumo continúa                | interrupt, grace period, Job Object kill, rechazar late events y marcar uso incierto                     | proceso que ignora cancel     |
| Timeout                   | proceso o conexión colgados             | deadlines de AdapterHost y transporte; kill tree; sin retry no presupuestado                             | fixtures de hang              |
| Orphan process            | consumo tras cerrar app                 | Job Object kill-on-close, PID inventory y cleanup al iniciar                                             | smoke de crash/reinicio       |
| Replay/recovery           | output/uso duplicados                   | session resume no se trata como turn recovery; no reintentar prompt                                      | 14/14 conformidad             |
| Retry amplification       | cliente multiplica consumo              | retries/fallback deshabilitados o budgetados; contador global por request                                | fixtures 429/5xx              |
| Privilege escalation      | tools o cuenta con autoridad inesperada | safe/restricted, tools/MCP vacíos, settings cerrados y subcomando exacto                                 | fixture de autoridad          |
| Debug leakage             | request/token en logs                   | prohibir debug; stderr acotado/redactado; no dump de environment                                         | inspección logs/export        |
| Provider update/downgrade | cambio incompatible/vulnerable          | auto-update deshabilitado/pin si Anthropic lo admite; digest/version y attestation revocable             | fixtures de cambio            |
| Remote impersonation      | endpoint no Anthropic                   | sin base URL/proxy/cloud overrides; environment allowlist; TLS del cliente oficial                       | fixture hostil                |

## Controles fail-closed

Claude permanece `unavailable` si falta cualquiera de estos elementos:

- attestation técnica, contractual y legal vigente;
- digest/publisher confiable en el release de Trivergence;
- versión/fingerprint permitido del cliente oficial;
- login propio del usuario dentro del cliente y modalidad inequívoca;
- capability exacta y modelo activo allowlisted;
- presupuesto y consentimiento de límites/billing explícitos;
- combinación safe/restricted/tools vacías y parser/stream/cancel/recovery que
  superen 14/14;
- modo privado desactivado para egress externo.

Ante evento desconocido, schema mismatch, tool request, output excedido,
credential ambiguity, timeout o cambio del ejecutable, el adapter cancela,
destruye el process tree y marca la observación `unhealthy`. Nunca cae a Agent
SDK con OAuth propio, API key solicitada en la UI, `setup-token`,
`print-credentials`, endpoint alterno o Managed Agents.

## Riesgo residual no aceptado

La cancelación local puede no detener inmediatamente el procesamiento remoto o
el consumo. Resume restaura una sesión, pero no existe recovery idempotente
documentado del mismo turn interrumpido. Tampoco está confirmada la frontera
entre ejecutar Claude Code inalterado en un producto y ofrecer login mediante
Agent SDK. Hasta resolver esos puntos, este diseño no autoriza implementación ni
ejecución.
