# ADR-0007 — Attestations de proveedor y primer candidato estructurado

Estado: aceptado; activación pendiente de gate  
Fecha: 2026-08-07

Actualización 2026-09-15: el gate M5-A de Codex App Server resultó `UNRESOLVED`.
La preferencia de candidato se conserva, pero la frase “interfaz oficial para
productos propios” expresa disponibilidad técnica, no madurez para producción ni
autorización contractual para Plus/Pro. Tampoco se encontró una primitive de
recovery de turn equivalente al checkpoint de Trivergence. No existe adapter,
dispatcher ni attestation confiable. Véase
[el expediente M5-A](../../providers/codex-app-server-gate.md).

## Contexto

Los proveedores cambian interfaces, autenticación y términos sin compartir un
contrato común. La detección actual solo demuestra que existe un ejecutable; no
demuestra compatibilidad, autorización ni seguridad. Publicar una capability a
partir de esa señal permitiría que una preferencia local sustituyera un gate
contractual.

## Decisión

1. La disponibilidad estructurada se deriva de una attestation por operación,
   interfaz, autenticación, cuenta y versión.
2. Técnica, contrato y legal son revisiones independientes, identificadas y con
   vencimiento.
3. El digest de la attestation y la observación local forman parte del
   descriptor de capability y, por tanto, del snapshot del Registry.
4. El trust store de attestations se compila con el release; ni renderer ni
   configuración local pueden ampliarlo.
5. Instalación, autenticación o preferencia nunca bastan para publicar
   `available`.
6. Un adapter candidato no exporta ejecución, login ni dispatcher. Hasta la
   aprobación, sus capabilities permanecen `unavailable` y Runtime no tiene un
   dispatcher correspondiente.
7. Codex App Server sobre `stdio` es el primer candidato, no el primer proveedor
   habilitado. La elección se basa en su interfaz oficial para productos
   propios, eventos estructurados, schemas por versión y aprobaciones.

## Perfil inicial propuesto para Codex

- autenticación delegada íntegramente al App Server mediante navegador o device
  code; nunca lectura de `auth.json`;
- sesión local atendida por el usuario, sin background ni credenciales
  compartidas;
- transporte futuro `stdio`; el comando App Server y WebSocket están
  documentados como experimentales/no soportados para producción, mientras que
  auth tokens externos experimentales y dynamic tools quedan fuera;
- directorio aislado, sin tools con efectos y con toda solicitud de
  comando/archivo/red rechazada y convertida, cuando sea posible, en propuesta
  para el Orchestration Engine;
- capability inicial: propuesta/respuesta estructurada con egress explícito,
  presupuesto y aprobación de usuario;
- schemas generados desde la versión exacta de Codex y fixtures de éxito, auth,
  evento desconocido, truncado, timeout y cancelación.

## Consecuencias

La elección no se codifica en Strategy Engine. Codex solo será seleccionable
cuando su capability publicada esté disponible. Gemini/Vertex y Claude Platform
pueden incorporarse después mediante sus propias attestations sin cambiar el
núcleo.

El expediente recomienda Codex, pero mantiene el estado contractual/legal en
`pending` y el gate global `UNRESOLVED` hasta obtener dictamen y, para cuentas
personales, confirmación escrita sobre la convivencia entre App Server y la
restricción de extracción programática de los términos de consumo. La futura
implementación también debe resolver las comprobaciones de recovery sin reducir
las garantías de conformidad.
