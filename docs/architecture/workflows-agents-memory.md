# Workflows, agentes y memoria

Estado: normativo e implementado para M6  
Fecha: 2026-09-10

## Propósito

M6 agrega coordinación compuesta sin cambiar la identidad del producto: el
Orchestration Engine sigue siendo la autoridad que selecciona, planifica y
evalúa capacidades. Workflows, agentes y memoria son subsistemas subordinados;
no pueden aprobar acciones, ampliar permisos, publicar proveedores ni mutar un
plan.

El flujo vertical implementado es:

```text
Usuario
  │ intención + budgets
  ▼
Strategy Engine → Execution Planner → Capability Registry → Evaluation Engine
  │ plan íntegro y decisiones de policy
  ▼
Runtime
  ├─ memory.local.recall
  ├─ agent.reference.team
  ├─ workflow.local.synthesis
  ├─ memory.local.commit
  └─ workflow.local.evaluate
       │
       ▼
Resultado + cinco StepEvidence + auditoría encadenada
```

## Paquetes y autoridad

- `@trivergence/coordination-contracts`: contratos Zod propios de M6. Evita
  acoplar los contratos estables del núcleo a detalles internos.
- `@trivergence/agents`: ejecuta los roles acotados `planner`, `critic` y
  `synthesizer`. Solo acepta un adapter cuyo manifest sea `reference` y
  `localOnly=true`.
- `@trivergence/workflows`: ejecuta la definición declarativa y versionada
  `workflow.local.team-memory-evaluation@1.0.0`, evalúa checks deterministas y
  admite como máximo una reparación.
- `@trivergence/memory`: recupera y persiste memoria por namespace de workspace,
  valida contenido/provenance y aplica retención, borrado y poda.
- `@trivergence/runtime`: despacha el plan autorizado. Cada dispatcher recibe
  únicamente snapshots profundos, inmutables y separados de los outputs de sus
  dependencias directas.
- `@trivergence/persistence`: conserva memoria funcional y eventos sanitizados;
  no decide qué recordar ni si un resultado es correcto.

Los cuatro componentes del Orchestration Engine no fueron modificados para M6.
El Planner expandió las cinco capacidades usando el mecanismo existente de
dependencias.

## Contratos y cambios compatibles

Se mantuvieron los contratos estables. Solo se hicieron extensiones aditivas
necesarias:

1. `DispatchContext` expone request, `planId` y outputs efímeros de dependencias
   directas. Es una interfaz interna de Runtime y no cambia los artefactos
   persistidos del Orchestration Engine.
2. El IPC de escritorio admite la operación nominal `m6_workflow` y su resultado
   tipado; no existe un bus genérico.
3. La taxonomía de auditoría agrega eventos de almacenamiento, borrado y poda de
   memoria.

Todos los objetos que cruzan paquetes se validan al entrar y al salir. Los
digests usan canonical JSON v1 y SHA-256; detectan alteración, pero no son una
firma ni conceden autoridad.

## Budgets compartidos

| Recurso           | Default | Límite M6 | Aplicación                                    |
| ----------------- | ------: | --------: | --------------------------------------------- |
| agentes           |       3 |         3 | número de roles                               |
| llamadas provider |       4 |         4 | equipo más reparación                         |
| input             |  16 KiB |    64 KiB | acumulado de llamadas                         |
| output            |  64 KiB |    64 KiB | acumulado de llamadas                         |
| memorias          |       4 |        16 | recall por workspace                          |
| bytes de memoria  |  16 KiB |    64 KiB | recall acumulado                              |
| tiempo            |    10 s |      60 s | equipo más reparación                         |
| coste             |       0 | 1 000 000 | microunidades; Reference siempre informa cero |
| replans           |       1 |         1 | solo reparación de síntesis                   |
| retención         | 30 días |  365 días | expiración explícita de la memoria            |

El resultado final presenta budget y uso observado. Un agotamiento falla
cerrado; no degrada silenciosamente a más llamadas, más contexto ni otro
proveedor.

## Provenance

La cadena verificable contiene:

1. cada contribución: rol, provider/localidad, digests de request, contexto y
   respuesta, uso y duración;
2. el equipo: digest del objetivo, memoria, contribuciones y consumo agregado;
3. el workflow: definición/versión, candidato, evaluación inicial, reparación
   opcional, budget y uso;
4. la memoria: run, plan, step, workflow, equipo, provider, contenido y
   expiración;
5. la evaluación final: checks de integridad, boundary de proveedor y cadena de
   provenance;
6. Runtime: una evidencia por paso ligada a run/plan/capability y al digest del
   output.

La auditoría guarda identidades y digests, no el objetivo ni el resultado. El
contenido de memoria sí vive en la tabla funcional porque recordar es su
propósito; no se replica en logs ni eventos.

## Ciclo de vida de memoria

- namespace obligatorio por workspace (fallback aislado por request fuera del
  escritorio);
- recall limitado por cantidad, bytes y `expiresAt`;
- validación del digest de contenido y del schema de provenance en lectura;
- commit solo si candidato, digest y provenance coinciden;
- trigger SQL que impide reescribir contenido, provenance o retención;
- borrado lógico explícito y poda de expirados, ambos auditados sin contenido;
- `secure_delete=ON` como defensa local de SQLite; cifrado de base y garantías
  frente a procesos del mismo usuario siguen fuera de M6.

## Proveedores

M6 no confía en attestations externas. El trust store de Codex, Claude y Gemini
permanece vacío y sus capacidades continúan `unavailable`. El equipo hace sus
pruebas únicamente con `ReferenceProviderAdapter`, en memoria, sin red ni
credenciales.

Cuando un proveedor supere su gate, se implementará su `ProviderAdapter` y se
publicará una capability autorizada. Sustituirlo en un workflow exigirá una
versión nueva de la definición, nuevos budgets y threat review; no un cambio al
Orchestration Engine.

## Fallos

- output faltante, adulterado o de una dependencia no declarada: fallo de
  Runtime/dispatcher;
- provenance o digest inconsistente: rechazo antes de persistir;
- cancelación/timeout/provider error: run terminal, sin commit posterior;
- evaluación inicial fallida: una reparación como máximo si resta budget;
- evaluación final fallida: resultado `rejected` y evidencia, nunca promoción a
  éxito;
- memoria vencida o borrada: no participa en recall.

El threat model específico está en
[Threat model M6](../security/threat-model-m6.md) y la decisión de arquitectura
en [ADR-0009](adr/0009-workflows-agents-memory.md).
