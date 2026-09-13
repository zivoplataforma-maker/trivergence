# Política de seguridad

Trivergence está en desarrollo temprano y no debe usarse todavía para ejecutar
acciones sobre datos de producción.

## Reporte

Hasta que exista un canal privado publicado, no abras un issue con secretos,
credenciales, datos personales o una prueba de explotación completa. Conserva la
evidencia local y contacta al mantenedor por un canal privado acordado. Esta
sección se actualizará antes de hacer público el repositorio.

## Alcance inicial

Son prioritarios: escape del workspace, command injection, bypass de aprobación,
acceso del renderer al host, fuga de secretos, persistencia de procesos y cadena
de suministro.

No se ofrece bug bounty ni SLA actualmente. Consulta el
[threat model](docs/security/threat-model.md) para límites y riesgos residuales.
El hardening específico de archivos, persistencia, instalador y update está en
[threat model M7](docs/security/threat-model-m7.md).
