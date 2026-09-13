# Contribuir a Trivergence

El proyecto todavía no acepta contribuciones externas: está en foundation y aún
no tiene licencia formal. Las pautas siguientes gobiernan el trabajo local y se
abrirán al público antes de la beta.

## Reglas

- Empieza por un requisito y criterio de aceptación documentado.
- No accedas ni incluyas credenciales reales en fixtures, logs o capturas.
- No amplíes permisos para hacer pasar una prueba.
- Toda nueva tool declara esquema, riesgo, timeout, cancelación, logs y pruebas.
- Toda capacidad de proveedor incluye fuente oficial, fecha, rango de versión y
  degradación.
- Una función incompleta se marca como tal; no se oculta tras un botón.
- Cambios de arquitectura requieren ADR.

## Quality gate

Cuando M1 esté activo, cada cambio deberá pasar format, lint, typecheck,
unitarios y las pruebas de integración aplicables. El README documentará solo
comandos ejecutados con éxito.

Consulta [desarrollo Windows](docs/contributing/windows-development.md) y
[releases](docs/contributing/releasing.md).
