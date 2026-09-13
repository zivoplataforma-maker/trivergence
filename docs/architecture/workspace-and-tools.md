# Workspace y tools locales

Estado: normativo para M4  
Fecha: 2026-08-07

## Propósito y límite

`packages/workspace` es un subsistema privilegiado coordinado por el
Orchestration Engine. Publica capacidades estrechas de solo lectura y produce
evidencia; no decide la estrategia, no altera el plan y no expone una API de
filesystem genérica.

M4 incorpora cuatro capacidades:

- `workspace.file.read`;
- `workspace.search.literal`;
- `workspace.git.status`;
- `workspace.git.diff`.

Escritura, borrado, watch, snapshots de contenido y operaciones Git mutables
quedan fuera de esta fase.

## Identidad y selección

La selección recibe una ruta absoluta elegida por el host. Se rechazan archivos,
rutas UNC, device paths, Alternate Data Streams, bytes NUL y nombres reservados
de Windows. El subsistema obtiene la ruta real nativa, verifica que sea un
directorio y captura una identidad de raíz basada en ruta canónica y metadatos
del filesystem.

Cada operación vuelve a resolver la raíz y compara su identidad. Si la raíz fue
reemplazada o dejó de existir, falla cerrado. El `workspaceId` es un UUID de la
aplicación; el fingerprint SHA-256 de la ruta sirve para detectar cambios, no
como secreto ni como autorización.

## Resolución segura

Las tools solo aceptan rutas relativas normalizadas. Antes de leer:

1. validan sintaxis y segmentos;
2. unen la ruta a la raíz canónica;
3. resuelven `realpath` nativo;
4. comprueban que el destino real siga dentro de la raíz;
5. verifican tipo, tamaño y exclusiones.

El mismo control se aplica a symlinks y junctions. Un enlace interno puede
resolverse; un enlace cuyo destino escape se bloquea. La defensa reduce TOCTOU,
pero no afirma aislamiento equivalente a un sandbox de kernel.

## Exclusiones y presupuestos

Las reglas internas son obligatorias y tienen precedencia. Excluyen, entre
otros, `.env` y variantes, `.ssh`, `.aws`, `.azure`, `.gnupg`, `.git`,
`node_modules`, almacenes conocidos de credenciales y directorios generados. Las
reglas del usuario solo pueden agregar exclusiones.

La búsqueda usa un recorrido local acotado, sin seguir enlaces externos y con
detección de ciclos. Aplica `.gitignore` por directorio además de las reglas
obligatorias y del usuario. Las negaciones nunca reabren una ruta ya excluida y
un patrón no soportado falla hacia la privacidad, excluyendo su ámbito.

Presupuestos M4:

- lectura: archivo regular UTF-8 de hasta 1 MiB;
- búsqueda literal: query de 1–200 caracteres, hasta 5.000 archivos, 20 MiB
  escaneados y 200 coincidencias;
- Git: timeout de 10 s y salida combinada de hasta 1 MiB;
- resultados completos: solo memoria del run; persistencia: resumen y SHA-256.

Los binarios se detectan por contenido y no se decodifican como texto. Alcanzar
un presupuesto produce un resultado marcado como truncado, nunca una ampliación
silenciosa.

## Git de solo lectura

El ejecutable Git se resuelve fuera del paquete y se entrega como ruta absoluta
allowlisted al supervisor de procesos. Siempre se usa `shell:false`, argv fijo,
cwd canónico, environment mínimo y salida acotada.

M4 exige que la raíz del repositorio Git sea exactamente la raíz seleccionada.
Un workspace que sea subdirectorio de un repositorio superior se bloquea para
evitar que `status` o `diff` revelen rutas fuera del alcance elegido.

`status` usa porcelain v1 terminado en NUL para parsing estable. `diff`
desactiva external diff y textconv, color, pagers y prompts. No se ejecutan
hooks ni se aceptan revisiones, opciones o pathspecs arbitrarios desde el
renderer. Repositorios con `commondir`, object alternates, includes de
configuración, filters, diff/merge helpers, fsmonitor, hooksPath o worktree
externo se rechazan antes de publicar/ejecutar la capacidad Git.

## Contrato con orquestación y Runtime

La intención puede incluir parámetros acotados por capacidad. El Execution
Planner copia esos parámetros dentro de la `ActionRequest`; por lo tanto quedan
incluidos en el hash canónico del preview y en cualquier aprobación. Un
parámetro para una capacidad no solicitada se rechaza.

Los dispatchers validan nuevamente el contrato específico antes de describir y
antes de ejecutar. El Runtime revalida preview, snapshot, policy y descriptor;
después conserva el resultado tipado en memoria, persiste solo evidencia y su
digest, y nunca registra contenido de archivo o diff en auditoría.

## Gate de M4

Una fixture temporal debe demostrar:

- intención con parámetros → strategy → plan firmado → ejecución → evidencia;
- lectura y búsqueda dentro de la raíz;
- `status` y `diff` estructurados sobre un repositorio fixture;
- bloqueo de traversal, rutas absolutas, secretos obligatoriamente excluidos,
  junction/symlink externo y repositorio padre;
- digest distinto si cambia la ruta o la query planificada.
