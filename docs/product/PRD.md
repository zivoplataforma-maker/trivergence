# PRD — Trivergence MVP

Estado: borrador 0.2  
Propietario: proyecto Trivergence  
Horizonte: MVP; sin fecha comprometida

## Problema

Las personas combinan herramientas, agentes, proveedores, memoria y procesos
locales sin una autoridad común que explique por qué se eligió un enfoque, qué
capacidades requiere, en qué orden debe operar y si el resultado es aceptable.
El problema no es la falta de otro IDE o de otra IA: es la falta de orquestación
trazable entre subsistemas heterogéneos.

Trivergence resuelve ese vacío con un motor independiente del proveedor que
convierte una intención en estrategia, plan, evaluación y evidencia, sin
sustituir ni extraer credenciales de las herramientas oficiales.

La hipótesis todavía no está respaldada por investigación de usuarios; el MVP
debe validar tanto el problema como la solución.

## Usuarios prioritarios

- **Desarrollador individual en Windows:** usa uno o más asistentes CLI y
  trabaja con repositorios locales.
- **Mantenedor consciente de seguridad:** necesita revisar acciones, diffs y
  evidencia antes de aceptar cambios.

Administración empresarial, equipos compartidos y ejecución remota quedan fuera
del MVP.

## Objetivos

1. Al menos 90% de participantes de una prueba guiada completa el flujo seguro
   de solo lectura sin ayuda en menos de 5 minutos.
2. El 100% de acciones privilegiadas del flujo MVP tiene decisión de política y
   evento de auditoría correlacionados.
3. Ninguna prueba de seguridad del MVP demuestra acceso del renderer a Node,
   filesystem, shell o credenciales.
4. Ante una versión de CLI desconocida, el 100% de conectores probados degrada a
   interactivo o deshabilitado sin interpretar la salida como compatible.
5. La aplicación arranca y permite el flujo local cuando no hay ninguna CLI
   instalada.
6. El 100% de previews del MVP identifica versión de estrategia, orden de pasos,
   capacidades, decisiones de política y estado de evaluación.

## No objetivos

- Reemplazar la UI o autenticación de Codex, Claude Code o Gemini CLI.
- Convertirse en un IDE, un modelo fundacional o una interfaz de chat que oculte
  la estrategia y el plan.
- Proveer acceso a modelos o eludir precios, cuotas, términos o controles del
  proveedor.
- Completar edición avanzada, memoria, MCP, consejo multiagente y marketplace en
  el MVP.
- Prometer aislamiento fuerte en el host de Windows sin WSL2, contenedor o
  mecanismo comprobado.
- Sincronización entre dispositivos, colaboración en tiempo real o cuentas
  Trivergence.

## Historias de usuario P0

### Desarrollador individual

- Como desarrollador, quiero expresar un objetivo y ver la estrategia y el plan
  antes de ejecutar para entender cómo Trivergence coordinará los subsistemas.
- Como desarrollador, quiero saber qué capacidades faltan o están degradadas
  para no confundir un plan imposible con un error genérico.
- Como desarrollador, quiero abrir una carpeta y ver su ruta canónica y límites
  para saber dónde puede operar la aplicación.
- Como desarrollador, quiero ver qué CLI están disponibles y qué capacidades
  verificadas ofrecen para no asumir compatibilidad.
- Como desarrollador, quiero ejecutar una inspección de solo lectura y ver su
  resultado limitado para entender el proyecto sin conceder escritura.
- Como desarrollador, quiero ver qué archivos se compartirían con qué proveedor
  antes de ejecutar para controlar la salida de datos.
- Como desarrollador, quiero cancelar una tarea y confirmar su estado terminal
  para recuperar el control.
- Como desarrollador, quiero escribir primero mi objetivo y comparar rutas
  propuestas antes de aprobar un plan, sin tener que escoger un proveedor.
- Como desarrollador, quiero ver historial local, integridad/recuperación y
  privacidad para entender qué quedó registrado y si es seguro ejecutar.

### Mantenedor consciente de seguridad

- Como mantenedor, quiero revisar acción, argumentos, directorio, entorno
  permitido y riesgo antes de aprobar para detectar desviaciones.
- Como mantenedor, quiero que una aprobación no sea reutilizable si cambia la
  solicitud.
- Como mantenedor, quiero exportar un diagnóstico sanitizado para investigar
  fallos sin revelar secretos.
- Como mantenedor, quiero consultar el historial de acciones aunque elimine la
  conversación.

## Requisitos

### P0 — debe existir para el MVP

| ID    | Requisito                     | Aceptación resumida                                                                                                                   |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P0-01 | Orchestration Engine          | Expone Strategy Engine, Execution Planner, Capability Registry y Evaluation Engine como núcleo independiente de UI y Runtime.         |
| P0-02 | Preview de orquestación       | Una intención válida produce estrategia versionada, DAG acíclico, decisiones por paso y evaluación; no causa efectos.                 |
| P0-03 | Capability Registry           | Capacidades versionadas declaran subsistema, estado, modalidad, acción y dependencias; duplicados, faltantes y ciclos fallan cerrado. |
| P0-04 | Shell Electron aislado        | `nodeIntegration=false`, `contextIsolation=true`, sandbox activo, CSP, navegación y nuevas ventanas denegadas por defecto.            |
| P0-05 | Workspace canónico            | Rechaza archivo como raíz, resuelve ruta, detecta junction/symlink escape y nunca escribe fuera sin aprobación obligatoria.           |
| P0-06 | Policy engine puro            | Para la misma solicitud y reglas produce la misma decisión, motivo y regla; suite de tabla cubre perfiles y riesgos.                  |
| P0-07 | Aprobación ligada a solicitud | Hash canónico, expiración y uso único; una mutación invalida la aprobación.                                                           |
| P0-08 | Ejecutor limitado             | Ejecuta únicamente pasos autorizados; argv/cwd/env tipados, timeout, límite de salida y cancelación.                                  |
| P0-09 | Auditoría local               | Intención, estrategia, plan, evaluación, decisiones y resultados quedan correlacionados; fallo privilegiado cierra el flujo.          |
| P0-10 | Detección de proveedor        | Solo comandos documentados, sin leer credenciales; su evidencia alimenta el Registry y no habilita ejecución por sí sola.             |
| P0-11 | Modo privado                  | Impide toda ejecución de proveedor cloud y todo fetch de red; Ollama sigue siendo opcional.                                           |
| P0-12 | Persistencia                  | Migraciones atómicas, foreign keys, backup consistente y restauración ensayada.                                                       |
| P0-13 | Accesibilidad                 | Flujo principal solo con teclado, foco visible, nombres accesibles y contraste AA automatizado/manual.                                |
| P0-14 | Flujo vertical                | Intención → estrategia → plan → evaluación → ejecución segura → evidencia, cubierto por E2E.                                          |
| P0-15 | Coordinación local compuesta  | Equipo acotado → workflow versionado → memoria con TTL → evaluación auditable, sin autoridad fuera del plan ni provider externo.      |
| P0-16 | Objetivo y rutas explicables  | Strategy genera, compara y selecciona rutas del Registry; muestra candidatas, incompatibilidades y privacidad sin ejecutar.           |
| P0-17 | Evaluación posterior          | Run y evidencias se correlacionan con plan/snapshot/digest y se auditan por separado del preflight.                                   |
| P0-18 | Historial y recuperación UI   | Historial limitado al workspace, sin output crudo; estado de persistencia y recuperación visibles.                                    |

### P1 — siguiente incremento

M6 entrega ya la referencia local de workflows, agentes y memoria. La expansión
de estas capacidades permanece condicionada a budgets, provenance y threat
review por definición/version.

- Editor de texto y diff con guardado mediado por políticas.
- Terminal integrada visible con límites y aviso de confianza.
- Conversaciones, notas, tareas y FTS5.
- Git status/diff y ramas de trabajo sin commits automáticos.
- Primer conector estructurado: Codex App Server como candidato condicionado,
  solo tras gate contractual/legal, attestation de versión y fixtures.
- Claude Platform `ant` y Gemini Vertex como candidatos posteriores con gates
  independientes; nunca reutilizar OAuth de Claude Code o Gemini CLI.
- MCP con servidores desactivados por defecto.

### P2 — consideración futura

- Capacidades avanzadas o proveedores adicionales únicamente mediante canales
  oficiales aprobados para el caso de uso exacto.
- consejo multiagente/paralelo, memoria jerárquica, documentos/PDF, embeddings y
  sincronización opcional.

## Métricas

No se envía telemetría. El MVP calcula métricas locales y permite exportación
voluntaria.

### Indicadores tempranos

- tasa de finalización del onboarding;
- tiempo hasta primera inspección exitosa;
- tasa de acciones canceladas, denegadas y aprobadas;
- errores por conector y versión;
- porcentaje de sesiones útiles sin proveedor.

### Indicadores posteriores

- usuarios de prueba que vuelven en 14 días;
- reducción autodeclarada de cambios no entendidos;
- incidentes de seguridad confirmados;
- tasa de recuperación exitosa de backup.

No hay baseline. Los objetivos de adopción se revisarán tras 10–15 entrevistas y
5 pruebas de usabilidad.

## Preguntas abiertas

- **Bloqueante, legal:** ¿el uso de cada CLI desde una interfaz orquestadora
  está permitido para cada tipo de cuenta? Responsable: asesoría
  legal/proveedor.
- **Bloqueante, ingeniería:** ¿qué mecanismo Windows garantizará cancelación de
  descendientes en el binario distribuido? Responsable: ingeniería.
- **No bloqueante, producto:** ¿los usuarios valoran más auditoría, comparación
  o memoria? Responsable: investigación.
- **No bloqueante, diseño:** ¿qué densidad y disposición funciona en pantallas
  de 1366×768? Responsable: diseño/usabilidad.
- **Bloqueante antes de release:** ¿“Trivergence” está disponible como nombre y
  marca en mercados objetivo? Responsable: legal.

## Fases

El orden y las puertas de salida están en `ROADMAP.md`. No hay fecha fija hasta
completar el spike de módulos nativos, cancelación Windows y validación jurídica
de conectores.
