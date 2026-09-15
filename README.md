<div align="center">

# TRIVERGENCE

### One objective. Many capabilities. One orchestrated path.

**An open-source, local-first AI engineering orchestrator for Windows.**

Trivergence is being built so people can describe **what they want to achieve** while the system decides how agents, tools, memory, workflows and approved AI providers should work together — with policy, human approval, evaluation and evidence around every execution.

**Not another IDE. Not another model. The orchestration layer between your objective and the AI ecosystem.**

[Architecture](docs/architecture/overview.md) · [Roadmap](ROADMAP.md) · [Implementation status](IMPLEMENTATION_STATUS.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![Status](https://img.shields.io/badge/status-active%20development-6f42c1) ![Platform](https://img.shields.io/badge/platform-Windows-0078D4) ![License](https://img.shields.io/badge/license-Apache--2.0-blue) ![Providers](https://img.shields.io/badge/external%20providers-gated-orange)

</div>

---

## The idea

The AI ecosystem is becoming more capable — and more fragmented.

Different models are good at different things. Agents have different tools. CLIs have different permissions. Workflows need different levels of autonomy. Memory, context, cost, privacy and reliability all matter. Today, the human is often forced to act as the orchestration layer.

**Trivergence wants to change that.**

You start with an objective. Trivergence analyzes the available capabilities, compares possible routes, creates an explicit plan, applies policy and approval gates, coordinates execution, evaluates the result and preserves evidence of what happened.

```text
                         YOUR OBJECTIVE
                               │
                               ▼
                    ┌─────────────────────┐
                    │  STRATEGY ENGINE    │
                    │ compare viable paths│
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ EXECUTION PLANNER   │
                    │ explicit steps      │
                    └──────────┬──────────┘
                               │
                    Policy ────┼──── Human approval
                               │
                               ▼
              ┌────────────────────────────────┐
              │       ORCHESTRATION RUNTIME    │
              ├────────┬────────┬───────┬───────┤
              │ Agents │ Tools  │Memory │Flows  │
              └────────┴────────┴───────┴───┬───┘
                                            │
                         Approved providers ┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ EVALUATION ENGINE   │
                    │ verify the outcome  │
                    └──────────┬──────────┘
                               │
                               ▼
                  RESULT + PROVENANCE + AUDIT
```

The provider is a capability behind the orchestration boundary — **not the center of the product**. Models and providers should be replaceable without redesigning Trivergence.

## Why Trivergence?

Projects such as OpenHands demonstrate the power of capable software agents; agent frameworks demonstrate collaborative and stateful workflows; research from Sakana AI explores collective and evolutionary intelligence. Trivergence takes inspiration from this broader movement while focusing on a different layer: **coordinating heterogeneous capabilities around a user objective with explicit control and evidence.**

The design is guided by seven principles:

| Principle | What it means |
| --- | --- |
| **Objective-first** | Start from the outcome the user wants, not from a provider selector. |
| **Provider-agnostic** | No model, vendor or agent should be architecturally indispensable. |
| **Local-first** | Core state, orchestration and control stay local whenever possible. |
| **Human-governed** | Privileged actions are previewable, attributable and approval-aware. |
| **Fail-closed** | Missing trust or ambiguous permission blocks execution instead of weakening controls. |
| **Evidence-driven** | Decisions and outcomes can be inspected without storing private chain-of-thought. |
| **Composable** | Agents, workflows, memory, tools and providers meet behind stable contracts. |

## What exists today

Trivergence is **real software under active development**, but it is not yet a finished multi-AI product.

The current local build includes goal-first route selection, Strategy and Planning, Policy and Evaluation engines, an isolated Electron desktop application, workspace capabilities, a centralized provider-adapter boundary, streaming and cancellation, budgets, typed errors, approvals, recovery, workspace-scoped memory, provenance, audit evidence and a deterministic local Reference Provider used to exercise the orchestration path.

The Windows quality pipeline covers formatting, linting, types, tests, build, Electron E2E, smoke testing and security/SBOM checks. For reproducible milestone evidence, see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

### Deliberately not claimed yet

- **No external AI provider is currently enabled for execution.**
- Codex, Claude and Gemini remain behind technical/contractual trust gates.
- The Reference Provider is a local conformance harness, not an external AI service.
- The Windows installer is not yet a signed production release.
- M5 (external providers) and M7 (distribution hardening) remain `PARTIAL`.

We would rather show a smaller truthful product than advertise integrations that have not passed their gates.

## The long-term experience

The intended interaction is closer to **Mission Control** than to an IDE.

Instead of opening a model and figuring out how to divide the work yourself, you tell Trivergence what you want to accomplish. The system should be able to reason about complexity, capabilities, privacy, budget and risk; assemble an execution strategy; coordinate specialized participants; request your approval when needed; recover from failure; and return a synthesized result with enough provenance to understand what happened.

```text
"Build / analyze / research / fix this"
                  │
                  ▼
       Trivergence decides HOW
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
    Agent A    Agent B     Tool / Flow
       │          │          │
       └──────────┼──────────┘
                  ▼
          Evaluate & recover
                  ▼
             One result
```

## Architecture

```text
Trivergence
├── Orchestration Engine
│   ├── Strategy Engine
│   ├── Execution Planner
│   ├── Capability Registry
│   ├── Policy Engine
│   └── Evaluation Engine
├── Runtime
├── Adapter Host / Provider Adapters
├── Agent + Workflow layer
├── Memory + Persistence
├── Workspace capabilities
├── Approval + Audit + Provenance
└── Electron Desktop UI
```

Start with the [architecture overview](docs/architecture/overview.md), then explore the [Orchestration Engine](docs/architecture/orchestration-engine.md), [runtime and approvals](docs/architecture/runtime-and-approvals.md), [provider adapters](docs/architecture/provider-adapters.md), [Reference Provider contract](docs/architecture/reference-provider-contract.md), and [workflows, agents and memory](docs/architecture/workflows-agents-memory.md).

## Provider trust model

Provider integration is intentionally conservative.

Trivergence does **not** scrape browser sessions, extract cookies or tokens, impersonate official clients, or treat a chat subscription as generic API access. The preferred path is an official authentication/integration mechanism whose technical and contractual use is appropriate for a third-party orchestrator.

Installed, authenticated, gate-authorized and enabled are separate states. A provider can therefore be visible to the system without being allowed to execute. Today, only the local Reference Provider is executable.

See the [provider comparison](docs/providers/comparison-2026-08-07.md) and [gate methodology](docs/providers/gate-methodology.md).

## Quick start — contributors

> The verified development target is currently **Windows 11 + Node.js 24 + pnpm 11**.

```powershell
git clone https://github.com/zivoplataforma-maker/trivergence.git
cd trivergence
pnpm install --frozen-lockfile
pnpm check:fresh
pnpm e2e:desktop
pnpm smoke:desktop
pnpm --filter @trivergence/desktop start
```

`check:fresh` runs formatting, linting, type checks, unit tests and build without relying on Turbo cache. Electron E2E and smoke tests require an environment capable of launching Electron.

For setup details, read [Windows development](docs/contributing/windows-development.md).

## Help build it

Trivergence is opening its engineering process to the community. You do not need to redesign the project to make a useful contribution.

We especially welcome focused help with Windows testing, accessibility, architecture review, threat modeling, critical-path test coverage, documentation, provider-gate research based on official sources, reproducibility and small well-scoped fixes.

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md). For vulnerabilities or sensitive security findings, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Roadmap

The near-term path is intentionally disciplined:

1. strengthen the local orchestration core and Mission Control experience;
2. finish visible recovery, privacy, history and audit workflows;
3. integrate the first external provider only after its gate is satisfied;
4. validate a second independent provider before presenting Trivergence as a working multi-AI orchestrator;
5. complete signed, clean-machine Windows distribution gates.

Broader ideas — plugins, SDKs, automation, collaboration, specialized agents and enterprise capabilities — remain part of the longer horizon, not promises of current functionality. Follow the evidence-based [ROADMAP.md](ROADMAP.md).

## Security & privacy

Orchestration software eventually touches sensitive boundaries: files, processes, credentials, remote providers and user intent. Trivergence treats security and privacy as architecture, not polish.

The project uses explicit policy, approval boundaries, bounded execution, local persistence controls, provenance and fail-closed trust gates. It is still pre-1.0 and should **not** be treated as a production authorization boundary for high-value data.

Read [SECURITY.md](SECURITY.md), the [threat model](docs/security/threat-model.md) and [privacy documentation](docs/privacy.md).

## Inspiration & independence

Trivergence has been influenced by the broader open-source agent ecosystem and research into software agents, local AI workspaces and collective intelligence. That inspiration informs the problem we are exploring; it does not make Trivergence a fork or wrapper of those projects.

Trivergence is **not affiliated with or endorsed by OpenAI, Anthropic, Google, OpenHands, Sakana AI or Odysseus**. Product names and trademarks belong to their respective owners.

## License

Original Trivergence code is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) and [third-party notices](THIRD_PARTY_NOTICES.md).

---

<div align="center">

### The AI ecosystem should feel like one coordinated system — without becoming a black box.

**If that future interests you, explore the architecture, challenge the assumptions and help us build Trivergence.**

[Read the roadmap](ROADMAP.md) · [Start contributing](CONTRIBUTING.md)

</div>
