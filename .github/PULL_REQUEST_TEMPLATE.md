## What does this change?

Describe the problem and the focused change that solves it.

## Why this approach?

Explain important design choices and alternatives considered.

## Verification

List the checks you actually ran. Do not mark checks that were not executed.

- [ ] `pnpm check:fresh`
- [ ] Relevant unit/integration tests
- [ ] `pnpm e2e:desktop` when UI/runtime behavior changes
- [ ] `pnpm smoke:desktop` when desktop startup/packaging behavior changes
- [ ] Documentation updated when contracts or behavior changed

## Trust, security & privacy

- Does this change permissions, workspace access, process execution,
  persistence, credentials, provider authentication or external communication?
- Does it change an approval or policy boundary?
- Does it add or alter a provider capability? If yes, link the official-source
  gate evidence.

Write `None` if there is no material impact.

## Evidence / screenshots

Add useful evidence for behavior or UI changes. Redact private information and
credentials.

## Remaining limitations

State known limitations, follow-up work or intentionally unsupported cases.
