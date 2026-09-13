# ADR-0009: workflows, agentes y memoria como subsistemas coordinados

Estado: aceptado  
Fecha: 2026-09-10

## Contexto

M6 necesita un flujo compuesto útil y auditable sin depender de que Codex,
Claude o Gemini superen sus gates. También debe impedir que un agente o un
workflow se conviertan en una segunda autoridad paralela al Orchestration
Engine.

## Decisión

1. Modelar recall, equipo, síntesis, commit y evaluación como cinco capabilities
   versionadas con dependencias explícitas.
2. Mantener Strategy, Planner, Registry y Evaluation sin conocimiento especial
   de agentes, workflows, memoria o proveedores.
3. Ejecutar un equipo secuencial de tres roles sin acceso a Policy Engine,
   approvals, filesystem, procesos ni herramientas.
4. Usar una definición local fija y versionada con una única reparación
   opcional, limitada por un budget compartido.
5. Persistir memoria por workspace con TTL, borrado, digests y provenance; los
   eventos de auditoría no contienen contenido.
6. Dar a cada dispatcher solo copias profundas e inmutables de sus dependencias
   directas.
7. Permitir en M6 únicamente el Reference Provider local. Un adapter externo no
   hereda esta autorización.
8. Alojar los contratos específicos en un paquete separado y limitar cambios
   estables a extensiones aditivas justificadas de Runtime, IPC y audit events.

## Consecuencias

Positivas:

- el flujo completo se planifica y audita con mecanismos existentes;
- conectar un provider aprobado no requiere modificar el núcleo;
- budgets y provenance pueden verificarse en cada frontera;
- las aprobaciones siguen ligadas al plan íntegro y no a texto producido por un
  modelo;
- las pruebas son reproducibles, locales y sin credenciales.

Costes:

- el equipo M6 es secuencial y deliberadamente pequeño;
- la memoria semántica, embeddings y ranking quedan fuera;
- un cambio de workflow requiere una versión nueva;
- el contenido recordado es información funcional persistida y depende de la
  protección del perfil de Windows y del disco.

## Alternativas rechazadas

- **Agente supervisor como raíz:** duplicaría Strategy/Policy y permitiría que
  contenido no confiable alterase autoridad.
- **Workflow imperativo libre:** dificultaría preview, budgets y reproducción.
- **Un solo dispatcher monolítico:** ocultaría dependencias y reduciría la
  granularidad de approvals/evidencia.
- **Esperar un proveedor externo:** acoplaría M6 a decisiones contractuales
  ajenas al producto.
- **Guardar outputs completos en auditoría:** aumentaría exposición de datos y
  mezclaría evidencia con contenido funcional.
