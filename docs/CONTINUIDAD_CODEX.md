# Continuidad en Codex Cloud

1. Conectá el repositorio privado cuando el destino esté resuelto y seleccioná
   la rama auditada.
2. Configurá Node.js 24 o posterior y pnpm 11.19.0. Corré
   `pnpm install --frozen-lockfile` en la raíz.
3. Leé [AGENTS.md](../AGENTS.md), [estado actual](ESTADO_ACTUAL.md) y
   [roadmap](ROADMAP.md). Usá `pnpm check:fresh` y registrá el comando exacto de
   cada verificación.
4. Para el primer cambio funcional, revisá la deliberación P3. Verificá
   contratos, decisiones, artefactos y persistencia antes de ampliar el flujo de
   escritorio. El trabajo local requiere su propio commit antes de aparecer en
   Cloud.
5. Reservá el arranque de Electron, E2E de escritorio y empaquetado NSIS para un
   entorno Windows apropiado. Registrá las rutas externas y verificaciones que
   requieran autorización, credenciales o acceso de red.

El entorno de Codex Cloud aún debe configurarse y probarse desde el repositorio
privado.
