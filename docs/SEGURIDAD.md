# Seguridad y datos

La política y las aprobaciones delimitan las acciones del runtime. Las rutas de
proveedor requieren sus propios controles de confianza. Conservá la frontera de
IPC entre la interfaz y el proceso principal de Electron y validá los datos
cuando crucen esa frontera.

Los perfiles y preferencias locales, credenciales, bases SQLite, archivos de
entorno, claves de firma y artefactos de empaquetado quedan fuera de Git. Revisá
también archivos ya rastreados y commits históricos antes de mover el
repositorio. La búsqueda por patrones cubre formatos conocidos. Una credencial
expuesta requiere revocación o rotación y revisión del historial afectado.

Las rutas externas pueden transferir contexto del proyecto. Revisá el alcance de
los datos y el consentimiento antes de habilitarlas. Consultá la
[política del proyecto](../SECURITY.md), el [aviso de privacidad](privacy.md) y
el [diseño de seguridad](security/).

En esta revisión se buscaron nombres de archivos sensibles, encabezados de
claves privadas y formatos conocidos de tokens en archivos rastreados, archivos
nuevos no ignorados y cambios históricos accesibles por referencias Git locales.
La búsqueda no arrojó coincidencias. Tampoco se detectaron archivos rastreados
de 5 MB o más en HEAD. Los formatos de credenciales propios de otros servicios
quedan fuera de esta comprobación por patrones.
