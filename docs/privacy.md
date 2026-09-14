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
- historial de estrategias y estados por workspace; en modo estándar se guarda
  el objetivo, mientras que en modo privado solo queda un marcador;
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
  Runtime vuelve a rechazarlas antes de los efectos; el texto del objetivo y los
  argumentos de los pasos no se persisten en nuevas solicitudes privadas; el
  workflow no recupera memoria guardada y su resultado de memoria es temporal;
- exclusiones obligatorias y configurables;
- vista previa de contexto saliente;
- retención configurable de 1 a 365 días para los registros activos de cada
  workspace, aplicada al guardar y al volver a abrirlo;
- borrado confirmado de registros activos por workspace, con borrado efectivo
  del contenido y provenance de memoria eliminada o expirada;
- exportación JSON de registros activos y auditoría vinculada mediante un
  diálogo de guardado explícito;
- diagnóstico sanitizado y voluntario.

## Limitaciones

El modo privado no cifra la base local ni oculta todos los metadatos del plan:
identificadores, hashes, fechas, rutas o resúmenes de evidencia pueden revelar
información. Las solicitudes antiguas conservan el objetivo que ya tenían. El
borrado no elimina los eventos append-only de auditoría (identificadores y
hashes), backups, cuarentenas, archivos exportados ni copias externas. SQLite
usa `secure_delete`, pero no se promete borrado forense en discos SSD, snapshots
del sistema o backups. La exportación contiene datos sensibles y debe
custodiarse. Trivergence no puede controlar la retención de una CLI externa si
se habilita en el futuro; actualmente no hay proveedores externos ejecutables.
