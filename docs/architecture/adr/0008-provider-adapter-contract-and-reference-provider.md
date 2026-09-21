# ADR-0008: contrato de Provider Adapter y Reference Provider

Estado: `ACCEPTED`  
Fecha: 2026-08-07

## Contexto

Los conectores externos continúan bloqueados por gates independientes, pero ese
bloqueo no debe impedir validar Runtime, UI, aprobaciones, streaming, budgets,
evidencia y recuperación. Introducir lógica de Codex, Claude o Gemini en el
Orchestration Engine lo acoplaría a marcas y obligaría a cambiar el núcleo por
cada integración.

## Decisión

Se adopta un contrato versionado `ProviderAdapter` con `prepare`, `execute` y
`recover` opcional, un manifest con provenance de build y un puente único
`ProviderStepDispatcher` hacia Runtime.

Se implementa un Reference Provider exclusivamente local y determinista para
ejercitar el contrato completo. Su capability requiere aprobación, pero queda
separada del trust store y de las attestations de proveedores externos. No
realiza login, detección de CLI, red ni acceso a credenciales.

Los checkpoints se persisten como metadatos ligados al plan y al paso. Son de un
solo uso, se validan antes de reanudar y una recuperación requiere una nueva
aprobación. Prompt, contexto y respuesta no se persisten en el checkpoint.

M5 permanece `PARTIAL`: queda verificada la infraestructura genérica, no un
conector comercial. M6 y el resto del roadmap pueden avanzar usando el contrato
local sin relajar ningún gate.

La semántica binaria de recovery adoptada inicialmente queda reemplazada por
[ADR-0011](0011-recovery-semantics.md): capabilities explícitas, estado remoto
desconocido y separación entre recuperación del provider y recuperación segura
del workflow.

## Consecuencias

Positivas:

- un proveedor aprobado se incorpora implementando su adaptador y publicando su
  capability/attestation, sin cambios al Orchestration Engine;
- los controles comunes se prueban antes de depender de una interfaz externa;
- errores, usage, provenance y recuperación tienen semántica uniforme;
- los gates jurídicos no bloquean workflows, agentes o memoria.

Costes y límites:

- cada protocolo oficial necesita traducción y fixtures propios;
- el contrato común no crea paridad entre proveedores;
- `stdio_jsonl` y `http_stream` son tipos permitidos, no implementaciones
  habilitadas;
- cualquier capacidad que exceda el contrato requiere diseño explícito y no un
  bypass específico de proveedor.

## Alternativas descartadas

- Esperar la aprobación de un proveedor: dejaría sin probar las fronteras
  críticas y bloquearía el roadmap.
- Simular un proveedor dentro del Orchestration Engine: mezclaría decisión con
  ejecución y rompería su independencia.
- Reutilizar una CLI autenticada sin gate: contraviene los principios de
  compatibilidad honesta y credenciales fuera de Trivergence.
