# Threat model M7 — hardening y distribución Windows

Fecha de corte: 2026-09-11. Este documento amplía el threat model general; no
autoriza proveedores externos ni auto-update.

## Activos y fronteras

- contenido y metadatos del workspace;
- base SQLite, WAL, backups, journals y cuarentenas;
- `app.asar`, instalador NSIS, SBOM, checksums y futuro manifest de update;
- máquina de build, caché de paquetes, certificado y clave Ed25519 de release.

El workspace, `userData`, la máquina de build y el canal de descarga son
fronteras distintas. Ningún nombre notificado por el watcher, manifest remoto o
archivo restaurado se considera confiable por su procedencia.

## Amenazas y controles

| Amenaza                                                    | Control implementado                                                                                                                              | Riesgo residual / gate                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| TOCTOU, symlink, junction o hardlink durante una escritura | snapshot SHA-256, revalidación de raíz/padre/target, rechazo de links, temp en el mismo directorio, `fsync`, rename y verificación posterior      | el escritor aún no es una capability de producto                                          |
| tormenta o path hostil desde `fs.watch`                    | normalización, exclusiones obligatorias, debounce, cola máxima y evento `overflow`; fallos del consumidor aislados                                | backend recursivo depende de Windows; otros SO requieren implementación propia            |
| caída entre preparación y commit                           | journal con SHA-256 no autenticado fuera del workspace; detecta corrupción accidental y recovery/rollback comprueban el digest del archivo actual | un actor con escritura en `userData` puede reescribir journal y hash; no hay MAC ni firma |
| SQLite ilegible o audit chain alterada                     | `quick_check`, recovery read-only, cuarentena física con hashes; base nueva solo tras preservar los bytes                                         | la recuperación funcional de datos requiere elección humana de backup                     |
| backup corrupto o rollback parcial                         | manifest SHA-256, `quick_check`, cadena de auditoría, staging y activación por rename; base desplazada preservada                                 | no ejecutar con un writer activo; el filesystem debe soportar rename atómico              |
| sustitución de instalador/update o downgrade               | manifest Ed25519 canónico, key id fijado, HTTPS/host allowlist, versión monótona, tamaño y SHA-256                                                | actualización externa permanece deshabilitada hasta firma y hosting aprobados             |
| ejecución de Electron como Node o carga fuera de ASAR      | fuses deshabilitan RunAsNode, NODE_OPTIONS/inspect; integridad ASAR y carga exclusiva desde ASAR                                                  | requiere comprobar fuses nuevamente en cada release firmada                               |
| dependencia maliciosa o build no repetible                 | lockfile, edad mínima, allowlist de scripts, SBOM CycloneDX, audit y comparación byte a byte                                                      | revisión de licencia/notices y CI independiente siguen pendientes                         |
| binario sin editor autenticado                             | nombre `UNSIGNED`, verificación de Authenticode en el script de máquina limpia                                                                    | bloqueante absoluto para distribución pública                                             |

## Política fail-closed

Un journal corrupto por accidente o con digest no coincidente, contenido
inesperado durante recovery, backup inválido, manifest sin firma válida, host no
permitido, downgrade, digest/tamaño distinto o firma Authenticode no válida
aborta la operación. Trivergence no descarga ni aplica updates en M7: solo
existe el verificador puro y testeado.

El journal no ofrece autenticidad frente a un atacante con acceso de escritura a
`userData`: SHA-256 sin secreto solo comprueba consistencia. No se utiliza para
autorizar una escritura de producto ni se presenta como protección
antifalsificación.

## Evidencia requerida para cerrar M7

Además de los gates locales se necesitan resultados conservados de Windows 10 y
11 limpios, firma válida con identidad aprobada, segunda máquina/runner que
reproduzca hashes, licencia/notices revisados y un ensayo de upgrade/rollback de
una release firmada. Sin todos esos elementos M7 permanece `PARTIAL`.
