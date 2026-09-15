# Preguntas abiertas para Anthropic — Claude Code y Claude Platform

Fecha: 2026-09-15  
Estado: pendientes de respuesta oficial  
Contexto: Trivergence es una aplicación desktop open-source y un orquestador
multi-IA. No intermedia pagos, cuentas o credenciales.

Una respuesta debe ser citable y provenir de Anthropic. El silencio no concede
autorización.

## Claude Code en un producto de terceros

1. Does the permission to run the published, unmodified Claude Code binary in a
   product expressly cover a desktop orchestrator spawning `claude -p` as a
   subprocess to obtain model output?
2. Is that use permitted when the end user signs in inside Claude Code with
   their own Pro, Max, Team, or Enterprise subscription and Trivergence never
   accesses or intermediates credentials or usage?
3. Does starting Claude Code's own login UI count as impermissibly “offering
   Claude.ai login” under the Agent SDK restriction, or is it permitted by the
   separate rule for running the unmodified binary in products?
4. Does presenting Claude beside other providers in a provider-agnostic
   orchestrator make the product competing, resale, or intermediation under the
   Commercial Terms?
5. Is prior approval or a partner agreement required for this exact open-source,
   local, BYO-account architecture?
6. Which agreement governs each route: Consumer Terms for Pro/Max, Commercial
   Terms for Team/Enterprise, and Commercial Terms for Console?
7. May Trivergence accurately label the disabled option “Claude” or “Claude Code
   (external)” without implying endorsement?

## Autenticación y aislamiento

8. May Trivergence launch `claude auth login` while the official binary owns the
   browser flow, callback, token storage, refresh, and logout?
9. Is `claude auth status` a supported machine-readable preflight for a
   third-party launcher, and which fields can be suppressed to avoid exposing
   email, organization, paths, or credential type?
10. Is there a supported way to bind a dedicated login to Trivergence without
    reading, copying, exporting, or inspecting Claude Code credential files?
11. Can a third-party launcher remove API key, auth token, base URL, cloud
    provider, and proxy variables from the child environment to prevent account
    confusion without violating the requirement not to restrict authentication
    methods built into Claude Code?
12. Is the combination `--safe-mode --restricted --tools ""`
    `--disallowedTools "*" --permission-prompts none` supported with
    subscription OAuth in non-interactive mode?
13. Does that combination guarantee that hooks, plugins, skills, MCP, subagents,
    web, commands, file access and persisted approvals cannot execute?

## Protocolo, lifecycle y recuperación

14. Is the `stream-json` event schema versioned, and what compatibility policy
    applies to new message types, enum values, fields, and error shapes?
15. What is the supported graceful cancellation mechanism for `claude -p` on
    Windows, where POSIX SIGINT/SIGTERM semantics are not directly available?
16. After cancellation, what terminal event proves no more output, tools, remote
    processing, or usage can occur?
17. Can the exact in-progress turn be resumed idempotently after crash or
    transport loss, rather than starting a new turn in the same session?
18. If not, is there a canonical final-result lookup by session ID and turn ID
    that cannot create duplicate inference or usage?
19. Can automatic retries and model fallback be disabled completely and verified
    in the event stream?
20. Is there a stable preflight signal for remaining plan usage, context tokens,
    and an enforceable per-run output limit?

## Distribución, versiones y costes

21. May Trivergence require an independently installed official Claude Code
    binary, resolve its canonical path, verify version/digest, and launch it
    without redistributing it?
22. Which Windows installation artifact provides a verifiable publisher,
    signature, checksum, release identity, and supported version lifecycle?
23. Can auto-update be disabled or pinned so a tested version remains unchanged
    until Trivergence validates a new conformance attestation?
24. Please confirm the current commercial rule: `claude -p` and third-party app
    use draw from the user's subscription limits while the announced separate
    monthly Agent SDK credit remains paused.
25. What limits, fair-use constraints, or production restrictions apply to
    repeated provider calls from a local orchestrator?
26. Which data retention, training, regional, DPA, and organization policies
    apply to Pro/Max versus Team/Enterprise use launched by a third-party app?

## Alternativa Claude Platform mediante `ant`

27. May a third-party desktop app spawn a separately installed `ant` CLI with a
    Console OAuth profile owned by the user, without reading its credentials?
28. Does `ant messages create` expose a stable incremental JSONL stream, Windows
    cancellation contract, and idempotent recovery primitive?
29. Does BYO Console avoid resale/intermediation when the user owns the
    workspace and pays Anthropic directly?
30. May the distributor require external installation and verify the official
    `ant` release without redistributing it?

## Respuesta mínima que desbloquea M5-A2

Se requieren respuestas inequívocas a 1–6, 8–20 y 21–25. Incluso con respuestas
positivas, M5-A2 exige revisión legal, spike aislado, 14/14 de conformidad y
attestation de release. La alternativa Platform requiere además 27–30 y una
decisión explícita de producto sobre billing API separado.
