# Límites de credenciales

## Regla principal

Trivergence no es un broker de identidad. No solicita, observa, copia, importa,
exporta, registra ni persiste secretos de autenticación de Codex, Claude Code,
Gemini CLI, Ollama remoto, Git, navegador o MCP.

## Permitido

- resolver si el ejecutable oficial está disponible;
- ejecutar un comando oficial de estado que no revele credenciales;
- interpretar código de salida y campos explícitamente no sensibles;
- iniciar una terminal visible para que el usuario interactúe con la CLI
  oficial;
- abrir una URL HTTPS oficial preconfigurada tras validación, cuando la
  documentación lo requiera;
- borrar únicamente metadatos propios de Trivergence.

## Prohibido

- leer `auth.json`, `.credentials.json`, keychains, Credential Manager o tokens
  MCP de otras apps;
- inspeccionar variables de entorno de forma masiva para “detectar” claves;
- capturar códigos OAuth, cookies, cabeceras Authorization o clipboard durante
  login;
- copiar un cache de autenticación entre entornos;
- inyectar credenciales en un proceso;
- mostrar el login de un proveedor en webview propio;
- ofrecer login de suscripción cuando el proveedor no autoriza a terceros;
- incluir stdout/stderr crudos de auth en diagnóstico.

## Entorno de procesos

Los procesos reciben una allowlist mínima. Variables conocidas por contener
secretos se eliminan por defecto en detección y diagnósticos. Para una ejecución
oficial que dependa del entorno del usuario, Trivergence muestra que heredará
variables sensibles pero no sus valores y exige una política explícita; esta
capacidad no es P0.

## Logs y errores

La sanitización ocurre antes del logger y nuevamente en exportación. Se redactan
patrones de tokens, rutas de perfiles cuando no son necesarias, query strings y
variables sensibles. El dato original no se conserva “para depurar”. Los tests
usan secretos canario y verifican ausencia en logs.

## Login por proveedor

- **Codex candidato:** el App Server controla browser/device login y renovación;
  Trivergence solo consume estado no sensible y nunca lee `auth.json`. Access
  tokens Business/Enterprise requieren un gate y boundary separados.
- **Claude candidato:** `ant auth login` controla OAuth de Claude Console. El
  proceso oficial conserva el token; Trivergence no imprime ni copia
  credenciales. Claude Code Free/Pro/Max solo puede abrirse como sesión externa
  humana y nunca se automatiza.
- **Gemini CLI:** su login Google puede usarse dentro de la CLI oficial por una
  persona, pero Trivergence no reutiliza tokens, caché, client ID ni backend.
- **Gemini Vertex candidato:** OAuth/ADC/IAM es técnicamente oficial, pero su
  SDK requiere una frontera de credenciales distinta. La arquitectura actual lo
  bloquea hasta un ADR que preserve aislamiento y defina custodia, revocación y
  vault sin exponer tokens al núcleo.

Estos comandos y límites se revalidan en cada release.

## Incidente

Si se detecta que una versión imprime un secreto en status/logs, se deshabilita
esa operación en la matriz, se muestra un aviso local y se redactan diagnósticos
históricos cuando sea posible. No se transmite el incidente automáticamente.
