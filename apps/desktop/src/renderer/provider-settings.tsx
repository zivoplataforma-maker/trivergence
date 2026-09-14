import { useEffect, useState, type FormEvent } from "react";
import {
  providerConfigurationSchema,
  providerPreferencesSchema,
  type ProviderConfiguration,
  type ProviderPreferences,
} from "@trivergence/contracts";

export function ProviderSettings() {
  const [configuration, setConfiguration] = useState<ProviderConfiguration>();
  const [draft, setDraft] = useState<ProviderPreferences>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    window.trivergence
      .getProviderConfiguration()
      .then((value: unknown) => {
        if (!active) return;
        const parsed = providerConfigurationSchema.parse(value);
        setConfiguration(parsed);
        setDraft(parsed.preferences);
      })
      .catch(() => {
        if (active)
          setError(
            "No se pudo cargar la configuración. Ninguna conexión se ha activado.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = providerConfigurationSchema.parse(
        await window.trivergence.saveProviderConfiguration(
          providerPreferencesSchema.parse(draft),
        ),
      );
      setConfiguration(parsed);
      setDraft(parsed.preferences);
      setMessage(
        "Preferencias guardadas en este equipo. No se activó ninguna conexión.",
      );
    } catch {
      setError(
        "No se pudieron guardar las preferencias. Revisa los datos y el estado del almacenamiento.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="proveedores" aria-labelledby="provider-settings-title">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">CONFIGURACIÓN / PROVEEDORES</p>
          <h1 id="provider-settings-title">
            Tus herramientas. Un solo control.
          </h1>
          <p className="subtitle">
            Prepara las herramientas que quieres orquestar. Tú conservas el
            control de las cuentas, los permisos y cada ejecución.
          </p>
        </div>
        <span className="securityBadge">Sin API keys</span>
      </header>
      <div className="connectionNotice">
        <strong>Preparación local · conexiones externas desactivadas</strong>
        <p>
          Instalar, autenticar y autorizar son pasos diferentes. Solo el
          Reference Provider de pruebas está disponible para ejecutar; no es una
          IA real.
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!configuration && !error && (
        <p role="status">Cargando configuración local…</p>
      )}
      {configuration && draft && (
        <>
          <div className="providerSettingsGrid">
            {configuration.providers.map((provider) => (
              <article
                className="connectionCard"
                key={provider.id}
                data-provider-id={provider.id}
              >
                <div className="connectionHeader">
                  <span className="providerInitial" aria-hidden="true">
                    {provider.displayName.slice(0, 1)}
                  </span>
                  <h2>{provider.displayName}</h2>
                  <span className="blockedLabel">
                    {provider.blocked ? "Bloqueado" : "Disponible"}
                  </span>
                </div>
                <p>{provider.guidance}</p>
                <dl className="connectionStates">
                  <div>
                    <dt>Instalado</dt>
                    <dd>
                      {provider.installation === "detected"
                        ? "Detectado · sin verificar"
                        : provider.installation === "not_detected"
                          ? "No detectado en PATH"
                          : "Sin comprobar"}
                    </dd>
                  </div>
                  <div>
                    <dt>Autenticado</dt>
                    <dd>
                      {provider.authentication === "not_required"
                        ? "No requiere cuenta local"
                        : provider.authentication === "authenticated"
                          ? "Sí"
                          : provider.authentication === "not_authenticated"
                            ? "No"
                            : "Sin comprobar"}
                    </dd>
                  </div>
                  <div>
                    <dt>Autorizado por gate</dt>
                    <dd>
                      {provider.gate === "authorized"
                        ? "Sí"
                        : provider.gate === "denied"
                          ? "Denegado"
                          : "Pendiente"}
                    </dd>
                  </div>
                  <div>
                    <dt>Habilitado para ejecutar</dt>
                    <dd>{provider.executionEnabled ? "Sí" : "No"}</dd>
                  </div>
                </dl>
                <details className="technicalDetails">
                  <summary>¿Por qué está bloqueado?</summary>
                  <ul>
                    {provider.blockers.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <p>
                    Guardar preferencias no cambia estos estados. No se inicia
                    sesión ni se lee el almacén de credenciales.
                  </p>
                </details>
              </article>
            ))}
          </div>
          <section className="panel" aria-labelledby="preferences-title">
            <p className="eyebrow">SOLO EN ESTE EQUIPO</p>
            <h2 id="preferences-title">Preparar mis preferencias</h2>
            <p>{configuration.notice}</p>
            <form onSubmit={save} className="intentForm">
              <div className="field fieldWide">
                <label htmlFor="preferred-provider">
                  Proveedor preferido cuando esté autorizado
                </label>
                <select
                  id="preferred-provider"
                  value={draft.preferredProviderId ?? ""}
                  disabled={busy || configuration.storage === "read_only"}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      preferredProviderId: event.target.value || null,
                    });
                    setMessage("");
                  }}
                >
                  <option value="">Sin preferencia</option>
                  {configuration.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.displayName}
                    </option>
                  ))}
                </select>
                <small>
                  No cambia las rutas del motor ni permite ejecutar un proveedor
                  bloqueado.
                </small>
              </div>
              <div className="field">
                <label htmlFor="ollama-endpoint">
                  Dirección de Ollama local
                </label>
                <select
                  id="ollama-endpoint"
                  value={draft.ollama.endpoint}
                  disabled={busy || configuration.storage === "read_only"}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      ollama: {
                        ...draft.ollama,
                        endpoint: event.target
                          .value as ProviderPreferences["ollama"]["endpoint"],
                      },
                    });
                    setMessage("");
                  }}
                >
                  <option value="http://127.0.0.1:11434">
                    127.0.0.1:11434
                  </option>
                  <option value="http://localhost:11434">
                    localhost:11434
                  </option>
                </select>
                <small>
                  Solo loopback. No se comprueba ni se contacta el servicio.
                </small>
              </div>
              <div className="field">
                <label htmlFor="ollama-model">
                  Modelo local de Ollama (opcional)
                </label>
                <input
                  id="ollama-model"
                  value={draft.ollama.model}
                  maxLength={120}
                  pattern="[a-zA-Z0-9._:/\-]*"
                  placeholder="Nombre del modelo instalado"
                  disabled={busy || configuration.storage === "read_only"}
                  onChange={(event) => {
                    setDraft({
                      ...draft,
                      ollama: { ...draft.ollama, model: event.target.value },
                    });
                    setMessage("");
                  }}
                />
                <small>
                  No se descargan modelos. No introduzcas credenciales.
                </small>
              </div>
              <div className="formActions fieldWide">
                <button
                  type="submit"
                  disabled={busy || configuration.storage === "read_only"}
                >
                  {busy ? "Guardando…" : "Guardar preferencias"}
                </button>
                <span>Sin login, sin tráfico externo, sin costes de API.</span>
              </div>
            </form>
            {message && (
              <p className="saveNotice" role="status">
                {message}
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
