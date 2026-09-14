import { contextBridge, ipcRenderer } from "electron";

const channels = {
  providerConfigurationGet: "providers:configuration:get",
  providerConfigurationSave: "providers:configuration:save",
  diagnosticsGet: "diagnostics:get",
  persistenceStatusGet: "persistence:status:get",
  policyEvaluate: "policy:evaluate",
  orchestrationPreview: "orchestration:preview",
  workspaceSelect: "workspace:select",
  workspacePreview: "workspace:preview",
  workspaceExecutionStart: "workspace:execution:start",
  workspaceExecutionGet: "workspace:execution:get",
  workspaceExecutionCancel: "workspace:execution:cancel",
  workspaceHistoryGet: "workspace:history:get",
  workspaceAuditGet: "workspace:audit:get",
  workspaceRetentionGet: "workspace:retention:get",
  workspaceRetentionSave: "workspace:retention:save",
  workspaceDataDelete: "workspace:data:delete",
  workspaceDataExport: "workspace:data:export",
  workspaceApprovalRequest: "workspace:approval:request",
  workspaceApprovalDecide: "workspace:approval:decide",
} as const;

const api = Object.freeze({
  getProviderConfiguration(): Promise<unknown> {
    return ipcRenderer.invoke(channels.providerConfigurationGet);
  },
  saveProviderConfiguration(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.providerConfigurationSave, request);
  },
  getDiagnostics(): Promise<unknown> {
    return ipcRenderer.invoke(channels.diagnosticsGet);
  },
  getPersistenceStatus(): Promise<unknown> {
    return ipcRenderer.invoke(channels.persistenceStatusGet);
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
  getWorkspaceAudit(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceAuditGet, request);
  },
  getWorkspaceRetention(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceRetentionGet, request);
  },
  saveWorkspaceRetention(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceRetentionSave, request);
  },
  deleteWorkspaceData(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceDataDelete, request);
  },
  exportWorkspaceData(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceDataExport, request);
  },
  requestWorkspaceApproval(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceApprovalRequest, request);
  },
  decideWorkspaceApproval(request: unknown): Promise<unknown> {
    return ipcRenderer.invoke(channels.workspaceApprovalDecide, request);
  },
});

contextBridge.exposeInMainWorld("trivergence", api);
