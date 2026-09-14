# Third-party notices

Trivergence's own code is Apache-2.0 (`LICENSE`). Dependencies are separate
works under their respective terms. The installed dependency inventory is
generated from the frozen lockfile by `pnpm sbom:generate` and verified by
`pnpm sbom:verify`; it is not a substitute for each dependency's license text.

The following direct-package metadata was checked locally against the frozen
installation on 2026-09-14. It does not cover transitive packages:

| Package          | Version | Declared license | Role          |
| ---------------- | ------- | ---------------- | ------------- |
| Electron         | 43.2.0  | MIT              | Runtime shell |
| React            | 19.2.8  | MIT              | Renderer      |
| React DOM        | 19.2.8  | MIT              | Renderer      |
| Zod              | 4.4.3   | MIT              | Contracts     |
| TypeScript       | 6.0.3   | Apache-2.0       | Build         |
| Vite             | 8.2.0   | MIT              | Build         |
| Vitest           | 4.1.11  | MIT              | Tests         |
| Electron Builder | 26.15.3 | MIT              | Packaging     |

These declared licenses are not grants from Trivergence. Their copyright and
attribution notices remain with upstream packages and must be carried into a
distributed binary as applicable. Trivergence does not bundle or activate Codex,
Claude, Gemini or Ollama as executable adapters.

This notice is a repository-level inventory, **not a completed legal clearance
for redistribution**. Before M7 can be marked DONE, generate the release SBOM,
review every bundled component and its transitive licenses/notice obligations,
record exceptions, and verify the installer contains the required texts.
