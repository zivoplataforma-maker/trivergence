# Threat model — Google/Gemini provider gate

Estado: diseño preventivo; ningún provider Google habilitado  
Fecha: 2026-09-15

## Alcance y activos

Alternativas evaluadas: Gemini CLI, Gemini Code Assist, Gemini Developer API y
Vertex AI. La candidata principal es Vertex AI mediante SDK/REST oficial, ADC e
IAM sobre el proyecto del usuario. Este documento no autoriza implementación.

Activos: contraseña/cuenta Google, refresh/access tokens, archivos ADC,
configuraciones WIF, project/quota/billing IDs, prompts y contexto, outputs,
workspace, approvals, budgets, audit/provenance, interaction/job IDs y binarios
o dependencias oficiales.

Fronteras:

1. UI no confiable → IPC validado → Orchestration Engine.
2. Engine/Runtime → futuro adapter host aislado.
3. Adapter host → biblioteca Google Auth/ADC o OAuth propio.
4. Adapter host → endpoints oficiales allowlisted de Google.
5. Output no confiable → parser/límites → Evaluation/Runtime.

## Amenazas y mitigaciones obligatorias

| Amenaza                                  | Escenario                                                     | Mitigación antes de cualquier spike                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth interception                       | Otro proceso captura callback/código                          | navegador del sistema, PKCE S256, loopback aleatorio, `state`, listener de un uso, timeout y redirect exacto                             |
| Token leakage                            | Refresh/access token llega a logs, audit, crash dump o UI     | nunca serializar headers/ADC, redacción por tipo, process isolation, vault del SO si hay OAuth propio, tests canary                      |
| Credential-store abuse                   | Trivergence o plugin lee caches de CLI/Code Assist/gcloud     | prohibir lectura directa; solo Google Auth/ADC documentado tras ADR; ACL y path provenance; no import automático                         |
| ADC substitution                         | Archivo/config externa maliciosa cambia issuer/token endpoint | no aceptar path/config arbitrario; validar tipo, issuer/audience/STS allowlist según guía Google; symlink/reparse checks                 |
| Account/project confusion                | Usuario A autentica y se factura proyecto B                   | bind atómico de principal fingerprint + resource project + quota project + región; preview y revalidación por ejecución                  |
| IAM escalation                           | Se piden roles amplios o se usa owner/editor                  | rol mínimo Vertex AI User o custom; negar service account keys; mostrar permisos efectivos; admin consent cuando aplique                 |
| Confused deputy                          | Proyecto de Trivergence paga requests de terceros             | BYO-project obligatorio; sin proxy común; comprobar quota/billing project y rechazar mismatch                                            |
| Billing/quota abuse                      | Prompt loop, retry o tool injection genera gasto              | budgets duros locales, max output, call cap, rate limiter, no retry tras estado incierto, estimación y reconciliación de usage           |
| OAuth/client impersonation               | Build falso usa client ID/nombre de Trivergence               | OAuth verification/branding, firma de release, PKCE, update firmado, revocación y Cross-Account Protection si aplica                     |
| Malicious CLI/binary replacement         | `gemini`/`gcloud` en PATH fue sustituido                      | no usar Gemini CLI; para gcloud bootstrap externo, canonical path, publisher/signature/version fingerprint, sin shell                    |
| Provider impersonation/MITM              | Endpoint/proxy devuelve stream falso                          | HTTPS, allowlist exacta, CA del sistema, no endpoint override en producción, record de host/API revision                                 |
| SDK/dependency compromise                | Paquete `@google/genai` o auth alterado                       | versión/digest lock, provenance/SBOM/notices, revisión de install scripts, vulnerability scan y actualización controlada                 |
| Downgrade/update substitution            | SDK/API preview reduce garantías                              | baseline GA, version/revision pin, capability fingerprint, fail-closed ante cambio, no auto-enable                                       |
| Malicious provider output                | Modelo inyecta comandos/rutas/aprobaciones                    | output es datos no confiables; schema/límites; tools solo propuestas; Runtime/Policy conserva autoridad                                  |
| Prompt/tool injection                    | Contexto solicita exfiltrar o saltar approval                 | egress preview, source labels, deny hidden tools, approval ligada a plan/step/hash y nueva aprobación tras cambio                        |
| Approval bypass                          | Function call se ejecuta en SDK automáticamente               | automatic function calling deshabilitado; tool call retorna al Planner/Policy; capability allowlist cerrada                              |
| Workspace escape                         | Tool/code execution accede fuera del workspace                | ninguna tool Google en baseline; canonicalización, snapshots y sandbox local si se reabre una capability                                 |
| Oversized/malformed stream               | SSE/JSON agota memoria o parser                               | límites por evento/total/tiempo, backpressure, parser incremental estricto, depth/string caps y error tipado                             |
| Cancellation failure                     | Abort local deja trabajo/costo remoto                         | preferir operación identificable; confirmar cancel remoto; estado `cancel_requested` hasta terminal; no afirmar cancelado sin evidencia  |
| Orphan process/request                   | Desktop cae con interacción/job activa                        | journal content-free con provider/operation ID; reconciliación al reiniciar; no re-prompt automático                                     |
| Replay/duplicate billing                 | Timeout provoca request duplicada                             | IDs/idempotency oficiales solamente; si no existen, estado `outcome_unknown`, recuperación o intervención humana                         |
| Recovery confusion                       | Historial previo se presenta como mismo turn                  | distinguir continuation de exact recovery; comprobar immutable request fingerprint y operation/interaction ID                            |
| Session/retention leak                   | `store=true` conserva contenido inesperado                    | preview de retención, consentimiento, project policy, delete verificable; privado usa stateless y renuncia a recovery si es incompatible |
| Cross-tenant leakage                     | Cache/session compartida entre workspaces/cuentas             | namespaces por provider/principal/project/workspace; nunca reutilizar `previous_interaction_id` fuera del binding                        |
| Privilege escalation by grounding/agents | Servicios remotos ganan red/tools                             | grounding, code execution, managed agents y remote tools ausentes del baseline y del capability registry                                 |

## Decisiones fail-closed

- No Gemini CLI/Code Assist OAuth, cookies, tokens o credential stores.
- No service account key, API key en UI ni secrets en configuración/audit.
- No SDK automatic function calling.
- No endpoint configurable fuera de allowlist de desarrollo aislado.
- No reintento de inferencia tras resultado incierto sin idempotencia
  verificable.
- No marcar `cancelled` hasta confirmación remota o cierre documentado.
- No conservar interaction ID recuperable sin informar la retención servidor.
- No habilitar una capability por detectar instalación/auth; gate, attestation y
  trust store continúan siendo condiciones separadas.

## Riesgo residual por ruta

| Ruta                    | Riesgo residual                                                          | Resultado                                             |
| ----------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| Gemini CLI login Google | prohibición contractual y boundary de OAuth                              | no mitigable técnicamente: `REJECTED`                 |
| Code Assist             | no existe provider API y redistribución restringida                      | no mitigable: `REJECTED`                              |
| Gemini API              | key/auth key, retención y billing; recovery sí existe en background      | mitigable con gate futuro, pero fuera de UX principal |
| Vertex AI + ADC         | refresh credential accesible al proceso, IAM/billing y recovery faltante | `UNRESOLVED` hasta respuesta/ADR                      |

## Tests mínimos de un futuro spike autorizado

Además de las 14 comprobaciones existentes: PKCE/state interception, ADC
substitution, account/project/quota mismatch, token canary en logs/crashes,
permission denial, quota/budget exhaustion, stream bombs, process crash y exact
reconnect, remote cancel reconciliation, duplicate-charge ambiguity, model/API
downgrade, dependency tampering y delete/retention verification.
