# ADR-0002 — Orchestration Engine como núcleo

Estado: aceptado  
Fecha: 2026-08-04

## Contexto

La arquitectura inicial colocaba al coordinator/Runtime en el centro y describía
el producto principalmente como workspace para asistentes. Eso confundía el
mecanismo de ejecución con la razón de ser del producto y empujaba UI, providers
y tools hacia integraciones directas difíciles de explicar y gobernar.

## Decisión

Trivergence se define como sistema de orquestación. El núcleo será un paquete
puro formado por Strategy Engine, Execution Planner, Capability Registry y
Evaluation Engine.

Runtime, agentes, proveedores, memoria, workflows, workspace, tools y
persistencia son subsistemas coordinados. Policy Engine se conserva como
guardrail puro por acción. Electron main aloja temporalmente el núcleo y valida
IPC, pero no contiene decisiones de dominio.

La primera API es un preview sin efectos. La ejecución se agrega después de
persistir y enlazar plan, policy, aprobación, registry y evidencia.

## Consecuencias positivas

- el producto puede planificar y explicar sin proveedor ni Runtime;
- las capacidades reemplazables evitan acoplamiento a marcas;
- política, planificación y evaluación tienen responsabilidades distintas;
- la UI puede mostrar causalidad antes de pedir autorización;
- los tests del núcleo no requieren Electron, filesystem ni procesos.

## Costes y riesgos

- hay más contratos y versiones que mantener;
- un Registry desactualizado puede producir un plan obsoleto, por lo que se
  revalida antes de ejecutar;
- la replanificación y el paralelismo se posponen para no introducir semántica
  implícita;
- el Runtime existente debe adaptarse a consumir planes, no acciones sueltas.

## Compatibilidad

Los contratos `diagnostics:get` y `policy:evaluate` se mantienen durante la
migración. El nuevo `orchestration:preview` compone las mismas decisiones de
política, por lo que no rompe la foundation implementada. Los IPC antiguos solo
se retirarán con deprecación documentada y pruebas de reemplazo.

## Alternativas descartadas

- **Runtime como núcleo:** optimiza ejecutar, pero no explica cómo se eligió el
  trabajo ni coordina capacidades heterogéneas.
- **Agente/modelo como orquestador:** vuelve no deterministas las barreras de
  seguridad y permite que contenido no confiable influya en la autoridad.
- **Workflow estático como núcleo:** sirve para recetas conocidas, pero no
  representa selección de estrategia ni disponibilidad dinámica.
