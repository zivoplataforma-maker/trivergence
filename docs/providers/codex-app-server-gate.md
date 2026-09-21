# M5-A — Gate de Codex App Server

Estado global: `UNRESOLVED`  
Fecha de consulta: 2026-09-15  
Operación evaluada: `provider.codex.prompt.structured`  
Modalidad: aplicación desktop open-source de terceros, local y atendida  
Autenticación: ChatGPT administrada por Codex; sin API key

Este expediente es una evaluación técnica y de riesgo, no asesoramiento legal.
No habilita Codex, no aprueba una attestation y no cambia M5 de `PARTIAL`.

## Decisión

| Gate                | Resultado                | Motivo determinante                                                                                                                                      |
| ------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical Gate      | `UNRESOLVED`             | Existe una interfaz oficial y versionable, pero el comando se declara experimental/no soportado para producción y no hay recovery desde checkpoint.      |
| Security Gate       | `CONDITIONALLY_APPROVED` | El aislamiento es viable con proceso local, `stdio` y fail-closed, pero falta validar el binario y el protocolo con fixtures hostiles.                   |
| Authentication Gate | `CONDITIONALLY_APPROVED` | App Server puede gestionar browser/device login sin entregar tokens a Trivergence; falta validación end-to-end y política oficial por tipo de cuenta.    |
| Contractual Gate    | `UNRESOLVED`             | La documentación invita a integrar App Server en productos, pero no aclara inequívocamente el uso por un tercero con Plus/Pro frente a los Terms of Use. |
| Distribution Gate   | `CONDITIONALLY_APPROVED` | La estrategia sin bundling es viable y el repositorio es Apache-2.0; siguen pendientes soporte/versiones, marca y confirmación del servicio autenticado. |

Regla aplicada: un gate obligatorio `UNRESOLVED` impide `APPROVED`. El resultado
global es por tanto **`UNRESOLVED`**.

## Respuesta contractual principal

**Pregunta:** ¿puede Trivergence usar oficialmente un Codex App Server instalado
localmente como backend, mientras el usuario autentica su propia cuenta mediante
el mecanismo oficial de Codex?

**Respuesta verificable:** `UNRESOLVED` para ChatGPT Plus y Pro.

La página oficial presenta App Server bajo “Embed Codex into your product” y
explica que sirve para integrar autenticación, historial, approvals y eventos.
También documenta clientes identificados con `clientInfo`, incluido un nombre
genérico de cliente, y solicita contacto con OpenAI para integraciones
enterprise. Esto demuestra intención técnica de embedding, pero no define de
forma explícita la licencia de acceso al servicio para una aplicación
open-source que usa la suscripción personal del usuario.

Los Terms of Use aplicables a servicios individuales permiten usar los servicios
sujeto a sus términos, pero prohíben extraer Output automática o
programáticamente. Ninguna fuente oficial consultada explica si un cliente que
consume el stream documentado de App Server queda fuera de esa prohibición. La
inclusión de Codex en planes ChatGPT confirma el acceso del usuario, no el
derecho de un tercero a automatizarlo o redistribuir una integración.

Distinciones obligatorias:

1. **Uso oficial por el usuario:** documentado para clientes Codex y planes
   ChatGPT compatibles.
2. **Integración local de terceros:** técnicamente invitada por App Server, pero
   el alcance contractual con cuentas personales no está resuelto.
3. **Redistribución:** Apache-2.0 cubre el código abierto; no concede por sí
   sola derechos sobre el servicio, la marca ni la suscripción.
4. **Automatización:** OpenAI orienta jobs/CI al SDK y API keys; Trivergence no
   evaluó esa ruta porque contradice el requisito principal sin API keys.
5. **Credenciales:** Codex puede poseerlas y renovarlas; Trivergence no debe
   leerlas, copiarlas ni almacenarlas.
6. **API access:** no se evalúa ni se autoriza OpenAI Platform API.
7. **Subscription access:** Plus/Pro puede incluir Codex, pero esa inclusión no
   demuestra autorización de embedding por terceros.

## Registro de evidencia oficial

Todos los enlaces se consultaron el 2026-09-15.

| ID  | Fuente oficial                                                                                                                       | Evidencia relevante                                                                                                          | Conclusión permitida                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| E1  | [Codex App Server](https://developers.openai.com/codex/app-server/)                                                                  | “Embed Codex into your product” y descripción de integración profunda.                                                       | App Server es una interfaz pública para construir clientes integrados.            |
| E2  | [Codex App Server — protocolo](https://developers.openai.com/codex/app-server/#protocol)                                             | JSON-RPC 2.0 sin `jsonrpc`; `stdio` usa JSONL. El comando y WebSocket figuran experimentales/no soportados en producción.    | No aprobar producción hasta aclarar su estatus; una futura prueba usaría `stdio`. |
| E3  | [Codex App Server — schemas](https://developers.openai.com/codex/app-server/#message-schema)                                         | La CLI genera TypeScript o JSON Schema que corresponde a su versión exacta.                                                  | El adapter puede compilar parsers desde el binario detectado y fijar su digest.   |
| E4  | [Codex App Server — inicialización](https://developers.openai.com/codex/app-server/#initialization)                                  | Exige `initialize` una vez y luego `initialized`; `clientInfo` identifica la integración.                                    | Hay handshake y lifecycle explícitos, pero no negociación semver documentada.     |
| E5  | [Codex App Server — auth](https://developers.openai.com/codex/app-server/#auth-endpoints)                                            | `account/read`, browser login, device code, cancelación, logout y estado; Codex persiste y renueva tokens.                   | Trivergence puede observar estado no secreto y delegar el login.                  |
| E6  | [Autenticación de Codex](https://developers.openai.com/codex/auth/)                                                                  | ChatGPT da acceso por suscripción; Codex guarda credenciales en `CODEX_HOME/auth.json`, keyring o memoria.                   | El ownership de credenciales puede permanecer íntegramente en Codex.              |
| E7  | [Codex con planes ChatGPT](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)                          | Codex se incluye en planes ChatGPT y el usuario inicia sesión en un cliente Codex.                                           | Confirma entitlement del usuario, no el de un cliente de terceros.                |
| E8  | [Terms of Use](https://openai.com/policies/row-terms-of-use/)                                                                        | Prohíbe compartir credenciales y extraer datos/Output programáticamente.                                                     | Impide inferir permiso contractual para Plus/Pro a partir del protocolo técnico.  |
| E9  | [Service Terms](https://openai.com/policies/service-terms/)                                                                          | Los componentes open-source conservan los derechos adicionales de su licencia; otros Licensed Materials no se redistribuyen. | Detectar una instalación oficial es más seguro que bundlearla.                    |
| E10 | [Licencia de openai/codex](https://github.com/openai/codex/blob/main/LICENSE)                                                        | Apache-2.0 permite uso y redistribución bajo sus condiciones.                                                                | La licencia del código no resuelve el acceso al servicio ni la marca.             |
| E11 | [Código oficial de autenticación](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/account.rs) | Browser/device login son variantes públicas; inyección de tokens externos está marcada experimental/interna.                 | `chatgptAuthTokens` queda prohibido para Trivergence.                             |
| E12 | [Daemon de App Server](https://github.com/openai/codex/blob/main/codex-rs/app-server-daemon/README.md)                               | El daemon y su contrato de lifecycle se declaran experimentales.                                                             | Trivergence no debe depender del daemon en la primera integración.                |

Las conclusiones se basan solo en documentación, código, licencia y términos de
OpenAI. Testimonios, issues de terceros y comportamiento inferido no forman
parte del gate.

## Interfaz técnica observada

- **Componente:** `codex app-server`, interfaz que Codex utiliza para clientes
  ricos; no es la Responses API ni un modelo.
- **Protocolo:** mensajes bidireccionales tipo JSON-RPC 2.0, omitiendo `jsonrpc`
  en el wire.
- **Transporte aceptable:** proceso hijo y JSONL por `stdin/stdout`. WebSocket,
  sockets/daemon y remote control quedan fuera del alcance inicial.
- **Lifecycle:** spawn, `initialize`, `initialized`, thread start/resume, turn
  start, notificaciones hasta `turn/completed`, shutdown con cierre supervisado.
- **Version negotiation:** no se documenta negociación de versión de protocolo.
  La compatibilidad debe ser un gate local por versión del ejecutable, schema
  generado y digest; ausencia o mismatch falla cerrado.
- **Schemas:** `generate-json-schema`/`generate-ts`, por versión exacta. Solo la
  superficie estable, sin `--experimental`.
- **Threads/sessions:** `thread/start`, `thread/resume`, `thread/fork`,
  read/list y eventos asociados. Para el primer adapter se usaría thread
  efímero.
- **Ejecución:** `turn/start`; las capacidades de tools/efectos se desactivan o
  se declinan. App Server no sustituye al Runtime de Trivergence.
- **Streaming:** `turn/started`, ciclo de items/deltas, uso y `turn/completed`
  con estado terminal.
- **Cancelación:** `turn/interrupt`; el adapter debe esperar el estado terminal,
  descartar eventos tardíos y matar el proceso tras un grace period acotado.
- **Approvals:** requests iniciados por el servidor. En el alcance inicial se
  responden siempre `decline`/`cancel`; la aprobación de Trivergence ocurre
  antes de dispatch y no se delega al proveedor.
- **Errores:** envelope JSON-RPC, estados de turn fallido/interrumpido y error
  `-32001` de sobrecarga documentado. El adapter debe mapear por código/tipo y
  no por texto libre.
- **Actualización:** la instalación oficial es propiedad del usuario/OpenAI.
  Trivergence detecta cambios y vuelve a ejecutar el gate de versión; no
  actualiza ni reemplaza el binario.
- **Límites:** el comando App Server figura experimental y no soportado para
  producción; tampoco hay recuperación de un turno desde offset/checkpoint,
  coste monetario exacto por llamada de suscripción ni negociación semver en
  `initialize`.

## Autenticación segura propuesta

```text
Usuario
  -> Trivergence (solo inicia el flujo y muestra estado no sensible)
    -> Codex App Server oficial instalado por el usuario
      -> navegador o device-code oficial de OpenAI
        -> credenciales poseídas, persistidas y renovadas por Codex
```

Reglas:

- Trivergence puede llamar `account/read` sin refresh y presentar únicamente
  `authenticated`, `authMode` y plan cuando el schema lo permita.
- Browser login abre únicamente la URL devuelta por App Server después de
  validar HTTPS y allowlist de host. Device code muestra URL/código sin
  registrarlos.
- `account/login/completed` y `account/updated` son señales; el estado se vuelve
  a leer antes de habilitar cualquier operación futura.
- Trivergence no abre, observa ni cambia `CODEX_HOME`, `auth.json`, keyring,
  cookies, headers, tokens, callback OAuth ni variables de credenciales.
- No se admite `apiKey`, `chatgptAuthTokens`, access-token ni headers externos
  en este gate.
- Logout, si se implementara tras aprobación, sería el RPC oficial y requeriría
  consentimiento explícito porque modifica la sesión compartida de Codex.

Esta topología es técnicamente posible. Su uso con Plus/Pro sigue condicionado a
la respuesta contractual de OpenAI.

## Arquitectura candidata, todavía inerte

```text
Orchestration Engine
  -> AdapterHost (única frontera de provider)
    -> CodexAppServerAdapter
      -> ExecutableResolver (rutas oficiales allowlisted)
      -> BinaryVerifier (ruta canónica, versión, SHA-256, trust attestation)
      -> SchemaGate (schema estable generado, digest allowlisted)
      -> StdioJsonlTransport (parser incremental y límites)
      -> CodexSessionController (initialize/thread/turn/interrupt/shutdown)
      -> EventMapper (Codex -> eventos/resultados tipados de Trivergence)
      -> CredentialBlindAuthFacade (estado/login sin acceso a secretos)
```

Condiciones de diseño:

1. instalación realizada por el usuario mediante un canal oficial;
2. resolución por rutas canónicas, nunca por primer resultado mutable de `PATH`;
3. proceso sin shell, argv constante, `cwd` validado y entorno allowlisted;
4. schema estable generado en directorio temporal y validado antes de conexión;
5. `clientInfo.name = "trivergence"`, sin suplantar un cliente oficial;
6. thread efímero, tools/efectos deshabilitados y approvals del servidor
   declinados;
7. salida tratada como contenido no confiable, con límites por
   bytes/chunks/tiempo;
8. provenance con versión/digest del adapter, binario y schema;
9. kill tree y quarantine tras timeout, protocol mismatch o cancellation
   failure;
10. ningún registro, dispatcher, attestation confiable o control UI hasta
    aprobar todos los gates.

No se creó un spike: los gates técnico y contractual siguen `UNRESOLVED`; el
comando no tiene soporte de producción documentado y dos garantías de
conformidad (recovery e interrupted recovery) no tienen una equivalencia oficial
segura. Un mock del protocolo no resolvería esos bloqueos.

## Mapping contra `ProviderAdapter`

| App Server / requisito               | ProviderAdapter            | Clasificación | Adaptación o diferencia                                                                            |
| ------------------------------------ | -------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Parseo de input y `outputSchema`     | `prepare`                  | `ADAPTABLE`   | Construir input tipado y schema estable; no enviar todavía.                                        |
| `turn/start`                         | `execute`                  | `ADAPTABLE`   | Crear thread efímero y un turn por request aprobado.                                               |
| Notificaciones turn/item/delta/usage | `stream`                   | `SUPPORTED`   | Normalizar secuencia y descartar métodos desconocidos de forma segura.                             |
| `turn/interrupt`                     | `cancel`                   | `SUPPORTED`   | Esperar `turn/completed: interrupted`; escalado a kill supervisado.                                |
| `thread/resume`                      | `recover`                  | `MISSING`     | Reanuda conversación, no el mismo turn desde checkpoint de salida.                                 |
| initialize/account/model probes      | `health`                   | `ADAPTABLE`   | Sería una observación previa al registro; no existe método estable único de health para `stdio`.   |
| `account/read`/`account/updated`     | authentication state       | `SUPPORTED`   | Exponer estado no secreto; una señal nunca concede autorización.                                   |
| versión CLI + schema generado        | version                    | `ADAPTABLE`   | No hay negociación semver en `initialize`.                                                         |
| hash del ejecutable local            | fingerprint                | `ADAPTABLE`   | Lo calcula Trivergence; App Server no lo atestigua.                                                |
| schema + model/capability reads      | capabilities               | `ADAPTABLE`   | Allowlist estable; no inferir capacidades experimentales.                                          |
| requests de approval del servidor    | approvals                  | `ADAPTABLE`   | Declinar efectos; approval de Runtime sigue siendo soberano.                                       |
| timer local + `turn/interrupt`       | timeouts                   | `ADAPTABLE`   | Deadline de AdapterHost, terminal barrier y kill tree tras un grace period acotado.                |
| uso + límites cliente                | input/output/chunk budgets | `ADAPTABLE`   | Interrumpir/fail closed; cuota/coste exacto de suscripción no está expuesto como presupuesto duro. |
| errores JSON-RPC/turn                | typed errors               | `ADAPTABLE`   | Tabla cerrada; desconocidos -> `protocol_error`.                                                   |
| versión/hash/schema/thread/turn      | provenance                 | `ADAPTABLE`   | Añadir digests locales sin guardar prompt/output sensible.                                         |
| proceso externo oficial              | transport                  | `SUPPORTED`   | `stdio_jsonl`; WebSocket excluido.                                                                 |

## Resultado frente a las 14 comprobaciones

No se ejecutó la suite contra Codex porque no existe adapter ni autorización
para conectarlo. Esta es una evaluación conceptual; la suite no fue modificada.

| Comprobación              | Resultado esperado | Evidencia/gap                                                             |
| ------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `capability_declaration`  | `ADAPTABLE`        | Manifest y schema permiten una capability estructurada versionada.        |
| `prepare_context_preview` | `ADAPTABLE`        | Totalmente local antes de iniciar App Server.                             |
| `execute_and_stream`      | `ADAPTABLE`        | Turn y stream están documentados; falta fixture real.                     |
| `cancellation`            | `ADAPTABLE`        | Existe `turn/interrupt`; falta probar eventos tardíos y proceso huérfano. |
| `recovery`                | `BLOCKED`          | No existe replay idempotente desde el checkpoint exigido.                 |
| `interrupted_recovery`    | `BLOCKED`          | `thread/resume` no reanuda un turn interrumpido desde offset.             |
| `timeout`                 | `ADAPTABLE`        | Timer local, interrupt y kill tree supervisado.                           |
| `typed_failure`           | `ADAPTABLE`        | Error envelope y estados terminales mapeables.                            |
| `input_budget`            | `ADAPTABLE`        | Se aplica en `prepare`, antes de egress.                                  |
| `output_budget`           | `ADAPTABLE`        | Contador incremental seguido de interrupt/fail closed.                    |
| `provenance`              | `ADAPTABLE`        | Digests de adapter/binario/schema/request/context.                        |
| `approval_boundary`       | `ADAPTABLE`        | Runtime bloquea antes del dispatch; requests del server se declinan.      |
| `malformed_response`      | `ADAPTABLE`        | SchemaGate y AdapterHost rechazan mensajes/resultados inválidos.          |
| `unavailable_provider`    | `ADAPTABLE`        | Sin attestation confiable no existe registration en AdapterHost.          |

Resultado conceptual: **12 adaptables, 2 bloqueadas, 0 verificadas contra un
Codex real**. No se reduce `recoveryPolicy` ni se debilita la suite para hacer
encajar al proveedor.

## Riesgos y bloqueos pendientes

- respuesta oficial sobre Plus/Pro y la cláusula de extracción programática;
- semántica segura e idempotente para recovery/interrupted recovery;
- rango de versiones soportado, schema/digest y política de actualización;
- identidad de cliente `trivergence` y alta en known clients si aplica;
- límites/rate limits y representación de budgets para suscripciones;
- aislamiento efectivo de tools, workspace, red y approvals;
- revisión jurídica y de privacidad por entidad/territorio/cuenta;
- fixtures de parser hostil, cancelación, crash, oversized response y downgrade;
- verificación de firma/procedencia de releases Windows, no solo un SHA-256
  local.

Las preguntas formales están en
[`codex-app-server-open-questions.md`](codex-app-server-open-questions.md) y las
mitigaciones en
[`threat-model-codex-app-server.md`](../security/threat-model-codex-app-server.md).

## Criterio para reabrir el gate

Reabrir únicamente cuando exista una respuesta oficial citable a las preguntas
contractuales y técnicas. Entonces, antes de implementar el adapter productivo:

1. fijar versión oficial y schema estable;
2. resolver recovery sin duplicar efectos ni relajar la suite;
3. aprobar threat model y mecanismo de verificación de binario;
4. construir un spike aislado solo con fixtures no privados;
5. ejecutar las 14 comprobaciones y todos los gates;
6. crear una attestation revisada y añadir su digest al trust store mediante un
   release explícito.

## Reevaluación técnica M5-B0 — 2026-09-21

[ADR-0011](../architecture/adr/0011-recovery-semantics.md) demuestra que las dos
pruebas anteriores mezclaban exact recovery del provider con recovery seguro de
la orquestación. App Server sigue sin primitive documentada para recuperar el
mismo turn, por lo que declararía inicialmente capabilities vacías; una
interrupción después del dispatch debe producir `remote_state_unknown`, detener
el workflow y exigir revisión humana. Esto elimina **exact recovery ausente**
como bloqueo técnico universal, pero no lo convierte en capability soportada.

No cambia la decisión global `UNRESOLVED`: madurez de producción,
autenticación/entitlement, autorización contractual y distribución siguen
abiertas. No se autorizan adapter ni spike y no se alteró el trust store.
