import { contextBridge, ipcRenderer } from "electron";

const channels = {
  diagnosticsGet: "diagnostics:get",
  policyEvaluate: "policy:evaluate",
  orchestrationPreview: "orchestration:preview",
  workspaceSelect: "workspace:select",
  workspacePreview: "workspace:preview",
  workspaceExecutionStart: "workspace:execution:start",
  workspaceExecutionGet: "workspace:execution:get",
  workspaceExecutionCancel: "workspace:execution:cancel",
  workspaceHistoryGet: "workspace:history:get",
  workspaceApprovalRequest: "workspace:approval:request",
  workspaceApprovalDecide: "workspace:approval:decide",
} as const;

const api = Object.freeze({
  getDiagnostics(): Promise<unknown> {
    return ipcRenderer.invoke(channels.diagnosticsGet);
  },
  evaluatePolicy(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.policyEvaluate, request);
  },
  previewOrchestration(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.orchestrationPreview, request);
  },
  selectWorkspace(): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceSelect);
  },
  previewWorkspace(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspacePreview, request);
  },
  startWorkspaceExecution(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceExecutionStart, request);
  },
  getWorkspaceExecution(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceExecutionGet, request);
  },
  cancelWorkspaceExecution(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceExecutionCancel, request);
  },
  getWorkspaceHistory(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceHistoryGet, request);
  },
  requestWorkspaceApproval(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceApprovalRequest, request);
  },
  decideWorkspaceApproval(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceApprovalDecide, request);
  },
});

contextBridge.exposeInMainWorld("trivergence", api);
