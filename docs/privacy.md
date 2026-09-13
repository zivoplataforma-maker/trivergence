# Privacidad

## Compromiso

Trivergence almacena sus datos localmente y no opera un backend propio ni
telemetría por defecto. Actualmente solo se ejecuta el Reference Provider local:
Codex, Claude y Gemini siguen bloqueados. Un futuro proveedor cloud, una vez
aprobado su gate, podría recibir el contexto seleccionado bajo los términos de
la cuenta correspondiente; hoy no existe esa transferencia.

## Datos locales

- configuración y workspaces;
- decisiones, aprobaciones y auditoría;
- historial de objetivos, estrategia y estados por workspace (sin outputs en la
  respuesta de historial);
- conversaciones, notas e índices cuando esas funciones se habiliten;
- diagnósticos y logs sanitizados;
- backups elegidos por el usuario.

La documentación de esquema y retención está en
`docs/architecture/data-model.md`.

## Datos que Trivergence no recopila

- claves API, OAuth tokens, cookies o credenciales de CLI;
- historial de navegador;
- contenido fuera de workspaces autorizados;
- telemetría remota propia;
- razonamiento interno privado de modelos.

## Controles

- modo privado por defecto: Strategy descarta rutas con capacidades de red y
  Runtime vuelve a rechazarlas antes de los efectos;
- exclusiones obligatorias y configurables;
- vista previa de contexto saliente;
- borrado/retención acotada de memoria M6; exportación general y retención
  configurable de outputs siguen pendientes;
- diagnóstico sanitizado y voluntario.

## Limitaciones

El historial persiste el texto del objetivo y puede contener datos sensibles que
el usuario escriba allí. El modo privado no cifra la base local. La redacción
automática no garantiza detectar todos los secretos. El usuario debe revisar el
contexto. Trivergence tampoco puede controlar cómo una CLI externa conserva
datos una vez enviados; la UI enlaza la política oficial aplicable sin afirmar
qué plan está activo.
