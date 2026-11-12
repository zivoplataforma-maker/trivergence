# Pruebas y validación

| Comando              | Cobertura                                              |
| -------------------- | ------------------------------------------------------ |
| `pnpm check:fresh`   | Formato, lint, compilación, tipos y Vitest por paquete |
| `pnpm test:fresh`    | Suites Vitest de los paquetes y del escritorio         |
| `pnpm smoke:desktop` | Arranque de Electron después de compilar               |
| `pnpm e2e:desktop`   | Recorridos del escritorio con compilación previa       |
| `pnpm security`      | Auditoría de dependencias y verificación del SBOM      |

La instalación congelada sin red, con Node.js 26.13.0 y pnpm 11.19.0, devolvió
`EPERM` cuando pnpm intentó registrar el proyecto con un enlace simbólico en
Windows. Esto deja pendiente la instalación limpia.

Los cambios locales agregan suites de deliberación en
`packages/orchestration-engine/src/deliberation.test.ts` y
`packages/runtime/src/deliberative-strategy-runtime.test.ts`. Los resultados
deben indicar si corresponden al árbol local o al commit compartido.

## Hallazgos del árbol local

Vitest cubrió los 12 proyectos con suites mediante varias ejecuciones. El total,
contando cada proyecto una vez, fue de 330 aprobados y 18 fallidos. La ejecución
recursiva inicial se detuvo en orquestación y los paquetes restantes se
corrieron por separado.

- Prettier señaló 11 archivos del trabajo funcional preexistente. Los Markdown
  alcanzados por la configuración de Prettier pasaron su revisión por separado.
  Los enlaces relativos de los 13 Markdown se comprobaron en el sistema de
  archivos.
- La primera ejecución de Vitest en orquestación devolvió 101 casos aprobados y
  9 fallidos. Los fallos afectan la identidad del snapshot de Registry, la
  clasificación de propuestas sin evidencia y el uso de valores indefinidos al
  serializar decisiones como JSON canónico.

- La compilación y la comprobación de tipos de todos los paquetes y escritorio
  pasaron con las dependencias instaladas y la comprobación automática de
  instalación de pnpm desactivada para esa ejecución.
- ESLint devolvió tres errores en archivos locales de deliberación, por un
  import sin uso y dos declaraciones de importación de tipos.
- Vitest en runtime devolvió 99 casos aprobados y 8 fallidos. Siete corresponden
  a deliberación, principalmente a JSON canónico y a la validación del plan con
  cero participantes. El octavo no confirmó la terminación del árbol de procesos
  en Windows.
- Workspace devolvió 10 casos aprobados y 1 fallido. El caso que verifica
  enlaces hacia fuera del workspace recibió `EPERM` al crear el enlace simbólico
  de prueba.
- Los scripts de Electron E2E y smoke finalizaron con código 1, sin un
  diagnóstico visible. Smoke se repitió con logging habilitado y devolvió el
  mismo código.
- El verificador del SBOM local existente aprobó 451 componentes.
- La consulta de avisos de vulnerabilidades de pnpm devolvió un error de red. La
  instalación limpia y la auditoría en línea quedan pendientes.
