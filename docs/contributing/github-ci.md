# Preparación para GitHub y CI Windows

El repositorio local usa `main`. No se ha creado ni publicado un remoto. La
identidad de autor del commit procede de la configuración Git del usuario.

## Contenido versionado

Se incluyen código fuente, pruebas, documentación, configuración de build/CI,
lockfile, parches de dependencias y los scripts fuente de `tools/release`. Se
excluyen dependencias instaladas, builds, instaladores, SBOM generado, informes
locales, cachés, configuración de asistentes/editores, bases de datos, archivos
de entorno y material de autenticación/firma. `.gitignore` es la fuente de las
exclusiones; los archivos locales se conservan en disco.

## Activar la CI cuando se autorice publicar

1. Crear un repositorio GitHub vacío bajo la cuenta u organización elegida, con
   la visibilidad acordada. Evitar generar README, licencia o commit remoto
   inicial para conservar esta historia local.
2. Añadir su URL como `origin` y publicar `main` con una cuenta autorizada.
3. Habilitar GitHub Actions y permitir `actions/checkout`, `actions/setup-node`
   y runners hospedados Windows. La organización necesita cuota/disponibilidad
   de minutos de Actions y acceso saliente a npm y a la descarga de Electron.
4. Revisar la ejecución `Windows fresh gates`, job `p0`. También se puede
   iniciar desde `workflow_dispatch` una vez publicado el workflow.
5. Después del primer éxito, configurar protección de `main` con el check `p0`
   requerido, según las opciones disponibles para esa cuenta/repositorio.

El workflow instala Node 24 y pnpm 11.19.0, usa el lockfile congelado y ejecuta
formato, lint, tipos, tests y build sin Turbo cache, E2E y smoke de Electron,
generación/verificación del SBOM y auditoría de dependencias. No usa caché de
Actions. Solo solicita `contents: read`; checkout recibe el token automático de
GitHub. No requiere API keys, secretos de proveedores ni certificado de firma.
No empaqueta ni publica una release y no activa proveedores externos.

El gate compila los paquetes antes del chequeo de tipos y los tests: las
dependencias internas publican sus contratos desde `dist`, que no existe en un
checkout nuevo. Este orden permite validar sin builds previos del equipo.

Los gates locales de un commit no sustituyen la ejecución observada en el runner
de GitHub. M5 y M7 conservan sus gates independientes. Antes de publicar el
código como proyecto público sigue pendiente formalizar licencia/notices; el
borrador actual no concede una licencia de código abierto.
