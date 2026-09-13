# ADR-0010 — Hardening de archivos y gates de distribución Windows

Estado: aceptado para preparación M7, 2026-09-11.

## Contexto

El Orchestration Engine coordinará subsistemas capaces de observar y, después de
aprobación, modificar estado. La distribución Windows agrega otras fronteras:
filesystem, base local, instalador, cadena de suministro y canal de update.

## Decisión

1. El watcher solo notifica rutas normalizadas, aplica exclusiones, debounce y
   cola acotada; un estado incierto se expresa como `overflow`.
2. Toda futura escritura de workspace usa snapshot SHA-256, journal fuera del
   workspace, temp en el mismo directorio, flush, revalidación y rename.
   Recovery o rollback se niegan si el target ya no coincide.
3. Persistencia distingue corrupción legible (recovery read-only) de base
   ilegible; esta última se mueve con WAL/SHM a cuarentena antes de reiniciar.
4. Backup y rollback se validan y activan por staging, conservando la base
   reemplazada.
5. Windows se empaqueta como ASAR con fuses restrictivos y NSIS x64 por usuario.
   Los paquetes sin Authenticode llevan `UNSIGNED` y no pueden publicarse.
6. El SBOM procede del lockfile nativo de pnpm. Los artefactos tienen manifest
   de hashes y un gate compara dos builds.
7. El update es un contrato de verificación desconectado: Ed25519 + HTTPS + host
   allowlist + anti-downgrade + hash/tamaño. No se habilita transporte.

## Consecuencias

No se añaden capabilities, pantallas ni proveedores. El coste es mayor I/O y
evidencia adicional. M7 no puede cerrarse desde una sola máquina sin
certificado: requiere firma, builds independientes y matriz Windows limpia.
