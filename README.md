<div align="center">

# TRIVERGENCE

### One objective. Many capabilities. One orchestrated path.

**An open-source, local-first AI engineering orchestrator for Windows.**

Trivergence is being built so you can describe **what you want to achieve** while the system determines how agents, tools, memory, workflows and approved AI providers should work together — with policy, human approval, evaluation and evidence around execution.

**Not another IDE. Not another model. The orchestration layer between your objective and the AI ecosystem.**

[Architecture](docs/architecture/overview.md) · [Roadmap](ROADMAP.md) · [Implementation status](IMPLEMENTATION_STATUS.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

![Status](https://img.shields.io/badge/status-active%20development-6f42c1) ![Platform](https://img.shields.io/badge/platform-Windows-0078D4) ![License](https://img.shields.io/badge/license-Apache--2.0-blue) ![Providers](https://img.shields.io/badge/external%20providers-gated-orange)

</div>

---

## From objective to coordinated execution

AI systems are becoming more capable — and more fragmented.

Models specialize. Agents expose different tools. CLIs have different permissions. Workflows need different levels of autonomy. Memory, context, cost, privacy and reliability all matter. The person using them is often forced to decide which system should do what, move context between them and verify the result manually.

**Trivergence is building the coordination layer.**

You start with an objective. Trivergence analyzes the capabilities available to it, compares viable routes, creates an explicit plan, applies policy and approval gates, coordinates execution, evaluates the outcome and preserves evidence of what happened.

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

A provider is a capability behind the orchestration boundary — **not the center of the product**. Models, tools and providers should be replaceable without redesigning Trivergence.

## Built around orchestration, not provider switching

Trivergence is not trying to put several chat windows behind one interface. Its goal is to make coordination itself a first-class engineering problem: strategy, planning, capability discovery, permissions, execution, evaluation, recovery and provenance.

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

## Product preview

> **Screenshots are coming next.** The desktop application and Mission Control interface already exist; we are preparing a small set of current screenshots rather than publishing mockups that could misrepresent the product.

The visual experience is designed around the objective and the execution state, with technical detail available when it matters instead of turning the product into another code editor.

<!--
Future screenshot layout (replace with real captures only):

<p align="center">
  <img src="docs/assets/screenshots/mission-control.png" alt="Trivergence Mission Control" width="900" />
</p>

Suggested additional captures:
- objective-to-plan.png
- execution-and-approvals.png
- providers-and-trust.png
- history-and-evidence.png
-->

## What exists today

Trivergence is **real software under active development**, but it is not yet a finished multi-AI product.

The current local build includes objective-first route selection, Strategy and Planning, Policy and Evaluation engines, an isolated Electron desktop application, workspace capabilities, a centralized provider-adapter boundary, streaming and cancellation, budgets, typed errors, approvals, recovery, workspace-scoped memory, provenance, audit evidence and a deterministic local Reference Provider used to exercise the orchestration path.

The Windows quality pipeline covers formatting, linting, types, tests, build, Electron E2E, smoke testing and security/SBOM checks. For reproducible milestone evidence, see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

### Deliberately not claimed yet

- **No external AI provider is currently enabled for execution.**
- Codex, Claude and Gemini remain behind technical and contractual trust gates.
- The Reference Provider is a local conformance harness, not an external AI service.
- The Windows installer is not yet a signed production release.
- M5 (external providers) and M7 (distribution hardening) remain `PARTIAL`.

We would rather show a smaller truthful product than advertise integrations that have not passed their gates.

## The experience we are building

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

Trivergence does **not** scrape browser sessions, extract cookies or tokens, impersonate official clients, or treat a chat subscription as generic API access. The preferred path is an official authentication or integration mechanism whose technical and contractual use is appropriate for a third-party orchestrator.

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

## Independent by design

Trivergence is an independent project. It is not affiliated with, sponsored by or endorsed by OpenAI, Anthropic or Google. Product names and trademarks belong to their respective owners.

External tools and providers retain their own installation, authentication, update mechanisms, terms and limits. Trivergence's architecture is designed to integrate capabilities through explicit adapters and trust gates rather than assume ownership of those systems.

## License

Original Trivergence code is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) and [third-party notices](THIRD_PARTY_NOTICES.md).

---

<div align="center">

### The AI ecosystem should feel like one coordinated system — without becoming a black box.

**If that future interests you, explore the architecture, challenge the assumptions and help us build Trivergence.**

[Read the roadmap](ROADMAP.md) · [Start contributing](CONTRIBUTING.md)

</div>
