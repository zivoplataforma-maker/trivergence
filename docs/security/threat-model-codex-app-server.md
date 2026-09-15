# Threat model — Codex App Server

Estado: diseño previo; proveedor no habilitado  
Fecha: 2026-09-15  
Alcance: futuro adapter local por `stdio`, sujeto al gate M5-A

## Activos y fronteras

Activos: workspace, prompts/contexto, decisiones de approval, historial local,
credenciales poseídas por Codex, ejecutable instalado, schemas, resultados,
budgets y provenance.

Fronteras:

1. Orchestration Engine -> AdapterHost;
2. AdapterHost -> futuro `CodexAppServerAdapter`;
3. adapter -> proceso oficial local por pipes;
4. proceso Codex -> servicios de OpenAI;
5. proceso Codex -> credential store y filesystem del usuario.

Todo dato del proceso, incluso JSON válido, es no confiable. Una instalación o
sesión autenticada no equivale a autorización de gate.

## Amenazas y mitigaciones obligatorias

| Amenaza                    | Impacto                                           | Mitigación concreta                                                                                                | Evidencia requerida antes de habilitar  |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Process spawning           | ejecución bajo autoridad excesiva                 | spawn directo sin shell; argv constante; cwd canónico; environment allowlist; Job Object Windows                   | tests de argv/env/cwd y process tree    |
| Executable discovery       | resolución de un binario atacante por `PATH`      | rutas oficiales allowlisted, resolución canónica, owner/ACL y no symlink/reparse inesperado                        | fixtures de path hijacking              |
| Executable replacement     | TOCTOU entre verificación y spawn                 | verificar identidad, tamaño y SHA-256 inmediatamente antes de spawn; revalidar tras cambio                         | test de sustitución concurrente         |
| Version spoofing           | binario falso devuelve versión permitida          | versión nunca basta: digest/procedencia, schema generado y attestation de release                                  | fixture de `--version` falsificado      |
| Malicious binary           | robo de datos/credenciales o ejecución arbitraria | no habilitar sin procedencia oficial verificable; mínimos privilegios; quarantine                                  | verificación de firma/manifest oficial  |
| Compromised installation   | comportamiento válido pero hostil                 | trust revocable por release, kill switch local, expiración de attestation                                          | procedimiento de incidente probado      |
| Protocol/schema mismatch   | parsing ambiguo o bypass de policy                | schema estable generado por versión exacta; digest allowlisted; unknown method/field fail closed                   | corpus de fixtures versionados          |
| Workspace escape           | lectura/escritura fuera de roots                  | thread efímero; cwd dedicado; tools/efectos deshabilitados; rutas canónicas; sandbox OS                            | canarios fuera del workspace            |
| Command execution          | comandos iniciados por el modelo                  | no exponer tools; declinar toda request de command; nunca traducir approval de Codex a approval concedida          | fixture de command approval hostil      |
| File/network/tool effects  | mutaciones o egress no previstos                  | política text-only, requests declinadas, network destinations visibles, Runtime único ejecutor                     | fixtures de file/MCP/network requests   |
| Approval bypass            | server actúa sin approval de Runtime              | Runtime approval antes del dispatch; digest plan/request; policy independiente; evento inesperado cancela turn     | E2E de mismatch/replay/expiry           |
| Credential exposure        | tokens en stdout/stderr/eventos/logs              | no leer stores; redactor antes de persistencia; stderr acotado; canarios; no guardar auth URL/code                 | tests de secreto canario                |
| OAuth interception         | robo de callback/code                             | App Server posee callback; navegador externo; URL HTTPS/host allowlisted; sin webview ni listener Trivergence      | test de URL maliciosa                   |
| Malicious streamed content | prompt injection o contenido ejecutable           | texto como dato; schema validation; nunca interpretar output como comando/config; UI escapada                      | fixtures de terminal/HTML/control chars |
| Oversized responses        | memoria/disco/DoS                                 | límites incrementales bytes/chunks/line length; backpressure; interrupt; truncado fail closed                      | fuzz y boundary tests                   |
| JSONL framing attack       | confusión de mensajes o memory exhaustion         | decoder incremental UTF-8 estricto; tamaño máximo por línea; ids correlacionados; duplicate/out-of-order rejection | fuzz de framing e ids                   |
| Cancellation failure       | trabajo/efectos continúan tras cancelar           | esperar terminal barrier; ignorar late events; grace timer; terminate Job Object; marcar unhealthy                 | test de proceso que ignora cancel       |
| Orphan processes           | consumo o acceso persistente                      | Job Object kill-on-close; inventario PID/children; cleanup en crash/startup                                        | smoke de crash y reinicio               |
| Recovery replay            | duplicación de output/efectos                     | recovery deshabilitado hasta primitive idempotente; nunca equiparar `thread/resume` con checkpoint                 | 14/14 conformidad                       |
| Update substitution        | update malicioso reemplaza binario                | Trivergence no actualiza; detectar cambio; invalidar attestation; canal oficial y firma/manifest                   | test de digest cambiado                 |
| Downgrade                  | versión vulnerable aún allowlisted                | mínimo de versión y denylist revocable; monotonic last-seen solo como señal; confirmación explícita                | fixture de downgrade                    |
| Provider impersonation     | otro proceso se presenta como Codex               | ruta/ACL/digest/schema/client handshake; provenance del proceso                                                    | fixture de servidor falso               |
| Version skew               | schema generado y proceso no coinciden            | mismo ejecutable canónico para version/schema/spawn; rehash en cada transición                                     | test de dos binarios                    |
| Auth-state confusion       | señal stale habilita ejecución                    | `account/updated` solo invalida cache; reread antes de dispatch; gate separado de auth                             | tests de logout/cambio workspace        |
| Shared-session mutation    | logout/config afecta otros clientes Codex         | no modificar login/logout/config en ejecución; acciones de cuenta separadas y confirmadas                          | test con sesión compartida              |
| Sensitive provenance       | logs revelan prompt/cuenta/ruta                   | solo digests y metadatos mínimos; redacción de perfil; retención según modo privado                                | inspección de export/audit              |

## Controles fail-closed

El provider permanece `unavailable` cuando falta cualquiera de estos datos:

- attestation técnica, contractual y legal vigente;
- digest confiable de attestation en el release;
- versión y fingerprint permitidos;
- schema estable esperado;
- estado de autenticación compatible;
- health handshake completo;
- capability exacta publicada;
- consentimiento del usuario y modo privado desactivado.

Un error desconocido, evento desconocido que implique efecto, mismatch de ID,
salida excedida, timeout o cambio del binario cancela la operación, destruye el
proceso y marca la observación como `unhealthy`. Nunca cae a ejecución sin
schema, transporte WebSocket ni API key.

## Riesgo residual no aceptado

Aunque el proceso sea oficial, corre con identidad del usuario y puede acceder a
recursos que su sandbox/configuración permita. El aislamiento text-only debe
probarse, no inferirse. La ausencia de recovery idempotente y la autorización
contractual para Plus/Pro mantienen este threat model en estado previo y
prohíben habilitar el adapter.
