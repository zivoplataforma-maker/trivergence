# Arquitectura de adaptadores de proveedor

## Objetivo

Representar lo que una instalación concreta puede hacer sin inventar paridad. Un
adaptador no es una promesa de acceso al modelo: puede limitarse a detección y
sesión interactiva externa.

Los adaptadores son un subsistema del Orchestration Engine. Publican
descriptores y evidencia en el Capability Registry; no seleccionan estrategia,
no encadenan tools y no ejecutan una solicitud por estar disponibles. El motor
sigue siendo proveedor-agnóstico.

La superficie ejecutable y sus invariantes están definidos en el
[contrato de Provider Adapter](reference-provider-contract.md) y aceptados por
[ADR-0008](adr/0008-provider-adapter-contract-and-reference-provider.md).

## Contrato conceptual

```ts
type CapabilityMode = "structured" | "interactive" | "external";

type ProviderOperation =
  | "detect"
  | "auth_status"
  | "login"
  | "models"
  | "prompt"
  | "resume"
  | "cancel"
  | "tool_events";

interface CapabilityEvidence {
  mode: CapabilityMode;
  sourceUrl?: string;
  verifiedAt: string;
  versionRange: string;
  reason?: string;
}

interface ProviderDescriptor {
  id: string; // identificador namespaced y validado, no lista cerrada
  displayName: string;
  installedVersion?: string;
  operations: Partial<Record<ProviderOperation, CapabilityEvidence>>;
}
```

`unavailable` es un estado de capability, no una modalidad.

## Reference Provider local

`provider.reference.prompt.structured` es la implementación de referencia del
contrato. Ejecuta un transporte asíncrono en memoria, no abre red, no autentica
cuentas y no representa a un proveedor externo. Permite probar de extremo a
extremo preview de contexto, aprobación, streaming, cancelación, budgets,
errores, provenance y recuperación persistente.

Su disponibilidad local no modifica el trust store de candidatos externos ni
supera sus gates. Codex, Claude y Gemini continúan `unavailable`.

## Attestation obligatoria

Una publicación estructurada incluye provenance con digest de observación y de
attestation. La attestation fija proveedor, operación, interfaz oficial,
autenticación, tipo de cuenta/caso de uso, versiones, fixtures y tres revisiones
independientes (`technical`, `contractual`, `legal`). Cada revisión tiene
estado, revisor, fecha, vencimiento y fuentes.

La elegibilidad es una conjunción fail-closed:

```text
observado + versión exacta + identidad estable
+ implementación/fixtures verificados
+ tres reviews aprobadas y vigentes
+ digest incluido en trust store del release
+ usuario habilitó + modo privado desactivado + health válido
```

Cualquier ausencia publica `status: unavailable`. Instalación y autenticación
nunca elevan disponibilidad. El renderer no puede modificar el trust store.

Las operaciones son opcionales. `auth_status` nunca se implementa leyendo
archivos; usa un comando oficial que revele solo estado y se sanitiza.

## Estados

- `not_installed`
- `installed_unverified`
- `compatible_interactive`
- `compatible_structured`
- `authentication_required`
- `terms_blocked`
- `disabled_by_user`
- `unhealthy`

Una versión nueva empieza como `installed_unverified`, no hereda compatibilidad
por semver.

## Detección

1. Resolver el ejecutable con mecanismos del sistema sin aceptar una ruta
   enviada por contenido.
2. Ejecutar `--version` o equivalente documentado con entorno mínimo, timeout
   corto y sin shell.
3. Limitar y sanitizar stdout/stderr.
4. Comparar contra matriz incluida en la aplicación.
5. Registrar versión, resultado y hash de matriz; nunca ruta de credenciales.

## Ejecución estructurada

Toda ejecución estructurada atraviesa un `AdapterHost` registrado por
capability; el `ProviderStepDispatcher` es la entrada única desde Runtime. El
equipo local M6 también llama al mismo host para sus solicitudes anidadas, sin
autoridad propia sobre policy o tools. El host valida manifest, preview, eventos
y provenance de resultado antes de devolverlos. El Runtime valida el descriptor
ligado al plan y la aprobación, transmite cancelación mediante `AbortSignal`,
valida cada evento del stream y persiste solo checkpoints y evidencia
minimizada. El Orchestration Engine no conoce el transporte ni el proveedor
concreto.

- Prompt por stdin cuando esté soportado, para evitar exposición en command
  line/process list.
- cwd canónico y lista explícita de variables heredadas.
- Output parser incremental con tamaño y profundidad máximos.
- Evento desconocido produce warning y, si afecta semántica de seguridad,
  aborta.
- Las solicitudes de herramientas del proveedor no se ejecutan directamente: se
  traducen a una capacidad/`ActionRequest` y vuelven al Execution Planner y al
  Policy Engine.
- La cancelación apunta al run exacto; no se reutiliza ID de sesión como
  autorización.

## Ejecución interactiva

Una terminal interactiva visible pertenece a la CLI oficial. Trivergence puede
crear el PTY y mostrar bytes, pero no extrae tokens, no interpreta el login como
protocolo ni oculta prompts de consentimiento. Se advierte que la CLI puede leer
el workspace según sus propias políticas.

Para un proveedor con restricción jurídica, Trivergence abrirá preferentemente
una terminal del sistema en el workspace y tratará la sesión como externa, sin
enviar prompts ni capturar resultados.

## Gates para habilitar una operación

- documentación oficial vigente;
- términos compatibles con producto de terceros y tipo de cuenta;
- fixture sin secretos de la versión exacta/rango;
- contract tests de éxito, error, auth requerida, output truncado y cancelación;
- revisión de redacción de logs;
- kill-tree verificado para runs con herramientas.

## Matriz MVP provisional

| Proveedor          | Detectar  | Login visible   | Prompt estructurado                        |
| ------------------ | --------- | --------------- | ------------------------------------------ |
| Reference Provider | local     | no aplica       | implementado; memoria, sin red             |
| Codex              | candidato | candidato       | App Server preferido; gate aún pendiente   |
| Claude Code        | candidato | externo/visible | suscripción rechazada; evaluar `ant` OAuth |
| Gemini CLI         | candidato | externo/visible | OAuth rechazado; evaluar Vertex OAuth/ADC  |
| Ollama             | candidato | no aplica       | P1, local y opt-in                         |

“Candidato” no significa implementado. El Reference Provider verifica la
infraestructura, no la compatibilidad de los candidatos; ver
`IMPLEMENTATION_STATUS.md`.

La metodología y la evidencia vigente se encuentran en
[Metodología del gate](../providers/gate-methodology.md),
[comparación 2026-08-07](../providers/comparison-2026-08-07.md) y
[ADR-0007](adr/0007-provider-attestations-and-first-candidate.md).
