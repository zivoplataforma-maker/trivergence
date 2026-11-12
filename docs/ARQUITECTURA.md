# Arquitectura

Monorepo pnpm con Turborepo, TypeScript 6.0.3 y Node.js 24 o posterior. El
escritorio 0.7.0 usa Electron 43.2.0, React 19.2.8 y Vite 8.2.0. Las versiones
transitivas están en `pnpm-lock.yaml`.

| Ruta                                                                             | Responsabilidad                                                |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/desktop`                                                                   | Proceso principal de Electron, preload, interfaz y empaquetado |
| `packages/contracts`, `packages/coordination-contracts`                          | Contratos y esquemas compartidos                               |
| `packages/orchestration-engine`, `packages/runtime`                              | Estrategia, planificación, evaluación y ejecución              |
| `packages/policy-engine`, `packages/provider-adapters`                           | Decisiones de política y frontera con proveedores              |
| `packages/persistence`                                                           | Estado SQLite, migraciones, recuperación y auditoría           |
| `packages/agents`, `packages/workflows`, `packages/memory`, `packages/workspace` | Perfiles, flujos, memoria y contexto del espacio de trabajo    |
| `tools`, `.github/workflows`                                                     | Verificación, empaquetado y CI                                 |

El objetivo llega desde la interfaz al proceso principal a través del preload.
La orquestación construye el plan y el runtime lo ejecuta según política y
aprobaciones. Los adaptadores encapsulan las rutas de proveedor y persistencia
registra estados y evidencia. Consultá el
[diseño detallado](architecture/overview.md) para los límites entre componentes.
