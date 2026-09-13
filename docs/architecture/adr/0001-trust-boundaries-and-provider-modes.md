# ADR-0001 — Fronteras de confianza y modos de proveedor

Estado: aceptado para M1  
Fecha: 2026-08-03

## Contexto

La propuesta inicial colocaba filesystem, terminal, base de datos y varias CLI
detrás de una interfaz uniforme. Eso ocultaba diferencias de capacidad y
términos, y convertía un compromiso del renderer o un parser en acceso amplio al
host.

## Decisión

1. El renderer es no privilegiado y todo acceso cruza métodos IPC nominados,
   validados y con sender comprobado.
2. Las operaciones de host se ejecutan en workers por capacidad bajo un runtime
   supervisor.
3. Los providers publican capacidades por operación y versión, usando los modos
   `structured`, `interactive` o `unavailable`.
4. El motor de políticas decide sobre acciones normalizadas antes de seleccionar
   el mecanismo de ejecución.
5. Un conector puede existir para detección sin implementar `run`.
6. La compatibilidad estructurada requiere fixture, contract test, fuente
   oficial y gate de términos con fecha.

## Consecuencias positivas

- Degradación honesta y UI explicable.
- Menor radio de impacto.
- Tests deterministas del motor de políticas y parsers.
- Se puede entregar valor sin forzar paridad entre proveedores.

## Costes

- Más contratos y serialización.
- No se puede prometer una experiencia idéntica entre proveedores.
- Workers, cancelación y empaquetado nativo requieren pruebas específicas de
  Windows.

## Alternativas descartadas

- **Terminal universal parseada:** frágil ante ANSI, localización y cambios de
  UI.
- **SDK/API común propio:** contradice el requisito de no gestionar claves y no
  existe para todos los proveedores.
- **Todo en Electron main:** simple al inicio, pero demasiado privilegiado y
  difícil de aislar.
- **Webviews para login:** amplía la superficie de phishing/OAuth y viola el
  límite de credenciales.
