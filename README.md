# Trivergence

Trivergence es un sistema de orquestación local-first para Windows. Convierte
una intención en una estrategia, un plan de capacidades y una evaluación antes
de coordinar Runtime, agentes, proveedores, memoria, workflows y herramientas.
No es un IDE ni una IA.

> Estado: M0–M4 y M6 verificados. M5 sigue `PARTIAL`: el contrato
> provider-agnostic y el Reference Provider local están verificados, pero ningún
> proveedor externo está aprobado ni habilitado. Existe un instalador local
> unsigned de ensayo M7, no una release distribuible. Consulta
> [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) para evidencia actual.

## Qué busca resolver

Los subsistemas y CLI tienen capacidades, sesiones y permisos distintos.
Trivergence no los reemplaza ni toma sus credenciales: ofrece un motor común
para decidir qué enfoque usar, construir pasos, verificar viabilidad y dejar
evidencia de por qué se ejecutó algo.

El flujo local parte de un objetivo: Strategy Engine compara rutas declaradas
por el Registry, Planner arma pasos y Evaluation Engine comprueba tanto la
viabilidad previa como el resultado posterior. Funciona sin IA externa.

## Límites importantes

- Local-first no significa offline cuando eliges un proveedor cloud.
- Trivergence no pide ni almacena API keys, OAuth tokens o cookies.
- La compatibilidad depende de interfaces oficiales, versiones instaladas y
  términos aplicables.
- Una suscripción de chat no equivale a acceso API general.
- Claude Code por credenciales Free/Pro/Max y Gemini CLI por su OAuth no se usan
  como backends automatizados. Claude Platform `ant`, Vertex AI y Codex App
  Server conservan gates separados antes de cualquier integración.
- El proyecto no evade pagos, cuotas, políticas ni controles de los proveedores.

## Documentación

- [Especificación maestra](TRIVERGENCE_PROMPT_MAESTRO_CODEX.md)
- [Auditoría crítica](docs/product/spec-review.md)
- [PRD](docs/product/PRD.md)
- [Prioridades por área](docs/product/priorities-by-area.md)
- [Arquitectura](docs/architecture/overview.md)
- [Orchestration Engine](docs/architecture/orchestration-engine.md)
- [Runtime y aprobaciones](docs/architecture/runtime-and-approvals.md)
- [Workspace y tools locales](docs/architecture/workspace-and-tools.md)
- [Adaptadores](docs/architecture/provider-adapters.md)
- [Contrato ejecutable y Reference Provider](docs/architecture/reference-provider-contract.md)
- [Workflows, agentes y memoria](docs/architecture/workflows-agents-memory.md)
- [Expediente comparativo de proveedores](docs/providers/comparison-2026-08-07.md)
- [Metodología del gate](docs/providers/gate-methodology.md)
- [ADR de attestations y primer candidato](docs/architecture/adr/0007-provider-attestations-and-first-candidate.md)
- [ADR del contrato de Provider Adapter](docs/architecture/adr/0008-provider-adapter-contract-and-reference-provider.md)
- [Threat model](docs/security/threat-model.md)
- [Threat model M6](docs/security/threat-model-m6.md)
- [Privacidad](docs/privacy.md)
- [UI](docs/design/ui-spec.md)
- [Roadmap](ROADMAP.md)

## Desarrollo

Requisitos verificados: Node 24, pnpm 11 y Windows 11.

```powershell
pnpm install --frozen-lockfile
pnpm check:fresh
pnpm e2e:desktop
pnpm smoke:desktop
pnpm --filter @trivergence/desktop start
```

`check:fresh` ejecuta formato, lint, tipos, unitarios y build directamente, sin
caché de Turbo. `e2e:desktop` recorre el preview real; `smoke:desktop` abre la
app con un perfil aislado y la cierra tras cargar el renderer. Ambos requieren
un entorno capaz de iniciar Electron. `start` abre la sesión local: permite
seleccionar un workspace, previsualizar y ejecutar capacidades read-only
verificadas y ejercitar el Reference Provider local con aprobación y streaming.
También recorre el workflow M6 de cinco pasos con equipo local, memoria,
evaluación y evidencia. Ningún proveedor externo está conectado. Consulta
[desarrollo en Windows](docs/contributing/windows-development.md).

## Independencia

Trivergence no está afiliado con OpenAI, Anthropic, Google, OpenHands, Sakana AI
ni Odysseus. Las marcas y productos mencionados pertenecen a sus respectivos
titulares. Las CLI externas se instalan, autentican y actualizan por separado.
Cada usuario es responsable de cumplir términos, políticas y límites de su
proveedor.

## Licencia

El código original de Trivergence se ofrece bajo [Apache-2.0](LICENSE). Consulta
[NOTICE](NOTICE) y [notices de terceros](THIRD_PARTY_NOTICES.md). La revisión de
licencias de todas las dependencias empaquetadas sigue siendo un gate de
distribución M7; esta licencia no cubre marcas ni software de terceros.
