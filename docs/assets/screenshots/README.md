# Capturas verificables de la aplicación

Estas imágenes se generan sobre el build real de Electron con el Reference
Provider local y un workspace desechable. No contienen credenciales, tokens,
cuentas, rutas de usuario ni datos privados reales.

1. `01-mission-control.png`: entrada objetivo primero y estado del recorrido.
2. `02-objective-strategy-plan.png`: rutas comparadas, estrategia, plan y
   preflight.
3. `03-execution-approvals-progress.png`: aprobaciones de un uso, Runtime y
   progreso/evidencia.
4. `04-history-audit-evidence.png`: historial, auditoría y evidencia local.
5. `05-privacy-recovery.png`: controles de privacidad, retención, borrado,
   exportación y recuperación.
6. `06-provider-gates.png`: estados separados y honestos de proveedores; todos
   los externos permanecen no disponibles y bloqueados.

Se regeneran con `pnpm --filter @trivergence/desktop capture:docs`. No se
insertan automáticamente en el README público.
