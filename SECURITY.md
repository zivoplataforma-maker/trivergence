# Security Policy

Security is a core design constraint in Trivergence because an orchestrator may
eventually coordinate access to local files, processes, tools and remote AI
providers.

Trivergence is currently **pre-1.0**. The project should not yet be treated as a
production authorization boundary for high-value or sensitive workloads.

## Reporting a vulnerability

Please **do not open a public issue** containing credentials, secrets, personal
data, a working exploit, or enough detail to make an unpatched vulnerability
immediately exploitable.

If GitHub's private vulnerability reporting option is available for this
repository, use it. Otherwise, contact the maintainer privately before sharing
sensitive reproduction material. A dedicated public security contact may be
added as the project matures.

When reporting, include only what is necessary to reproduce and understand the
issue: affected component/version, impact, prerequisites, reproduction steps and
any suggested mitigation. Redact credentials and unrelated personal information.

## Priority security boundaries

High-priority classes include:

- workspace escape or path-boundary bypass;
- command or argument injection;
- approval or policy bypass;
- renderer-to-host privilege escalation;
- secret, token or credential leakage;
- unsafe persistence or orphaned process execution;
- provider-authentication boundary violations;
- model/provider substitution, hidden fallback or routing to an unauthorized
  destination;
- tool/capability confusion where availability is mistaken for permission;
- cross-agent context leakage during delegated or parallel work;
- proposal/critique poisoning where one AI output attempts to become a governing
  instruction for another participant;
- false consensus caused by counting multiple routes to the same model as
  independent evidence;
- deliberation budget amplification, recursive delegation or unbounded critique
  loops;
- evaluator manipulation, fabricated citations/evidence or consensus used to
  bypass Policy/Approval;
- update, packaging and software-supply-chain compromise;
- audit/provenance tampering that could hide what executed.

## Security principles

Trivergence aims to fail closed when trust or authorization cannot be
established. Provider detection does not imply execution authorization.
Privileged operations should be explicit, attributable, cancellable where
practical and protected by policy/approval boundaries. Automatic model/provider
selection, delegation, fallback and tool resolution remain inside the same trust
model and may optimize only among compatible, available, gate-authorized routes
allowed by current policy and user constraints.

Future Strategy Deliberation must treat every proposal, critique and synthesized
candidate as untrusted data. No participant can grant itself or another
participant authority, approvals or capabilities. Majority agreement does not
establish truth or permission. Context slices disclose only the minimum sources
needed, and deliberation is bounded by participant, round, call, token/byte,
cost and wall-time budgets.

The project does not intentionally scrape browser sessions, extract provider
cookies or OAuth tokens, impersonate official clients, or bypass provider
quotas, payment controls or contractual restrictions.

## Supported versions

There is no stable production release yet. Security fixes currently target the
active development branch and the latest maintained code. This policy will be
updated with explicit supported-version ranges before stable releases are
distributed.

## Disclosure expectations

Please allow reasonable time for triage and remediation before public
disclosure. There is currently no bug-bounty program and no guaranteed response
SLA.

For architecture-level security context, read the
[threat model](docs/security/threat-model.md). File, persistence, installer and
update hardening are covered by the
[M7 threat model](docs/security/threat-model-m7.md). The accepted but not yet
implemented deliberation design has its own
[P3-B2 threat model](docs/security/threat-model-p3-b2.md).
