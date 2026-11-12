# Compilación y distribución

Desde la raíz, usá Node.js 24 o posterior y pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm check:fresh
pnpm --filter @trivergence/desktop start
```

El último comando abre Electron después de compilar. En Windows,
`pnpm package:win` construye el instalador NSIS x64 con publicación automática
deshabilitada. `pnpm package:win:repro`, `pnpm release:manifest` y
`pnpm release:verify` pertenecen al flujo de verificación de artefactos. Revisá
los [workflows](../.github/workflows/) para las condiciones de CI y release.

El arranque base no requiere Android SDK, backend desplegado ni un archivo
`.env`. Las integraciones y la firma tienen requisitos propios. Un entorno sin
escritorio sirve para validar paquetes y debe delegar la prueba del instalador y
la interfaz a Windows.
