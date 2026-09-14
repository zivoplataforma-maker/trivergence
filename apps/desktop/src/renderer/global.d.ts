declare global {
  interface Window {
    trivergence: {
      getProviderConfiguration(): Promise<unknown>;
      saveProviderConfiguration(request: unknown): Promise<unknown>;
      getDiagnostics(): Promise<unknown>;
      evaluatePolicy(request: unknown): Promise<unknown>;
      previewOrchestration(request: unknown): Promise<unknown>;
      selectWorkspace(): Promise<unknown>;
      previewWorkspace(request: unknown): Promise<unknown>;
      startWorkspaceExecution(request: unknown): Promise<unknown>;
      getWorkspaceExecution(request: unknown): Promise<unknown>;
      cancelWorkspaceExecution(request: unknown): Promise<unknown>;
      getWorkspaceHistory(request: unknown): Promise<unknown>;
      requestWorkspaceApproval(request: unknown): Promise<unknown>;
      decideWorkspaceApproval(request: unknown): Promise<unknown>;
    };
  }
}

export {};
