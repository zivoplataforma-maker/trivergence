# Preguntas abiertas para OpenAI — Codex App Server

Fecha: 2026-09-15  
Estado: pendientes de respuesta oficial  
Contexto: Trivergence es una aplicación desktop open-source de terceros y un
orquestador multi-IA; no es un IDE, un modelo ni un revendedor de cuentas.

Una respuesta debe ser citable y provenir de OpenAI. El silencio no concede
autorización.

## Contractual y cuentas

1. Can a third-party open-source desktop application invoke a locally installed
   Codex App Server authenticated through the user's ChatGPT Plus or Pro
   account, without handling, copying, or redistributing OpenAI credentials?
2. Does consuming documented App Server turn and streaming events in that
   application constitute prohibited automatic or programmatic extraction of
   Output under the individual Terms of Use?
3. Does the App Server documentation headed “Embed Codex into your product”
   authorize this use for personal ChatGPT subscriptions, or only describe a
   technical interface subject to a separate agreement or approval?
4. Is user-attended orchestration by a local third-party application permitted
   for Plus and Pro? Which distinction does OpenAI make between an interactive
   client, automation, and unattended execution?
5. Must the third-party application, its distributor, or each user enter an
   additional developer/business agreement with OpenAI?
6. Is a multi-provider orchestrator considered resale, sublicensing, account
   sharing, a competing product, or otherwise restricted when each user signs in
   to their own account through Codex-managed OAuth?
7. Are Free, Go, Business, Enterprise or Edu governed differently for this exact
   embedding use case? Please identify the applicable terms per plan.

## Identidad, autenticación y privacidad

8. May an unregistered third-party client use its own truthful
   `clientInfo.name`, or must OpenAI first add that name to a known-client list?
9. Is known-client registration mandatory only for enterprise compliance logs,
   or for all production App Server integrations?
10. May the client initiate `account/login/start` with `chatgpt` or
    `chatgptDeviceCode`, open/display the returned official URL/code, and
    observe completion without becoming an OAuth client or credential processor?
11. Is `account/read` designed for third-party clients, and which returned
    fields are safe to persist for diagnostics? Trivergence proposes persisting
    none of the account identity fields.
12. Are there required privacy disclosures, data-controller roles, security
    reviews or branding rules for a client that sends user-selected context to
    Codex through App Server?

## Protocolo y compatibilidad

13. Which App Server methods and fields are covered by a backward-compatibility
    commitment, and for how long?
14. Is there an official protocol-version negotiation mechanism beyond matching
    the installed CLI version with its generated stable JSON Schema?
15. Is there a supported method to attest the running executable/version to a
    local client, or should the client verify the installed binary
    independently?
16. Is `stdio` a supported production transport for a local third-party desktop
    client? Does the statement that “the app-server command and WebSocket
    transport are experimental” apply to the complete command, including the
    default `stdio` transport, and what milestone would make it
    production-ready?
17. What is the supported shutdown sequence for an App Server child process, and
    what grace period should a client use after `turn/interrupt` before forceful
    termination?

## Recovery, budgets y efectos

18. Is there an idempotent way to resume or replay an interrupted turn from a
    client checkpoint without duplicating model output, tool calls, or effects?
19. Does `thread/resume` only restore conversation state for a new turn, or can
    it resume the exact interrupted turn from an output cursor?
20. Can a client guarantee a tool-free/text-only turn using the stable API?
    Which stable settings should it use to prevent command, file, network, MCP,
    app and dynamic-tool execution rather than merely declining approvals after
    request?
21. Which usage/rate-limit fields are stable for ChatGPT subscription sessions?
    Can they support a hard per-turn budget, or only post-hoc reporting?
22. When output/time limits cause `turn/interrupt`, can notifications or side
    effects arrive after the interruption acknowledgment, and what event is the
    authoritative terminal barrier?

## Distribución y soporte

23. May Trivergence detect and spawn a separately installed official Codex CLI
    without redistributing it? Are there supported canonical installation paths
    on Windows?
24. If Trivergence never bundles Codex, which trademark attribution or
    disclaimer is required when presenting “Codex / OpenAI” as a disabled
    optional provider?
25. Is there an official release signature, signed manifest or other provenance
    mechanism that a Windows desktop client can verify in addition to version
    and a locally computed SHA-256 digest?
26. Which support/security notification channel should an integrator monitor for
    breaking App Server, authentication or terms changes?

## Respuesta mínima que desbloquea M5-A

M5-A requiere como mínimo respuestas inequívocas a 1–4, 8–10, 13–20 y 23. Una
respuesta positiva contractual no aprobará por sí sola el proveedor: todavía se
necesitan revisión legal, spike aislado, 14/14 de conformidad y attestation de
release.
