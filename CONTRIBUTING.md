# Contributing to Trivergence

Thank you for considering a contribution to Trivergence.

Trivergence is an early-stage open-source AI engineering orchestrator. The architecture is deliberately strict around provider trust, permissions, evidence and reproducibility, so focused and well-tested contributions are more valuable than large speculative feature additions.

## Where help is most useful

Good first areas include documentation, Windows compatibility testing, accessibility, test coverage, small bug fixes, reproducibility, threat-model review and provider research based on official sources.

Before starting a large implementation, open an issue describing the problem and proposed direction. This helps avoid parallel work or changes that conflict with an architectural gate.

## Engineering rules

- Start from a documented requirement or clearly described problem.
- Never include real credentials, tokens, cookies, private data or secrets in fixtures, logs, screenshots or commits.
- Never widen permissions simply to make a test pass.
- New tools must define their schema, risk level, timeout, cancellation behavior, evidence/logging and tests.
- Provider capabilities must document source, date, supported version range, authentication assumptions and degradation behavior.
- Provider installation, authentication, gate authorization and execution enablement remain separate states.
- Incomplete functionality must be visibly incomplete; do not hide it behind a convincing UI state.
- Significant architecture changes require an ADR or prior maintainer discussion.
- Do not introduce browser-session scraping, cookie/token extraction, client impersonation or mechanisms intended to bypass provider terms, quotas or payment controls.
- Preserve the provider-agnostic boundary. A provider-specific shortcut must not leak into the orchestration core without a documented architectural reason.

## Development environment

The currently verified development target is Windows 11, Node.js 24 and pnpm 11.

```powershell
pnpm install --frozen-lockfile
pnpm check:fresh
pnpm e2e:desktop
pnpm smoke:desktop
```

See [Windows development](docs/contributing/windows-development.md) for the full setup.

## Before opening a pull request

Keep the change focused. Update documentation when behavior or contracts change. Add or update tests for behavioral changes. Run the applicable quality gates locally and do not claim a check passed if it was not executed.

A useful pull request explains:

1. the problem being solved;
2. the chosen approach and important alternatives;
3. security, privacy or provider-trust implications;
4. how the change was tested;
5. remaining limitations or follow-up work.

## Commit and PR scope

Prefer small, reviewable commits and pull requests. Avoid unrelated formatting churn, generated artifacts, local preferences, credentials, build outputs or dependency directories.

For architectural changes, link the relevant ADR or discussion. For provider work, link the gate evidence and official source used to justify the capability.

## Security reports

Do not disclose exploitable vulnerabilities, credentials, personal data or sensitive reproduction material in a public issue. Follow [SECURITY.md](SECURITY.md).

## Project status and expectations

Trivergence is pre-1.0. Interfaces may evolve and some milestones are intentionally gated. The public [implementation status](IMPLEMENTATION_STATUS.md) is the source of truth for what has actually been verified; the [roadmap](ROADMAP.md) describes direction rather than a guarantee of delivery.

## License

By contributing, you agree that your contribution may be distributed under the project's [Apache License 2.0](LICENSE), unless explicitly stated otherwise for material that cannot legally be contributed under those terms.

For release-specific procedures, see [releasing](docs/contributing/releasing.md).
