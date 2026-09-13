# Auditoría de accesibilidad M6

Estado: verificación automatizada aprobada; validación manual con Narrator
reservada como gate humano previo a beta  
Fecha: 2026-09-10

## Alcance

Se auditó el flujo crítico de escritorio sobre el build de producción:
seleccionar workspace, editar intención, generar y revisar un plan, ejecutar una
lectura, consultar resultado/evidencia, cancelar una búsqueda activa y completar
el workflow M6 de cinco pasos con tres aprobaciones y resultado auditable.

## Resultado

| Área                  | Resultado           | Evidencia                                                                                               |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Semántica y contraste | Pasa automatización | axe-core sin violaciones para WCAG 2 A/AA y 2.1 A/AA en el flujo crítico                                |
| Teclado               | Pasa automatización | el primer foco es “Saltar al contenido principal”; el flujo usa controles nativos y orden DOM coherente |
| Foco visible          | Pasa implementación | indicador de foco de 3 px y traslado programático al plan y al resultado                                |
| Reflow al 200 %       | Pasa automatización | no hay overflow horizontal en el documento raíz al duplicar el zoom                                     |
| Estados               | Pasa revisión       | texto, iconografía/forma y atributos semánticos; ningún estado depende solo del color                   |
| Narrator              | Pendiente manual    | debe probarse en Windows con una persona antes de declarar lista la beta pública                        |

Resultado automatizado: cero hallazgos críticos, mayores o menores detectados.
Esto no equivale por sí solo a certificar conformidad WCAG completa.

## Decisiones incorporadas

- Landmarks, encabezados jerárquicos, skip link y regiones `status`/`alert`.
- Labels e instrucciones persistentes para todos los campos.
- Objetivos interactivos mínimos de 44×44 CSS px.
- Salidas del workspace mostradas como texto, nunca como HTML interpretado.
- Resultado M6 con outcome, memoria, provenance, uso/budget y checks en texto y
  listas semánticas.
- Layout adaptable sin ancho mínimo global y respeto de
  `prefers-reduced-motion`.
- Inicio y cancelación protegidos contra envíos duplicados.

## Gate manual previo a beta

Con Narrator activo, una persona debe confirmar:

1. que comprende workspace, intención, estrategia, pasos, policy y evaluación;
2. que el anuncio de ejecución/cancelación no se duplica ni interrumpe de forma
   confusa;
3. que puede revisar una aprobación sin perder contexto;
4. que el resultado y la evidencia se alcanzan y entienden solo con teclado.
