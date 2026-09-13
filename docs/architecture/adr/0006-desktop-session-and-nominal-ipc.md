# ADR-0006: sesión Desktop y ejecución por referencias nominales

Estado: aceptado  
Fecha: 2026-08-07

## Contexto

El backend M4 ya puede planificar y ejecutar operaciones locales, pero el shell
M2 solo genera un preview fijo. Permitir que el renderer elija rutas, reenvíe un
preview o invoque Runtime directamente ampliaría su autoridad y permitiría
mutaciones entre preview y ejecución.

## Decisión

Main es dueño de la sesión de workspace y conserva previews por `planId`. La
selección usa el diálogo nativo; los IPC son métodos nominales con schemas
compartidos. El renderer solicita preview con intención tipada y ejecución con
identificadores opacos. Main persiste y revalida el artefacto que ya posee.

La ejecución se inicia con un `runId` generado en Main, progresa en segundo
plano y se consulta mediante polling. Esto permite cancelar sin exponer Runtime
ni un bus de eventos. Los outputs atraviesan una proyección tipada y un límite
menor al presupuesto IPC.

## Consecuencias

- el renderer no puede sustituir path, policy, descriptor o digest al ejecutar;
- un refresh pierde la sesión efímera y obliga a seleccionar/replanificar, pero
  no pierde auditoría;
- M4 admite una sola sesión activa y operaciones read-only;
- historial persistente, múltiples workspaces y streaming/paginación requieren
  una extensión posterior;
- polling es deliberadamente simple para el MVP y puede reemplazarse por eventos
  nominados sin cambiar el modelo de autoridad.

## Alternativas descartadas

- **Ejecutar el preview enviado por renderer:** objeto no confiable y mutable.
- **Exponer filesystem/Runtime por preload:** API demasiado poderosa.
- **Aceptar una ruta escrita en un input:** el renderer controlaría el root.
- **Exponer `ipcRenderer.on/send`:** crea un canal genérico difícil de auditar.
- **Esperar el run completo en un solo invoke:** impide cancelación controlada.

## Enmienda M6 — 2026-09-10

La sesión sigue siendo única. Se agregó el IPC nominal `m6_workflow`, que
incluye tres pasos guarded y un commit de memoria limitado al namespace del
workspace. No expone Runtime, SQL ni un bus genérico y conserva la decisión
original de autoridad en Main.
