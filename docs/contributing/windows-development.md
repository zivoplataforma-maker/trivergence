# Desarrollo en Windows

## Baseline observado

- Windows 11;
- PowerShell 5.1;
- Node 24.14.0;
- pnpm 11.9.0;
- Git 2.53.0.

Node y pnpm exactos se fijarán antes de release. SQLite usa el API integrado de
Node según ADR-0003; `node-pty` continúa siendo el futuro módulo nativo a
validar. No cambies la execution policy de PowerShell como requisito del
proyecto.

## Reglas de compatibilidad

- probar rutas con espacios, Unicode, nombres largos y distintas mayúsculas;
- no usar strings de shell para filesystem o procesos;
- rutas UNC, device paths y Alternate Data Streams quedan denegadas en P0;
- detectar PowerShell 7, pero soportar 5.1 para scripts no interactivos del
  proyecto;
- usar ConPTY mediante dependencia mantenida para terminal P1;
- no requerir WSL2, Docker o permisos administrativos para arrancar.

## Módulos nativos

Electron, Node, `node:sqlite`, futuros módulos nativos como `node-pty` y el
empaquetador deben probarse como conjunto. El CI hará smoke test del binario
empaquetado; que los unitarios funcionen con Node del sistema no es evidencia
suficiente.

## Comandos

Desde la raíz:

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:desktop
pnpm --filter @trivergence/desktop start
```

Los primeros siete comandos fueron verificados en el entorno baseline. `start`
usa los mismos artefactos que el smoke pero deja la ventana abierta. No se
requiere cambiar la execution policy de PowerShell.

Las pruebas de `@trivergence/runtime` crean y terminan procesos hijos reales. En
runners con aislamiento de procesos deben ejecutarse en un worker Windows que
permita `taskkill /T`; un timeout causado por el sandbox no sustituye esa
validación.
