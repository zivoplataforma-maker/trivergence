# Orchestration Space — diseño y configuración

## Dirección visual

Interfaz propia inspirada en la sobriedad de Codex y la organización de agentes
de Antigravity: objetivo primero, navegación lateral estable y resumen de
sesión. No se copia branding ni se añade un editor de código. No hay imágenes,
fuentes remotas, bibliotecas UI nuevas o solicitudes de recursos externos.

El diagnóstico previo encontró paneles de igual peso, colores dispersos y
configuración mezclada con evidencia de instalación. Se incorpora un patrón de
tarjeta de conexión y una vista separada Proveedores; historial, privacidad,
aprobaciones y resultados siguen en el recorrido existente.

## Tokens y componentes

Tokens nuevos: canvas #141517, surface #1b1c20, surface-raised #23252a, border
#393c43, text #f0f1f3, muted #b0b4be, accent #c5b8ff, radius 16px. Se conservan
colores semánticos de error/aprobación y reglas de foco existentes. Tipografía
del sistema; títulos con jerarquía, sin fuentes descargadas. La marca vectorial
original representa tres rutas que convergen en una decisión, sin logotipos de
terceros.

| Patrón               | Comportamiento                                                              | Accesibilidad                                                    |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Navegación           | Objetivo, ejecución, historial, privacidad, diagnóstico, proveedores        | Enlaces con nombre, ubicación actual, acceso por teclado         |
| Resumen de sesión    | Objetivo → estrategia → ejecución → evidencia; lateral en pantallas amplias | Lista ordenada, sin depender del color                           |
| Tarjeta de proveedor | Cuatro dimensiones y razones de bloqueo                                     | Encabezado y lista de definiciones; details/summary nativo       |
| Formulario local     | Preferido, loopback y modelo; guardar explícito                             | Labels, mensajes de estado/error; carga, guardado y solo lectura |

La navegación a Proveedores oculta el trabajo sin destruir su estado; al volver
se conserva el objetivo y la ejecución. La vista de configuración vuelve a leer
sus preferencias guardadas al abrirla. Borradores no guardados se descartan al
salir; guardar siempre informa que no activa conexiones.

Layout de una columna en ancho reducido y zoom 200%; resumen lateral desde
1350px. Objetivos, budgets y controles de aprobación no cambian. Los errores y
estados de seguridad usan texto, no solamente color. Se respeta reduced-motion.

## Límites de esta entrega

No hay botones de login ficticios, toggles de gate, inputs de keys, modelos
remotos descargables ni proveedores que aparezcan conectados sin evidencia.
Autenticación real y ejecución externa pertenecen a sus gates posteriores. La
extensión futura de APIs con facturación separada queda fuera del flujo.

La comprobación automatizada cubre ambos espacios con axe WCAG AA, primer foco,
zoom 200%, regresión de workflows y guardado de preferencias; no sustituye una
prueba manual completa con lector de pantalla.
