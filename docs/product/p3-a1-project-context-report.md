# P3-A1 — informe de Project Context mínimo

Fecha: 2026-09-22  
Resultado: `DONE`

## Resumen ejecutivo

P3-A1 incorpora un snapshot local-first del contexto operativo autorizado sin
crear Project Intelligence ni una fuente de verdad paralela. El flujo queda:

```text
Objective → ProjectContextBuilder → ProjectContextSnapshot → Strategy → Plan
```

El snapshot contiene referencias, digests, límites y provenance. No contiene el
objetivo en claro, paths raíz, contenido de recursos, credenciales, consumo del
Runtime, Memory, Audit o Evidence copiados. Reference Provider continúa siendo
el único provider ejecutable.

## Arquitectura y contratos

- `ProjectContextSnapshot` schema v1 liga context ID/revisión, request,
  workspace opaco, governance, Registry, capabilities relevantes, budgets,
  fuentes y provenance.
- `ProjectContextBuilder` es el único constructor y vive en Orchestration Core;
  no ejecuta tools, consulta providers, decide Strategy, modifica Registry o
  Policy ni persiste Memory.
- JSON canónico v1 y SHA-256 producen `inputDigest`, digests de descriptors y
  digest final. Orden incidental de referencias/capabilities no cambia el
  resultado.
- Strategy recibe el snapshot y limita candidatas a capabilities referenciadas.
  El preview y su plan integrity incluyen el contexto completo.
- Los límites de budget se describen con `consumptionAuthority: runtime`; no se
  copian contadores de consumo.

## Persistencia y privacidad

La migración `0008_project_context` reutiliza SQLite. No se añadió otro store.
`project_context_snapshots` es inmutable por trigger y se identifica por context
ID + revisión, request, workspace y digest. Solo `standard` persiste el
manifest; `private` lo mantiene en memoria y no crea fila durable. La lectura
tras reinicio ignora snapshots expirados y la poda aplica la retención. El
borrado no se presenta como eliminación forense.

## Invariantes verificadas

1. construcción determinista con dependencias controladas;
2. cambio relevante cambia revisión/digest;
3. orden incidental normalizado;
4. referencia cross-workspace rechazada;
5. private mode sin persistencia durable;
6. material con forma de credencial rechazado y paths no incluidos;
7. capability inexistente falla cerrado; estados no disponibles siguen visibles
   para que Strategy bloquee explicablemente;
8. referencia inválida falla schema;
9. tamaño canónico máximo de 16 KiB;
10. digest sobre canonical JSON;
11. provenance de fuentes y builder preservada;
12. límites de budget sin consumo Runtime;
13. contenido no puede modificar Policy;
14. contenido externo permanece `untrusted_data`;
15. operación íntegramente local con Reference Provider;
16. reinicio recupera solo contexto estándar vigente.

## Threat model

Se añadieron T-24 a T-27 para poisoning/staleness, cruce de workspace y
filtración, confusión de autoridad y DoS/retención privada. Los controles son
binding estricto, provenance/digest, IDs opacos, 16 KiB, cardinalidades, private
mode no durable y ownership separado.

## Validación

- tests nuevos: 16;
- tests totales: 165/165;
- format, lint, typecheck y build: `PASS` fresco para 12 proyectos;
- Electron E2E y smoke: `PASS` sobre el build real;
- security: `PASS`, sin vulnerabilidades conocidas;
- SBOM: `PASS`, CycloneDX verificado con 451 componentes;
- relative links: `PASS` en los siete Markdown modificados/nuevos;
- whitespace y secret scan: `PASS`;
- scope: `PASS`, sin cambios en providers, trust store, autenticación, M5 o M7.

El test Windows que confirma terminación del árbol de procesos no puede usar
`taskkill /T` dentro del sandbox de Codex y reporta
`treeTerminationConfirmed=false`. La ejecución fresca fuera del sandbox pasó
165/165 sin modificar Runtime ni ese test.

## Scope y deuda restante

No se implementaron Project Intelligence, Execution Gateway, Durable Workflow
State, Agent Profiles, fan-out/fan-in, MCP, A2A, Trace, OpenTelemetry,
WorkflowExecutionSnapshot, providers externos ni decisiones ejecutables de
ADR-0012 a ADR-0015. La siguiente fase mínima, solo después del cierre de estos
gates, es P3-D0.
