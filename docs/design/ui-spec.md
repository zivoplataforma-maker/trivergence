# Especificación de UI — Orquestación MVP

Estado: normativa para M6 y P0  
Fecha: 2026-09-12

## Principios

- La UI explica una orquestación; no imita un IDE ni personifica una IA.
- Objetivo, estrategia, plan, capacidades, riesgo y evaluación son visibles.
- Progressive disclosure: primero “qué y por qué”; detalles técnicos por paso.
- Teclado primero, foco predecible y estado no dependiente solo del color.
- Sin métricas decorativas, botones inertes ni éxito prematuro.
- “Preview listo” no significa “ejecutado”.

## Modelo de navegación

```text
┌ Navegación ───┬──────────────── Orquestación ────────────────┐
│ Orquestación  │ Objetivo                                     │
│ Capacidades   │ Estrategia elegida + motivo                  │
│ Ejecuciones   │ Plan / dependencias / política               │
│ Ajustes       │ Evaluación: listo / aprobación / bloqueado   │
├───────────────┴──────────────────────────────────────────────┤
│ Perfil · privacidad · snapshot de capacidades · estado run  │
└──────────────────────────────────────────────────────────────┘
```

El editor, terminal, árbol de archivos y diff son vistas auxiliares de
subsistemas, no la navegación principal ni el centro conceptual.

## Vista principal M6

### 1. Intención

La pantalla comienza con selección nativa de workspace. Después ofrece objetivo
editable, perfil, privacidad (`private` por defecto) y detalle opcional. El
Strategy Engine compara rutas; la UI no obliga a escoger operación. Para una
lectura, el detalle es la ruta relativa; para una búsqueda, el texto literal. Se
exige ese detalle después de seleccionar una de esas rutas. Para Reference
Provider y workflow, el objetivo es el prompt y el detalle aporta contexto.
Cambiar el objetivo borra el detalle anterior para evitar un target obsoleto. La
UI no acepta una ruta raíz escrita ni una línea de shell. Límites, exclusiones y
errores se muestran antes de ejecutar.

### 2. Estrategia

Muestra modalidad (`direct`, `sequential`, futura `parallel`), versión, motivo,
ruta elegida y todas las candidatas con puntuación/estado. Si no puede
resolverse, explica si faltó coincidencia, disponibilidad o privacidad.

### 3. Plan

Lista ordenada o DAG accesible. Cada paso muestra nombre, subsistema,
dependencias, efecto declarado y decisión de política. La vista textual es la
fuente accesible; una visualización futura no la reemplaza.

### 4. Evaluación

Estado con precedencia:

1. `blocked`: no se ofrece ejecutar;
2. `approval_required`: se ofrece revisar, no aprobar genéricamente;
3. `ready`: el plan puede pasar al Runtime, pero aún no se ejecutó.

Los checks indican evidencia: estrategia resoluble, plan válido, pasos presentes
y política satisfecha.

El preview muestra versión del Registry y un prefijo del digest para soporte y
correlación. El hash completo será copiable desde detalles; nunca se presenta
como garantía de seguridad ni como sustituto de la aprobación.

### 5. Subsistemas

Diagnóstico de seguridad y proveedores permanece visible como evidencia del
Capability Registry, no como protagonista de marca. Detectar una CLI no crea una
capacidad estructurada ni autoriza su uso.

El Reference Provider se identifica siempre como local/de prueba. No usa marca
de un tercero ni permite inferir que un proveedor externo está conectado.

## Centro de aprobación M3

Orden visual:

1. objetivo y estrategia que originaron el paso;
2. verbo de impacto, riesgo y motivo;
3. capability, subsistema, targets/cwd/provider;
4. executable, argumentos y nombres de entorno;
5. diff o contexto saliente;
6. permitir una vez / denegar.

Para una capability de proveedor, el detalle incluye provider, transporte,
destino, presencia de red, elementos/tamaños/digests de contexto y budgets. No
muestra datos crudos adicionales que no fueran ya visibles en la intención.

No existe “permitir siempre” para destructivo, sistema o credenciales. Escape y
foco no aprueban. Un cambio de plan invalida la pantalla y obliga a revisar.

## Estados obligatorios

- workspace no seleccionado, selección cancelada o raíz rechazada;
- intención vacía con ejemplo útil y labels persistentes;
- generando preview;
- strategy unavailable;
- dependencia faltante o ciclo;
- capability degradada, deshabilitada o snapshot obsoleto;
- aprobación requerida;
- listo sin ejecutar;
- ejecutando/cancelando/cancelado;
- resultado parcial, truncado, fallido u orphaned;
- stream iniciado, deltas, checkpoint, usage y recuperación desde checkpoint;
- auditoría no disponible y recuperación read-only.

## Ejecución local M6

El CTA cambia según el artefacto vigente:

- sin preview: `Generar preview`;
- preview `ready`: `Ejecutar plan de solo lectura`;
- preview `approval_required`: `Revisar contexto y aprobación` y, después del
  grant de un uso, `Ejecutar plan aprobado`;
- run activo: `Cancelar ejecución`;
- preview alterado por el usuario: ejecución deshabilitada hasta replanificar.

El resultado se muestra como texto preformateado para lectura de archivo, como
lista archivo/línea/columna para búsqueda o como resultado de workflow con
outcome, memoria, provenance, checks y budget/uso. Nunca se interpreta HTML. La
timeline textual muestra planificado, ejecutando/cancelando y estado terminal
con cantidad de evidencias. Un output demasiado grande no se trunca
silenciosamente: se muestra el motivo y se conserva la evidencia del run.

El panel de historial lista ejecuciones del workspace actual con estado,
objetivo, ruta y fecha; no recupera outputs completos. La UI muestra integridad
de persistencia, runs huérfanos y manifiesto de recuperación cuando existe. El
modo privado y los destinos/contexto de aprobación son visibles antes de
ejecutar. La evaluación posterior distingue resultado aceptado/rechazado del
preflight; no se confunde `ready` con éxito.

## Lenguaje

- “Generar preview” en lugar de “Ejecutar” durante M2.
- “Estrategia secuencial: la detección depende del diagnóstico” en lugar de
  “Pensando”.
- “Plan listo; todavía no se ejecutó” en lugar de “Completado”.
- “Requiere una aprobación por paso” en lugar de “¿Continuar?”.
- “La versión no fue verificada” en lugar de “Algo salió mal”.

## Tokens, accesibilidad y pruebas

- spacing base 4 px y objetivos táctiles de al menos 44×44 CSS px;
- foco de 2 px con contraste ≥ 3:1; texto normal ≥ 4.5:1;
- landmarks y encabezados semánticos; DOM igual al orden visual;
- nombres accesibles para strategy, riesgo, dependencias y evaluación;
- `aria-live` para cambios de preview/run sin repetir deltas;
- animación respeta `prefers-reduced-motion`;
- axe en E2E, navegación solo con teclado, revisión con Narrator, zoom 200% y
  1366×768 sin scroll horizontal.

El resultado automatizado no sustituye la verificación manual con Narrator. M6
puede cerrarse con axe, teclado programático, reflow y contraste calculado; la
prueba manual queda registrada como gate humano antes de una beta pública.

La evidencia vigente se registra en
[Auditoría de accesibilidad M6](accessibility-audit-m6.md).

## Fuera del MVP UI

Monaco, xterm, multi-pane personalizable, command palette, avatar/asistente,
chat como navegación primaria, consejo multiagente y visualizador dinámico de
DAG. Solo se agregan si mejoran el flujo de orquestación observado.
