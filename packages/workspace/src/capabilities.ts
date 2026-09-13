import type { CapabilityDescriptor } from "@trivergence/contracts";

export const workspaceCapabilityIds = {
  read: "workspace.file.read",
  search: "workspace.search.literal",
  gitStatus: "workspace.git.status",
  gitDiff: "workspace.git.diff",
} as const;

const common = {
  version: "1.0.0",
  subsystem: "workspace" as const,
  status: "available" as const,
  mode: "structured" as const,
  dependencies: [],
};

export const createWorkspaceCapabilities = (
  gitAvailable: boolean,
): CapabilityDescriptor[] => [
  {
    ...common,
    id: workspaceCapabilityIds.read,
    displayName: "Leer archivo UTF-8 del workspace",
    action: {
      tool: "workspace.readText",
      toolVersion: "1",
      kinds: ["read"],
      risk: "safe",
      summary: "Lee un archivo UTF-8 acotado dentro del workspace.",
    },
    routing: {
      objectiveTerms: [
        "leer",
        "read",
        "abrir archivo",
        "contenido del archivo",
        "file content",
      ],
      priority: 60,
    },
  },
  {
    ...common,
    id: workspaceCapabilityIds.search,
    displayName: "Buscar texto literal en el workspace",
    action: {
      tool: "workspace.searchLiteral",
      toolVersion: "1",
      kinds: ["read"],
      risk: "safe",
      summary: "Busca texto literal con exclusiones y presupuestos estrictos.",
    },
    routing: {
      objectiveTerms: [
        "buscar",
        "search",
        "encontrar",
        "localizar",
        "coincidencias",
      ],
      priority: 70,
    },
  },
  ...(gitAvailable
    ? ([
        {
          ...common,
          id: workspaceCapabilityIds.gitStatus,
          displayName: "Consultar estado Git",
          action: {
            tool: "workspace.gitStatus",
            toolVersion: "1",
            kinds: ["read", "git"],
            risk: "safe",
            summary: "Consulta Git status sin modificar el repositorio.",
          },
        },
        {
          ...common,
          id: workspaceCapabilityIds.gitDiff,
          displayName: "Consultar diff Git",
          action: {
            tool: "workspace.gitDiff",
            toolVersion: "1",
            kinds: ["read", "git"],
            risk: "safe",
            summary:
              "Consulta Git diff para archivos explícitamente planificados.",
          },
        },
      ] satisfies CapabilityDescriptor[])
    : []),
];
