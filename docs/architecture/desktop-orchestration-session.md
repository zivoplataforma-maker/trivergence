# Sesión de orquestación en Desktop

Estado: normativo para M4–M6 y P0  
Fecha: 2026-09-12

## Propósito

La aplicación de escritorio conecta el renderer no privilegiado con Workspace,
Orchestration Engine, Persistence y Runtime sin convertir el preload en una API
genérica. La sesión vive en Main y conserva los objetos con autoridad: raíz
canónica, Registry, preview firmado, aprobación y run.

## Flujo nominal

1. El renderer solicita `workspace:select` sin proporcionar una ruta.
2. Main abre el selector nativo de directorios, canoniza la elección y devuelve
   únicamente una descripción serializable del workspace.
3. El renderer envía una intención acotada mediante `workspace:preview`:
   workspace, objetivo, perfil, privacidad y detalle opcional; no elige
   operación.
4. Main transforma esa intención en `OrchestrationRequest`, compara rutas,
   selecciona una y valida el target requerido por esa ruta, genera el preview y
   lo persiste antes de devolverlo.
5. Para ejecutar, el renderer envía solo `workspaceId` y `planId`. Main recupera
   el preview que conserva en memoria, asigna `runId` y llama al Runtime.
6. La UI consulta el estado por `runId`; puede cancelar el run activo. El
   resultado, evaluación posterior y últimos eventos se validan y acotan antes
   de cruzar IPC. `workspace:history:get` devuelve solo ejecuciones del
   workspace activo, limitadas y sin contenido de output.

El renderer nunca envía un preview completo para ejecutar, una ruta absoluta
elegida manualmente, executable/argv, un descriptor de aprobación ni contenido
para auditoría.

## Estado y recuperación

Main mantiene una sola sesión activa en M6. El ID del workspace se deriva de la
ruta canónica para recuperar su historial al reabrirlo. Seleccionar otra carpeta
invalida la sesión visual anterior, pero no altera evidencia persistida. Los
runs que quedaron `running` tras un cierre pasan a `orphaned` durante el
arranque y se presenta un aviso de recuperación; no se reinician. Un checkpoint
de proveedor se conserva por separado y solo puede usarse en una nueva ejecución
explícita, con una aprobación nueva y validación completa. El estado de
integridad de la base y, si existe, el manifiesto de recuperación se muestran en
la UI; las acciones privilegiadas quedan deshabilitadas cuando la base está en
solo lectura.

El inicio de ejecución responde de inmediato con `runId`. El resultado terminal
se obtiene por polling nominal y contiene estado, motivo, cantidad de evidencias
y, si cabe en el presupuesto, un output tipado. No se transportan eventos IPC
genéricos ni callbacks del renderer hacia Main.

## Aprobaciones

La UI está preparada para `approval_required`: muestra el paso y solicita a Main
un descriptor exacto ligado a plan/step. Permitir o denegar usa endpoints
separados y una decisión explícita. Escape, foco, cerrar el detalle o iniciar
otro preview nunca conceden aprobación. Las capacidades M4 read-only no
requieren aprobación. El Reference Provider local sí ejercita este centro:
muestra destino local, ausencia de red, contexto por metadatos y budgets antes
de permitir una vez. El workflow M6 requiere aprobación separada para equipo,
síntesis y commit; recall y evaluación permanecen read-only.

## Presupuestos

- intención: límites del contrato compartido;
- path relativo: 2.048 caracteres;
- query literal: 200 caracteres;
- una sesión y un run activo por plan;
- polling mínimo: 150 ms;
- respuesta IPC con output: máximo 900 KiB serializados; si lo supera, el run
  conserva éxito/evidencia pero la UI informa que el resultado no puede
  mostrarse en línea.
- stream visible: últimos 256 eventos correlacionados; no es un bus IPC de
  autoridad ni una fuente de aprobación.
- workflow M6: 3 agentes, 4 llamadas, 1 replan y 30 días de retención por
  defecto; el resultado IPC incluye budget, uso, checks y provenance.

## Invariantes

- sender/origen se valida en cada handler;
- todos los payloads y respuestas cruzan schemas Zod;
- Main genera workspaceId, planId indirectamente y runId;
- la ejecución usa el preview persistido de Main, no el objeto del renderer;
- cambiar objetivo, detalle, perfil o privacidad exige un nuevo preview;
- los resultados se renderizan como texto, nunca HTML no confiable.
