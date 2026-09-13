# Release de Windows

Estado actual: preparación M7, **no distribuible**. El paquete local incluye
`UNSIGNED` en el nombre y el auto-update está deshabilitado.

No se publica una release hasta completar estos gates:

1. licencia y notices revisados;
2. threat model y compatibilidad de proveedores revalidados;
3. lockfile, SBOM, dependency review y CodeQL limpios o con excepciones
   documentadas;
4. lint, typecheck, tests y E2E en CI Windows;
5. instalación/upgrade/uninstall probados en Windows 10 y 11;
6. diagnóstico sin secretos y backup/restore ensayados;
7. binario firmado y checksum publicado por canal autenticado;
8. rollback documentado;
9. auto-update permanece apagado hasta verificar manifest firmado y rotación de
   claves.

Electron Builder 26.15.3/NSIS one-click por usuario es la ruta implementada. El
modo portable no está soportado.

## Secuencia reproducible

1. reconstruir con Node 24 y pnpm 11.19.0 usando
   `pnpm install --frozen-lockfile`;
2. ejecutar `pnpm check`, `pnpm e2e:desktop`, `pnpm smoke:desktop` y
   `pnpm audit`;
3. generar/validar SBOM con `pnpm sbom:generate` y `pnpm sbom:verify`;
4. generar paquete con `pnpm package:win`; nunca publica (`--publish never`);
5. crear/verificar hashes con `pnpm release:manifest` y `pnpm release:verify`;
6. ejecutar `pnpm package:win:repro`; cualquier diferencia de SHA-256 falla;
7. en Windows 10 y 11 limpios, ejecutar `tools/windows/verify-clean-machine.ps1`
   sin `-AllowUnsigned`, conservando salida, versión de SO y hashes.

`-AllowUnsigned` solo existe para desarrollo local y jamás satisface el gate de
release. El script rechaza digest distinto, firma inválida, instalación previa,
arranque fallido o desinstalación incompleta.

## Firma, update y rollback

- `forceCodeSigning` permanece `false` solo para permitir el paquete de ensayo;
  una release exige Authenticode `Valid` y editor esperado.
- el futuro manifest de update se verifica con Ed25519, clave fijada, URL HTTPS,
  host allowlist, versión ascendente, tamaño y SHA-256;
- no existe descarga ni aplicación automática en M7;
- antes de upgrade se crea un backup online validado; una restauración se
  prepara en staging, desplaza la base activa a una carpeta de rollback y solo
  se activa tras verificar SQLite y auditoría;
- los fallos de startup preservan bases ilegibles en cuarentena; nunca se borran
  automáticamente.

## Artefactos esperados

- instalador firmado;
- checksum SHA-256;
- SBOM;
- notas de release con migraciones, riesgos y matriz de CLI;
- notices de terceros;
- build provenance cuando la infraestructura lo permita.

No se automatizan publicación ni push desde una máquina de desarrollo.
