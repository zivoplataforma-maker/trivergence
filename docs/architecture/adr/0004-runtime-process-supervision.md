# ADR-0004 — Runtime y supervisión de procesos P0

Estado: aceptado  
Fecha: 2026-08-07

## Contexto

El Orchestration Engine produce planes inertes. Convertir un paso en un efecto
requiere una frontera que preserve el plan exacto, vuelva a evaluar Policy,
consuma aprobaciones y pueda detener el árbol de procesos. Terminar sólo el
proceso raíz en Windows puede dejar descendientes activos.

Job Objects es el mecanismo nativo más fuerte para administrar procesos como
unidad, pero acceder a su API desde Node exige una extensión nativa o un worker
auxiliar que todavía no existe. Añadirla ahora ampliaría el riesgo de ABI y
distribución antes de disponer de capacidades reales.

## Decisión

Se crea `@trivergence/runtime` como subsistema coordinado. No selecciona
estrategias ni modifica planes. Para cada paso:

1. comprueba que plan, snapshot y digest siguen persistidos;
2. revalida el artefacto con el Orchestration Engine;
3. recalcula Policy y exige igualdad con la decisión persistida;
4. obtiene del dispatcher un descriptor determinista del efecto;
5. recalcula y, si corresponde, consume una aprobación de un solo uso;
6. despacha con timeout, cancelación y output acotado;
7. persiste evidencia y transición del run antes de continuar.

Los dispatchers se registran por `capabilityId` y subsistema. Describen el
efecto antes de ejecutarlo. Para procesos, el descriptor liga executable
absoluto, argv, cwd, targets, nombres de entorno, fingerprint del entorno y
destinos de red. Cambiar cualquiera invalida la aprobación.

`ProcessSupervisor` aplica:

- executable y cwd dentro de allowlists exactas;
- variables de entorno permitidas por nombre; no hereda `process.env`;
- `spawn(executable, argv, { shell: false })`;
- stdin cerrado, stdout/stderr drenados y truncados con marca explícita;
- timeout duro y `AbortSignal`;
- en Windows, `taskkill.exe /PID <pid> /T`, con escalado `/F` tras el grace
  period;
- en POSIX, grupo de procesos separado y señales al grupo.

Si el supervisor no confirma el cierre del árbol, el Runtime marca el run
`orphaned`. No existe retry automático.

## Aprobaciones

Una aprobación queda ligada mediante SHA-256 canónico a plan, digest, paso,
ruleset y descriptor. SQLite conserva estado `pending`, `granted`, `denied`,
`consumed` o `expired`. Sólo una transición condicional desde `granted` puede
consumirla; la operación y su evento de auditoría comparten transacción.

No se admite aprobación recordada. El actor es una etiqueta local auditable, no
una identidad criptográfica.

## Consecuencias y límites

- no se incorpora una dependencia nativa nueva;
- el mecanismo Windows puede probarse con procesos reales y descendientes;
- `taskkill /T` es suficiente para P0 interactivo, pero no ofrece los límites,
  accounting y kill-on-close de Job Objects;
- antes de autonomía o distribución se evaluará un worker Windows con Job Object
  y `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`;
- un proceso que evade deliberadamente el árbol queda fuera de las garantías P0
  y obliga a estado `orphaned`/bloqueo.

## Alternativas descartadas

- **`child.kill()` solamente:** Windows no termina descendientes al finalizar el
  proceso padre.
- **shell o comando concatenado:** aumenta la superficie de inyección y se
  prohíbe.
- **Job Object nativo ahora:** más fuerte, pero introduce ABI/worker antes de
  que exista una necesidad de producto validada.
