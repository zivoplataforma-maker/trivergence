# Decisiones técnicas

| Decisión                                                   | Fundamento y referencia                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicación local con Electron y persistencia SQLite        | Mantener el control del entorno y del estado en el escritorio. [Arquitectura](architecture/overview.md)                               |
| Contratos separados para política, ejecución y proveedores | Permitir probar las fronteras y aplicar reglas comunes a rutas distintas. [Arquitectura](architecture/)                               |
| Aprobación y recuperación explícitas                       | Evitar reanudar a ciegas una operación cuyo resultado externo sea incierto. [Historial de decisiones](architecture/adr/)              |
| Estrategia directa o deliberativa                          | Aplicar propuestas y crítica cuando el objetivo lo amerite, conservando planificación, política y evidencia. [Roadmap](../ROADMAP.md) |
| Incorporación de proveedores por capacidad                 | Evaluar permisos, recuperación y condiciones de uso por ruta. [Integraciones](providers/)                                             |
