import type {
  ActionRequest,
  PolicyDecision,
  PolicyProfile,
} from "@trivergence/contracts";

const decision = (
  value: PolicyDecision["decision"],
  matchedRule: string,
  reason: string,
): PolicyDecision => ({
  decision: value,
  matchedRule,
  reason,
  rulesetVersion: "1",
});

export function evaluatePolicy(
  profile: PolicyProfile,
  action: ActionRequest,
): PolicyDecision {
  const kinds = new Set(action.kinds);

  if (kinds.has("credentials")) {
    return decision(
      "deny",
      "credentials-deny",
      "Trivergence no puede acceder ni operar con credenciales de proveedores o del sistema.",
    );
  }

  if (
    action.risk === "destructive" ||
    kinds.has("delete") ||
    kinds.has("system")
  ) {
    if (profile === "observer") {
      return decision(
        "deny",
        "observer-privileged-deny",
        "El perfil Observador bloquea acciones destructivas o del sistema.",
      );
    }

    return decision(
      "require_approval",
      "privileged-always-approve",
      "Las acciones destructivas o del sistema requieren aprobación explícita para cada solicitud.",
    );
  }

  const isSafeRead =
    action.risk === "safe" &&
    kinds.has("read") &&
    [...kinds].every((kind) => kind === "read" || kind === "git");

  if (isSafeRead) {
    return decision(
      "allow",
      "safe-read-allow",
      "La acción es una lectura segura, incluida inspección Git sin cambios.",
    );
  }

  if (profile === "observer") {
    return decision(
      "deny",
      "observer-non-read-deny",
      "El perfil Observador solo permite lecturas clasificadas como seguras.",
    );
  }

  const developerWorkspaceWrite =
    profile === "developer" &&
    action.risk === "guarded" &&
    kinds.size === 1 &&
    kinds.has("write");

  if (developerWorkspaceWrite) {
    return decision(
      "allow",
      "developer-workspace-write-allow",
      "El perfil Desarrollador permite escritura limitada; el runtime aún debe verificar el workspace.",
    );
  }

  return decision(
    "require_approval",
    "guarded-action-approve",
    "La acción tiene efectos, acceso de red o ejecución y requiere revisión local.",
  );
}
