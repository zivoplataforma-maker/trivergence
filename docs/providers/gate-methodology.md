# Metodología del gate de proveedores

Estado: normativa para M5  
Fecha: 2026-08-07

## Propósito

Una instalación, un login válido o una salida parseable no autorizan por sí
solos un proveedor. Trivergence evalúa cada operación y versión mediante tres
revisiones independientes: técnica, contractual y legal/privacidad. Este
expediente informa la decisión, pero no sustituye el dictamen de una persona con
autoridad legal ni la aceptación contractual de la entidad que distribuirá el
producto.

## Unidad de aprobación

El gate se emite para la combinación exacta de:

- proveedor, producto e interfaz oficial;
- operación y modalidad (`structured`, `interactive` o `external`);
- método de autenticación y tipo de cuenta;
- caso de uso `third_party_local_desktop_orchestration`;
- territorio, versión/rango probado y fixtures;
- términos, políticas y documentación observados en una fecha concreta.

No existe una aprobación global de “OpenAI”, “Google” o “Anthropic”. Cambiar de
CLI a API, de cuenta personal a empresarial o de GA a preview requiere otro
gate.

## Estados

- `pending`: falta evidencia o aprobación.
- `approved`: un revisor identificado aprobó ese eje y la decisión no venció.
- `rejected`: la operación contradice términos, arquitectura o riesgo aceptado.
- `stale`: cambió o venció una fuente, interfaz, versión o contrato.

Una capability estructurada solo puede publicarse `available` cuando técnica,
contrato y legal están `approved`, la implementación y fixtures están
verificados, la attestation está incluida en el trust store del release, el
usuario la habilitó y el modo privado está desactivado. Todo dato ausente
produce `unavailable`.

## Checklist técnico

- interfaz oficial, estable y documentada para el caso de uso;
- autenticación sin captura ni copia de credenciales ajenas;
- versión exacta, identidad del ejecutable/SDK y schemas versionados;
- entrada sin secretos en argv y salida estructurada con límites;
- timeout, cancelación, backpressure y errores hostiles;
- tools convertidas en propuestas para el Capability Registry, nunca ejecución
  directa del proveedor;
- modelo/feature GA allowlisted, costes y cuotas visibles;
- evidencia y logs redactados, sin prompts ni tokens por defecto.

## Checklist contractual

- aplicación de terceros y tipo de cuenta expresamente cubiertos;
- prohibiciones de automatización, extracción, piggyback OAuth y account sharing
  revisadas;
- reventa/sublicencia, producto competidor, límites de uso y beta revisados;
- propiedad/licencia del output, obligaciones sobre input y revisión humana;
- marca, redistribución del binario, territorios y controles de exportación;
- mecanismo de actualización y nueva revisión de términos.

## Checklist legal, privacidad y seguridad

- entidad contratante y autoridad para aceptar términos/DPA;
- roles de controller/processor y privacidad de Trivergence;
- residencia, retención, entrenamiento, borrado y solicitudes de titulares;
- consentimiento informado para egress, modelo, región, coste y cuenta destino;
- edad mínima y restricciones de sectores/decisiones de alto impacto;
- OAuth con navegador externo, PKCE cuando corresponda y vault del sistema;
- revocación/logout completo, respuesta a incidentes y soporte al usuario;
- aprobación humana ligada al plan para todo efecto mutante.

## Frescura y evidencia

La revisión documental vence a los 30 días o inmediatamente si cambian los
términos, la autenticación, el protocolo, el modelo o la versión integrada. La
attestation canónica conserva URLs, fecha, revisores, fixtures y sus digests. La
UI no puede aprobar ni extender un gate; eso requiere un nuevo release revisado.
