# Preparación para GitHub y CI Windows

El repositorio local usa `main` y ya tiene `origin` en GitHub. La versión base
está publicada; los cambios de interfaz y configuración de proveedores de
2026-09-14 permanecen locales hasta una autorización posterior para hacer push.
La identidad de autor del commit procede de la configuración Git del usuario.

## Contenido versionado

Se incluyen código fuente, pruebas, documentación, configuración de build/CI,
lockfile, parches de dependencias y los scripts fuente de `tools/release`. Se
excluyen dependencias instaladas, builds, instaladores, SBOM generado, informes
locales, cachés, configuración de asistentes/editores, bases de datos, archivos
de entorno y material de autenticación/firma. `.gitignore` es la fuente de las
exclusiones; los archivos locales se conservan en disco.

## CI Windows en GitHub

El workflow `Windows fresh gates` está versionado. Al publicar un commit nuevo
en `origin/main`, GitHub ejecutará el job `p0`; también puede iniciarse desde
`workflow_dispatch`. Hasta entonces, la verificación de estos cambios es local.
La organización necesita runners Windows disponibles, cuota de Actions y acceso
saliente a npm y a la descarga de Electron. La protección de `main` con el check
`p0` queda sujeta a la configuración disponible de la cuenta/repositorio.

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
de GitHub. M5 y M7 conservan sus gates independientes. La licencia Apache-2.0
del código original y los notices del repositorio están presentes. La revisión
de obligaciones de las dependencias empaquetadas sigue pendiente para M7.
