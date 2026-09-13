# ADR-0005: raíz canónica y tools locales de solo lectura

Estado: aceptado  
Fecha: 2026-08-07

## Contexto

M4 necesita utilidad local sin IA, pero una API de archivos genérica permitiría
que rutas manipuladas, junctions, configuración Git o parámetros cambiados tras
el preview eludan el control del Orchestration Engine.

## Decisión

Se crea `packages/workspace` como subsistema privilegiado con raíz canónica e
identidad revalidada por operación. Solo publica lectura UTF-8, búsqueda
literal, Git status y Git diff. Los parámetros de cada invocación pasan a formar
parte de la acción planificada y de su digest.

Git se ejecuta mediante el supervisor existente, con ejecutable absoluto,
`shell:false`, configuración defensiva y requisito de que repo root y workspace
root coincidan. Los resultados viven en memoria; la base conserva evidencia y
hash, no contenido.

No se adopta una librería de glob ni una API Git embebida: para el alcance de
solo lectura, las primitivas de Node y la salida porcelain de Git reducen
dependencias y superficie. Git aporta la semántica de `.gitignore` cuando está
disponible; el fallback local aplica exclusiones obligatorias y del usuario.

## Consecuencias

- los previews existentes siguen siendo válidos porque los parámetros son
  opcionales;
- cambiar path/query invalida la integridad del plan;
- un workspace contenido en un repositorio superior no ofrece capacidades Git en
  M4;
- hard links y carreras del filesystem siguen siendo riesgo residual; por eso M4
  es read-only y cada operación revalida raíz y destino;
- watch seguro, escritura atómica y Git mutable requieren otro ADR y policy
  específica.

## Alternativas descartadas

- **Confiar en `path.resolve`:** no resuelve junctions ni symlinks.
- **Exponer filesystem/Git genéricos al renderer:** rompe contratos nominales y
  permite argumentos no planificados.
- **Aceptar repositorio padre:** amplía silenciosamente el workspace.
- **Persistir resultados completos:** aumenta exposición de código, secretos y
  diffs sin ser necesario para auditoría.
