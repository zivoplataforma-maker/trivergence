# Arquitectura de seguridad

## Renderer Electron

Configuración obligatoria:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- `sandbox: true`;
- `webSecurity: true`;
- ningún `webview`;
- CSP restrictiva sin `unsafe-eval`;
- navegación y creación de ventanas denegadas;
- protocolo de aplicación propio en producción, no `file://`;
- fuses de Electron evaluados antes de release.

Cada handler IPC verifica el frame emisor y valida request/response. Preload
copia únicamente datos serializables y quita el objeto evento en callbacks.

## Orchestration Engine

- la intención no contiene comandos libres ni autoridad de aprobación;
- el Capability Registry usa snapshots versionados y descriptores validados;
- el Planner limita capacidades y dependencias, detecta ciclos y falla cerrado
  ante capacidades faltantes o deshabilitadas;
- Strategy y Evaluation producen motivos y versiones estables, no una decisión
  opaca delegada a un modelo;
- Strategy compara rutas declaradas, no ejecuta una ruta por coincidencia
  textual sin preview; el modo privado filtra red en selección y Runtime;
- Evaluation postflight correlaciona run, snapshot, digest y evidencia; un
  preflight `ready` nunca equivale a resultado aceptado;
- un preview es inerte: no puede invocar Runtime, agentes, proveedores o tools;
- antes de ejecutar se revalidan registry, plan, policy, aprobación y evidencia.

El preview incluye SHA-256 sobre una representación canónica versionada de
request, snapshot, strategy, plan, policies y evaluation. El digest detecta
mutaciones, pero no es firma ni prueba de autenticidad y no concede autorización
por sí solo. Sirve para ligar futuras aprobaciones/runs al artefacto exacto.
Cambiar targets, policy, versión de capability o evaluación exige regenerar y
revisar.

## Policy engine

La taxonomía separa tipo y severidad:

```ts
type ActionKind =
  | "read"
  | "write"
  | "execute"
  | "network"
  | "git"
  | "delete"
  | "system"
  | "credentials";

type Risk = "safe" | "guarded" | "sensitive" | "destructive";
type Decision = "allow" | "deny" | "require_approval";
```

Una acción puede tener varios kinds; prevalece la regla más restrictiva.
`destructive`, `system` y `credentials` nunca son autoaprobables. “Autónomo
limitado” se pospone hasta probar el modelo.

Policy Engine es un guardrail por acción. No decide la estrategia ni sustituye
la evaluación de viabilidad del plan completo.

## Aprobaciones

La representación canónica incluye tool/version, argv, cwd real, targets reales,
env names, network destinations, workspace ID y ruleset version. Se hashea con
SHA-256. La aprobación expira, se usa una vez y no sobrevive a cambios de
ruleset ni resolución del ejecutable.

La UI evita textos genéricos (“permitir”). Debe decir, por ejemplo: “Ejecutar
`git status` sin red en `C:\proyecto`”. Acciones destructivas no admiten
“recordar decisión”.

## Procesos

- sin shell salvo terminal interactiva explícita;
- executable absoluto y ruta real dentro de allowlist, argv tipado y cwd real
  dentro de roots permitidos;
- environment construido sólo desde nombres permitidos, sin heredar el entorno
  completo del host;
- backpressure, truncado indicado y spool limitado;
- timeout duro y grace period antes de terminar árbol;
- `taskkill /T` con escalado `/F` en Windows P0; estado `orphaned` si no se
  confirma el cierre; Job Objects se evalúa antes de autonomía;
- ningún retry automático de acción con efectos;
- creación de proceso y auditoría correlacionadas.

## Provider Adapters

- `prepare` es inerte y produce un descriptor con destino, red, contexto por
  metadatos, budgets, versión y digest del build;
- Runtime regenera y compara el descriptor antes de `execute` o `recover`;
- cada evento de stream cruza un schema estricto y no concede autoridad;
- el `AdapterHost` compartido comprueba que identidad de preview, eventos y
  provenance final correspondan al manifest y request registrados;
- cancelación, timeout, bytes, chunks y coste fallan cerrado;
- checkpoints quedan ligados a request/plan/step/capability/adapter/proveedor,
  se consumen una vez y la recuperación exige aprobación nueva;
- los checkpoints y previews no persisten prompt, contexto ni respuesta;
- el Reference Provider usa memoria local y no comparte trust ni attestations
  con conectores externos.

El contrato completo está en
[Provider Adapter](../architecture/reference-provider-contract.md).

## Workflows, agentes y memoria

- son capabilities subordinadas al plan, no autoridades alternativas;
- los agentes no reciben interfaces de policy, approvals, tools, filesystem o
  procesos;
- M6 exige el Reference Provider local y rechaza manifests externos;
- los budgets de agentes, llamadas, bytes, memoria, tiempo, coste, replans y
  retención se validan y reportan de extremo a extremo;
- cada dispatcher ve solo snapshots profundos e inmutables de dependencias
  directas;
- provenance y contenido se verifican antes de commit y otra vez al evaluar;
- memoria usa namespace de workspace, TTL, borrado/poda y auditoría sin
  contenido.

Véanse [arquitectura M6](../architecture/workflows-agents-memory.md) y
[threat model M6](threat-model-m6.md).

## Persistencia y auditoría

- SQLite sólo es accesible desde el subsistema de persistencia, nunca desde el
  renderer;
- extensiones deshabilitadas, foreign keys, tablas estrictas, prepared
  statements y migraciones con checksum;
- cada mutación funcional y su evento se confirman en una misma transacción;
- `audit_events` impide update/delete mediante triggers y encadena SHA-256;
- payloads de auditoría limitados a metadatos escalares; contenido y secretos no
  se copian a logs;
- fallo de `quick_check` o de la cadena cierra el escritor, reabre `readOnly` y
  bloquea acciones privilegiadas;
- backup usa la Online Backup API y restauración validada a una ruta nueva.

## Filesystem

- API relativa a un root handle lógico;
- denegar device paths, Alternate Data Streams, rutas UNC P0, nombres reservados
  y escapes;
- revalidar symlinks/junctions por cada componente relevante;
- escritura atómica mediante temporal en el mismo volumen y rename cuando
  aplique;
- snapshot/hash antes de sobrescribir y detección de cambio concurrente.

M4 implementa únicamente lectura y Git read-only. La raíz real y su identidad se
revalidan en cada operación; la resolución real del destino debe permanecer
dentro de esa raíz. Las exclusiones internas no pueden ser reducidas por el
usuario. Los parámetros de ruta y búsqueda forman parte de la acción firmada y
los resultados completos no se persisten. Véase
[Workspace y tools locales](../architecture/workspace-and-tools.md).

## Red

No existe fetch genérico desde renderer. Los destinos se normalizan y controlan
por protocolo, host, puerto, redirects, DNS/IP privado y tamaño. La mitigación
completa de DNS rebinding requiere diseño adicional; fetch HTTP no pertenece a
M1.

## Release

Las actualizaciones están desactivadas hasta tener firma de código, HTTPS,
manifiesto firmado, rollback y proceso de compromiso de claves. Un checksum sin
canal autenticado no sustituye una firma.
