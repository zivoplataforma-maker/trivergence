import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  session,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from "electron";
import {
  ipcChannels,
  orchestrationPreviewSchema,
  orchestrationRequestSchema,
  policyDecisionSchema,
  policyEvaluationRequestSchema,
  workspaceApprovalDecisionRequestSchema,
  workspaceApprovalRequestSchema,
  workspaceExecutionStartRequestSchema,
  workspaceHistoryRequestSchema,
  workspacePreviewRequestSchema,
  workspaceRunReferenceSchema,
  workspaceSelectionResponseSchema,
} from "@trivergence/contracts";
import {
  CapabilityRegistry,
  OrchestrationEngine,
} from "@trivergence/orchestration-engine";
import { evaluatePolicy } from "@trivergence/policy-engine";
import { openPersistenceWithRecovery } from "@trivergence/persistence";

import { collectDiagnostics } from "./diagnostics.js";
import {
  isPathInside,
  isTrustedRendererUrl,
  rendererSecurity,
} from "./security.js";
import { DesktopWorkspaceCoordinator } from "./workspace-coordinator.js";

const APP_SCHEME = "trivergence";
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const capabilityRegistry = new CapabilityRegistry("bootstrap-2026-08-04", [
  {
    id: "system.diagnostics.read",
    version: "1",
    displayName: "Leer diagnóstico seguro",
    subsystem: "tool",
    status: "available",
    mode: "structured",
    action: {
      tool: "system.diagnostics.read",
      toolVersion: "1",
      kinds: ["read"],
      risk: "safe",
      summary: "Preparar el diagnóstico local sin acceder a credenciales",
    },
    dependencies: [],
  },
  {
    id: "provider.presence.detect",
    version: "1",
    displayName: "Detectar presencia de proveedores",
    subsystem: "provider",
    status: "available",
    mode: "structured",
    action: {
      tool: "provider.presence.detect",
      toolVersion: "1",
      kinds: ["read"],
      risk: "safe",
      summary: "Detectar ejecutables conocidos sin iniciar sesiones",
    },
    dependencies: ["system.diagnostics.read"],
  },
]);
const orchestrationEngine = new OrchestrationEngine(
  capabilityRegistry,
  randomUUID,
  (canonicalValue) =>
    createHash("sha256").update(canonicalValue, "utf8").digest("hex"),
);

const isSmokeTest =
  process.env.TRIVERGENCE_SMOKE_TEST === "1" && !app.isPackaged;
const isE2eTest = process.env.TRIVERGENCE_E2E_TEST === "1" && !app.isPackaged;
const isDistributionSmokeTest =
  app.isPackaged && process.argv.includes("--distribution-smoke-test");

if (isSmokeTest || isE2eTest || isDistributionSmokeTest) {
  app.disableHardwareAcceleration();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
]);

function developmentOrigin(): string | undefined {
  if (app.isPackaged) return undefined;
  const candidate = process.env.TRIVERGENCE_RENDERER_URL;
  if (!candidate) return undefined;

  try {
    const parsed = new URL(candidate);
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")
      return undefined;
    if (parsed.protocol !== "http:") return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? "";
  if (!isTrustedRendererUrl(url, developmentOrigin())) {
    throw new Error("Untrusted IPC sender");
  }
}

function registerIpcHandlers(
  workspaceCoordinator: DesktopWorkspaceCoordinator,
): void {
  ipcMain.handle(ipcChannels.diagnosticsGet, async (event) => {
    assertTrustedSender(event);
    return collectDiagnostics(app.getVersion());
  });

  ipcMain.handle(ipcChannels.policyEvaluate, (event, payload: unknown) => {
    assertTrustedSender(event);
    const request = policyEvaluationRequestSchema.parse(payload);
    return policyDecisionSchema.parse(
      evaluatePolicy(request.profile, request.action),
    );
  });

  ipcMain.handle(
    ipcChannels.orchestrationPreview,
    (event, payload: unknown) => {
      assertTrustedSender(event);
      const request = orchestrationRequestSchema.parse(payload);
      return orchestrationPreviewSchema.parse(
        orchestrationEngine.preview(request),
      );
    },
  );

  ipcMain.handle(ipcChannels.workspaceSelect, async (event) => {
    assertTrustedSender(event);
    let rootPath: string | undefined;
    const testWorkspace = isE2eTest
      ? process.env.TRIVERGENCE_E2E_WORKSPACE
      : undefined;
    if (testWorkspace) {
      rootPath = testWorkspace;
    } else {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options: OpenDialogOptions = {
        title: "Seleccionar workspace de Trivergence",
        buttonLabel: "Seleccionar carpeta",
        properties: ["openDirectory", "dontAddToRecent"],
      };
      const selection = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      if (selection.canceled) {
        return workspaceSelectionResponseSchema.parse({ status: "cancelled" });
      }
      rootPath = selection.filePaths[0];
    }
    if (!rootPath) {
      return workspaceSelectionResponseSchema.parse({ status: "cancelled" });
    }
    return workspaceSelectionResponseSchema.parse({
      status: "selected",
      workspace: workspaceCoordinator.openWorkspace(rootPath),
    });
  });

  ipcMain.handle(ipcChannels.workspacePreview, (event, payload: unknown) => {
    assertTrustedSender(event);
    return workspaceCoordinator.preview(
      workspacePreviewRequestSchema.parse(payload),
    );
  });

  ipcMain.handle(
    ipcChannels.workspaceExecutionStart,
    (event, payload: unknown) => {
      assertTrustedSender(event);
      return workspaceCoordinator.startExecution(
        workspaceExecutionStartRequestSchema.parse(payload),
      );
    },
  );

  ipcMain.handle(
    ipcChannels.workspaceExecutionGet,
    (event, payload: unknown) => {
      assertTrustedSender(event);
      return workspaceCoordinator.executionState(
        workspaceRunReferenceSchema.parse(payload),
      );
    },
  );

  ipcMain.handle(
    ipcChannels.workspaceExecutionCancel,
    (event, payload: unknown) => {
      assertTrustedSender(event);
      return workspaceCoordinator.cancelExecution(
        workspaceRunReferenceSchema.parse(payload),
      );
    },
  );

  ipcMain.handle(ipcChannels.workspaceHistoryGet, (event, payload: unknown) => {
    assertTrustedSender(event);
    return workspaceCoordinator.history(
      workspaceHistoryRequestSchema.parse(payload),
    );
  });

  ipcMain.handle(
    ipcChannels.workspaceApprovalRequest,
    (event, payload: unknown) => {
      assertTrustedSender(event);
      return workspaceCoordinator.requestApproval(
        workspaceApprovalRequestSchema.parse(payload),
      );
    },
  );

  ipcMain.handle(
    ipcChannels.workspaceApprovalDecide,
    (event, payload: unknown) => {
      assertTrustedSender(event);
      return workspaceCoordinator.decideApproval(
        workspaceApprovalDecisionRequestSchema.parse(payload),
      );
    },
  );
}

function registerApplicationProtocol(): void {
  const rendererRoot = path.resolve(moduleDirectory, "../renderer");

  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app") {
      return new Response("Not found", { status: 404 });
    }

    const rawPath = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const relativePath = rawPath.replace(/^[/\\]+/u, "");
    const target = path.resolve(rendererRoot, relativePath);

    if (!isPathInside(rendererRoot, target)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(target).toString());
  });
}

function installSecurityGuards(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ],
      },
    });
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1_180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    show: false,
    backgroundColor: "#0b1017",
    webPreferences: {
      ...rendererSecurity,
      preload: path.resolve(moduleDirectory, "../preload/index.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, developmentOrigin())) event.preventDefault();
  });
  window.once("ready-to-show", () => {
    if (isSmokeTest || isDistributionSmokeTest) {
      setTimeout(() => app.quit(), 250);
      return;
    }
    if (isE2eTest) return;
    window.show();
  });

  const development = developmentOrigin();
  void window.loadURL(development ?? "trivergence://app/index.html");
  return window;
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

app.on("second-instance", () => {
  const existing = BrowserWindow.getAllWindows()[0];
  if (!existing) return;
  if (existing.isMinimized()) existing.restore();
  existing.focus();
});

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerApplicationProtocol();
  installSecurityGuards();
  const userDataPath = app.getPath("userData");
  const { store: persistence, recovery } = await openPersistenceWithRecovery(
    path.join(userDataPath, "trivergence.sqlite"),
    path.join(userDataPath, "recovery"),
  );
  const recoveredRuns = persistence.health.privilegedActionsAvailable
    ? persistence.recoverRunningRuns(new Date().toISOString()).length
    : 0;
  const workspaceCoordinator = new DesktopWorkspaceCoordinator(
    persistence,
    recoveredRuns,
    recovery,
  );
  registerIpcHandlers(workspaceCoordinator);
  createWindow();

  app.once("before-quit", () => {
    persistence.close();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
