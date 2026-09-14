# Configuración de proveedores sin API keys

## Alcance

La configuración es preparación local, no una conexión. ChatGPT/Codex, Gemini,
Claude y Ollama aparecen como candidatos; ninguno se registra en AdapterHost.
Reference Provider sigue siendo la única implementación ejecutable. No cambia el
Orchestration Engine ni sus contratos de ejecución, budgets o aprobaciones. M5 y
M7 permanecen PARTIAL.

## Separación de responsabilidades

Renderer → IPC nominal → ProviderConfigurationService → preferencias locales.
Este camino no tiene acceso a adaptadores, clientes de red, almacenes de
credenciales o escritura de attestations. Los nuevos contratos son aditivos.

| Dimensión     | Evidencia actual                                         | No implica                                  |
| ------------- | -------------------------------------------------------- | ------------------------------------------- |
| Instalación   | Búsqueda existente de ejecutable en PATH, sin ejecutarlo | Versión compatible o identidad autenticada  |
| Autenticación | Sin comprobar; Ollama local no requiere cuenta           | Permiso contractual o gate aprobado         |
| Gate          | Pendiente en los cuatro candidatos                       | Un login o preferencia no puede autorizarlo |
| Ejecución     | Deshabilitada en los cuatro candidatos                   | Guardar no registra capacidades             |
| Bloqueo       | Razones independientes visibles                          | No es un fallo de contraseña                |

Los estados autenticado/autorizado están representados en el contrato de
respuesta para la evolución posterior, pero no hay un setter ni IPC que los
acepte. El servicio actual informa pending/false de manera conservadora; no
pretende verificar un gate real aprobado. Al integrar un proveedor, la fuente de
estos estados deberá ser el gestor de autenticación oficial y el evaluador de
gates existentes, nunca el JSON de preferencias.

## Preferencias y persistencia

`provider-preferences.json` vive en userData de Electron, fuera del workspace.
Esquema v1 estricto: proveedor preferido opcional y dirección/modelo de Ollama.
Solo se admiten IDs registrados y dos direcciones loopback del puerto 11434. La
preferencia todavía no influye en la selección del Strategy Engine. No se prueba
la URL, ejecuta CLI, descarga un modelo ni inspecciona una sesión. Un nombre de
modelo guardado no demuestra que esté instalado o sea local.

Lectura limitada a 16 KiB; archivo regular sin symlink; campos desconocidos,
versiones desconocidas y esquemas incorrectos fallan cerrados. Escritura
mediante temporal exclusivo, flush y rename en el mismo directorio; nunca se
trunca el original. Ante corrupción se preserva el archivo y se bloquea su
sobrescritura durante esa sesión. La recuperación es manual; no se promete
reparación automática, resistencia a un administrador local hostil ni cierre de
M7.

## Autenticación futura

- Codex: priorizar login gestionado por App Server, sin copiar tokens
  existentes.
- Gemini/Claude: solo interfaces OAuth/CLI oficiales autorizadas expresamente
  para el uso de Trivergence. La presencia de sus CLI de consumo no es permiso
  para reutilizar sesiones ni cuotas. No se promete acceso con una suscripción.
- Ollama: primero modelos realmente locales; antes de habilitarlo habrá que
  verificar identidad/destino del servicio y excluir delegación cloud aunque la
  dirección de entrada sea loopback.

Las APIs con key quedan como extensión futura opt-in, separada del catálogo
principal, de la configuración v1 y del renderer. Requerirán gate propio,
consentimiento de facturación, almacenamiento seguro y una referencia opaca a
credenciales. No se implementa esa extensión ni se reserva un campo de secreto
en el contrato actual. El adaptador futuro seguirá entrando por AdapterHost.

## Threat model acotado

| Amenaza                                                | Control actual                                                            | Riesgo / trabajo posterior                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Renderer intenta habilitar proveedor o inyectar tokens | IPC de remitente confiable + esquema estricto; ningún setter de autoridad | Un renderer comprometido puede cambiar preferencias no secretas      |
| Endpoint SSRF o URL con credenciales                   | Enum loopback, sin cliente de red                                         | Revalidar al conectar y bloquear redirects/cloud en adaptador futuro |
| Corrupción o interrupción de escritura                 | Límite, esquema, temporal exclusivo, flush/rename, modo solo lectura      | Matriz de fallos de distribución sigue en M7                         |
| Instalación confundida con login                       | Estados separados; autenticación sin comprobar                            | Detección PATH no prueba integridad del binario                      |
| Preferencia manipulada para superar gate               | Configuración desconectada del Registry y AdapterHost                     | Fuente de autoridad futura debe revalidar gate en cada ejecución     |
| Filtración de cuenta o claves                          | Sin email, password, token, key ni lectura de credenciales                | Preferencias no son una bóveda; no introducir secretos en nombres    |

## Evidencia

Tests del servicio cubren separación de estados, persistencia entre instancias,
inyección de autoridad/secretos, endpoints no locales, campos desconocidos y
preservación de archivo corrupto. E2E recorre guardado desde renderer mediante
preload/IPC real, rechaza autoridad falsificada y comprueba los cuatro bloqueos.

## Fuentes oficiales de las rutas futuras

- OpenAI, [Codex App Server](https://developers.openai.com/codex/app-server/):
  login ChatGPT gestionado por el servidor, independiente de tokens externos.
- Google, [Gemini API OAuth](https://ai.google.dev/gemini-api/docs/oauth): OAuth
  requiere identidad de cliente y configuración oficial de proyecto.
- Anthropic,
  [uso de Claude desde aplicaciones de terceros](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account):
  la suscripción no otorga por sí sola acceso a una aplicación ajena.
- Ollama,
  [autenticación local y cloud](https://docs.ollama.com/api/authentication): API
  local sin cuenta; modelos cloud y API remota tienen otras condiciones.
