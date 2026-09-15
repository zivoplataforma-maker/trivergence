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
- update, packaging and software-supply-chain compromise;
- audit/provenance tampering that could hide what executed.

## Security principles

Trivergence aims to fail closed when trust or authorization cannot be
established. Provider detection does not imply execution authorization.
Privileged operations should be explicit, attributable, cancellable where
practical and protected by policy/approval boundaries.

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
[M7 threat model](docs/security/threat-model-m7.md).
