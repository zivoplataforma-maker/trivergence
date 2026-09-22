import { createHash } from "node:crypto";

import {
  executionRequestSchema,
  type ActionRequest,
  type ExecutionBackendManifest,
  type ExecutionDescriptor,
  type ExecutionRequest,
} from "@trivergence/contracts";
import { canonicalizeJson } from "@trivergence/orchestration-engine";
import { describe, expect, it, vi } from "vitest";

import {
  createExecutionRequestDigest,
  createLocalSupervisedBackendManifest,
  ExecutionGateway,
  LocalSupervisedBackend,
  type ExecutionBackend,
  type ProcessRunner,
} from "./execution-gateway.js";
import {
  ProcessSupervisor,
  type ProcessRunResult,
  type ProcessSpec,
} from "./process-supervisor.js";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const digest = (value: string) => sha256(value);

const ids = {
  request: "00000000-0000-4000-8000-000000000001",
  execution: "00000000-0000-4000-8000-000000000002",
  run: "00000000-0000-4000-8000-000000000003",
  plan: "00000000-0000-4000-8000-000000000004",
  context: "00000000-0000-4000-8000-000000000005",
  workspace: "00000000-0000-4000-8000-000000000006",
  approval: "00000000-0000-4000-8000-000000000007",
};

const action: ActionRequest = {
  id: "00000000-0000-4000-8000-000000000008",
  tool: "workspace.exec",
  toolVersion: "1",
  kinds: ["execute"],
  risk: "sensitive",
  effectClass: "side_effectful",
  workspaceId: ids.workspace,
  summary: "Execute an allowlisted local process",
};

const spec: ProcessSpec = {
  executable: process.execPath,
  argv: ["-e", "process.stdout.write('ok')"],
  cwd: process.cwd(),
  environment: {},
  timeoutMs: 2_000,
  gracePeriodMs: 0,
  maxOutputBytes: 1_024,
  networkDestinations: [],
};

const descriptor: ExecutionDescriptor = {
  version: "1",
  kind: "process",
  capabilityId: action.tool,
  capabilityVersion: "1",
  subsystem: "workspace",
  summary: action.summary,
  executable: spec.executable,
  argv: [...spec.argv],
  cwd: spec.cwd,
  environmentNames: [],
  environmentDigest: sha256(canonicalizeJson(spec.environment)),
  networkDestinations: [],
  targets: [],
};

const manifest = createLocalSupervisedBackendManifest({
  id: "trivergence.local-supervised",
  version: "1",
  buildDigest: digest("backend-build"),
});

const seal = (
  value: Omit<ExecutionRequest, "provenance"> & {
    provenance?: { source: "runtime" };
  },
): ExecutionRequest => {
  const withoutDigest = {
    ...value,
    provenance: value.provenance ?? { source: "runtime" as const },
  };
  return executionRequestSchema.parse({
    ...withoutDigest,
    provenance: {
      source: "runtime",
      requestDigest: createExecutionRequestDigest(withoutDigest, sha256),
    },
  });
};

const baseRequest = (): ExecutionRequest =>
  seal({
    schemaVersion: "1",
    id: ids.execution,
    backend: { id: manifest.id, version: manifest.version },
    requiredCapabilities: [
      "process_execution",
      "filesystem_access",
      "cancellation",
      "timeout",
    ],
    binding: {
      objectiveRequestId: ids.request,
      workspaceId: ids.workspace,
      runId: ids.run,
      planId: ids.plan,
      stepId: "step-1",
      capabilityId: descriptor.capabilityId,
      planDigest: digest("plan"),
      registrySnapshotId: digest("registry"),
    },
    projectContext: {
      id: ids.context,
      revision: 1,
      digest: digest("context"),
      objectiveRequestId: ids.request,
      workspaceId: ids.workspace,
    },
    descriptorDigest: sha256(canonicalizeJson(descriptor)),
    effectAssessment: {
      version: "planned-action-v1",
      severity: "side_effectful",
      actionDigest: sha256(canonicalizeJson(action)),
    },
    authorization: {
      policy: {
        decision: "allow",
        reason: "Allowed for test",
        matchedRule: "test.allow",
        rulesetVersion: "1",
      },
      policyDigest: sha256(
        canonicalizeJson({
          decision: "allow",
          reason: "Allowed for test",
          matchedRule: "test.allow",
          rulesetVersion: "1",
        }),
      ),
    },
    requirements: {
      processExecution: true,
      filesystemAccess: "host_process",
      networkRequired: false,
      networkAuthorized: true,
      cancellationRequired: true,
      timeoutMs: spec.timeoutMs,
      maxOutputBytes: spec.maxOutputBytes,
    },
    privacyMode: "standard",
    budget: {
      timeoutMs: spec.timeoutMs,
      maxOutputBytes: spec.maxOutputBytes,
      consumptionAuthority: "runtime",
    },
  });

const successfulRunner = (): ProcessRunner => ({
  validate: vi.fn(),
  run: vi.fn(async (): Promise<ProcessRunResult> => ({
    outcome: "succeeded",
    exitCode: 0,
    stdout: "ok",
    stderr: "",
    outputTruncated: false,
    treeTerminationConfirmed: true,
  })),
});

const gatewayWith = (runner: ProcessRunner = successfulRunner()) => ({
  runner,
  gateway: new ExecutionGateway(
    [new LocalSupervisedBackend(runner, manifest)],
    sha256,
  ),
});

const execute = (
  gateway: ExecutionGateway,
  request = baseRequest(),
  overrides: Partial<{
    descriptor: ExecutionDescriptor;
    action: ActionRequest;
    spec: ProcessSpec;
    signal: AbortSignal;
  }> = {},
) =>
  gateway.execute({
    request,
    descriptor: overrides.descriptor ?? descriptor,
    action: overrides.action ?? action,
    operation: { kind: "process", spec: overrides.spec ?? spec },
    signal: overrides.signal ?? new AbortController().signal,
  });

describe("ExecutionGateway", () => {
  it("prepares a validated request without starting the backend", () => {
    const { gateway, runner } = gatewayWith();
    expect(
      gateway.prepare({
        request: baseRequest(),
        descriptor,
        action,
        operation: { kind: "process", spec },
      }),
    ).toMatchObject({ lifecycle: "prepared", backendId: manifest.id });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("executes a valid request through the supplied ProcessSupervisor", async () => {
    const supervisor = new ProcessSupervisor({
      allowedExecutables: [process.execPath],
      allowedWorkingDirectories: [process.cwd()],
      allowedEnvironmentNames: [],
    });
    const gateway = new ExecutionGateway(
      [new LocalSupervisedBackend(supervisor, manifest)],
      sha256,
    );
    await expect(execute(gateway)).resolves.toMatchObject({
      lifecycle: "succeeded",
      treeTerminationConfirmed: true,
    });
  });

  it("fails closed for an unknown backend", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      backend: { id: "trivergence.missing", version: "1" },
    });
    await expect(execute(gateway, request)).rejects.toThrow("not found");
  });

  it("fails closed when a required capability is absent", async () => {
    const runner = successfulRunner();
    const withoutNetwork: ExecutionBackendManifest = {
      ...manifest,
      capabilities: manifest.capabilities.filter(
        (capability) => capability !== "network_access",
      ),
    };
    const gateway = new ExecutionGateway(
      [new LocalSupervisedBackend(runner, withoutNetwork)],
      sha256,
    );
    const request = seal({
      ...baseRequest(),
      requiredCapabilities: [
        ...baseRequest().requiredCapabilities,
        "network_access",
      ],
    });
    await expect(execute(gateway, request)).rejects.toThrow("lacks capability");
  });

  it("rejects a request that omits a capability required by its operation", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      requiredCapabilities: baseRequest().requiredCapabilities.filter(
        (capability) => capability !== "timeout",
      ),
    });
    await expect(execute(gateway, request)).rejects.toThrow(
      "omitted capability: timeout",
    );
  });

  it("does not treat a capability as policy authorization", async () => {
    const { gateway, runner } = gatewayWith();
    const policy = {
      decision: "deny" as const,
      reason: "Denied",
      matchedRule: "test.deny",
      rulesetVersion: "1" as const,
    };
    const request = seal({
      ...baseRequest(),
      authorization: {
        policy,
        policyDigest: sha256(canonicalizeJson(policy)),
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow("Policy denied");
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("requires a consumed approval when Policy requires approval", async () => {
    const { gateway } = gatewayWith();
    const policy = {
      decision: "require_approval" as const,
      reason: "Approval required",
      matchedRule: "test.approval",
      rulesetVersion: "1" as const,
    };
    const request = seal({
      ...baseRequest(),
      authorization: {
        policy,
        policyDigest: sha256(canonicalizeJson(policy)),
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow(
      "consumed approval",
    );
  });

  it("rejects an approval digest mismatch", async () => {
    const { gateway } = gatewayWith();
    const policy = {
      decision: "require_approval" as const,
      reason: "Approval required",
      matchedRule: "test.approval",
      rulesetVersion: "1" as const,
    };
    const request = seal({
      ...baseRequest(),
      authorization: {
        policy,
        policyDigest: sha256(canonicalizeJson(policy)),
        expectedApprovalDigest: digest("expected"),
        approval: {
          id: ids.approval,
          status: "consumed",
          actionDigest: digest("different"),
          planDigest: digest("plan"),
          rulesetVersion: "1",
          descriptorDigest: sha256(canonicalizeJson(descriptor)),
        },
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow(
      "Approval does not match",
    );
  });

  it("rejects an approval attached to an allow decision", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      authorization: {
        ...baseRequest().authorization,
        expectedApprovalDigest: digest("unexpected"),
        approval: {
          id: ids.approval,
          status: "consumed",
          actionDigest: digest("unexpected"),
          planDigest: digest("plan"),
          rulesetVersion: "1",
          descriptorDigest: sha256(canonicalizeJson(descriptor)),
        },
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow(
      "unexpected approval",
    );
  });

  it("rejects a Project Context objective mismatch", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      projectContext: {
        ...baseRequest().projectContext,
        objectiveRequestId: "00000000-0000-4000-8000-000000000099",
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow("Project Context");
  });

  it("rejects cross-workspace execution", async () => {
    const { gateway } = gatewayWith();
    await expect(
      execute(gateway, baseRequest(), {
        action: {
          ...action,
          workspaceId: "00000000-0000-4000-8000-000000000099",
        },
      }),
    ).rejects.toThrow("Project Context");
  });

  it("rejects an unauthorized network requirement", async () => {
    const { gateway } = gatewayWith();
    const networkSpec = {
      ...spec,
      networkDestinations: ["https://example.invalid"],
    };
    const networkDescriptor = {
      ...descriptor,
      networkDestinations: ["https://example.invalid"],
    };
    const request = seal({
      ...baseRequest(),
      requiredCapabilities: [
        ...baseRequest().requiredCapabilities,
        "network_access",
      ],
      descriptorDigest: sha256(canonicalizeJson(networkDescriptor)),
      requirements: {
        ...baseRequest().requirements,
        networkRequired: true,
        networkAuthorized: false,
      },
    });
    await expect(
      execute(gateway, request, {
        descriptor: networkDescriptor,
        spec: networkSpec,
      }),
    ).rejects.toThrow("Network execution is not authorized");
  });

  it("rejects network execution in private mode", async () => {
    const { gateway } = gatewayWith();
    const networkSpec = {
      ...spec,
      networkDestinations: ["https://example.invalid"],
    };
    const networkDescriptor = {
      ...descriptor,
      networkDestinations: ["https://example.invalid"],
    };
    const request = seal({
      ...baseRequest(),
      requiredCapabilities: [
        ...baseRequest().requiredCapabilities,
        "network_access",
      ],
      descriptorDigest: sha256(canonicalizeJson(networkDescriptor)),
      privacyMode: "private",
      requirements: {
        ...baseRequest().requirements,
        networkRequired: true,
        networkAuthorized: true,
      },
    });
    await expect(
      execute(gateway, request, {
        descriptor: networkDescriptor,
        spec: networkSpec,
      }),
    ).rejects.toThrow("Network execution is not authorized");
  });

  it("rejects unsupported workspace confinement claims", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      requirements: {
        ...baseRequest().requirements,
        filesystemAccess: "workspace_confined",
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow(
      "cannot guarantee workspace confinement",
    );
  });

  it("propagates timeout outcomes and applied limits", async () => {
    const runner = successfulRunner();
    runner.run = vi.fn(async (): Promise<ProcessRunResult> => ({
      outcome: "timed_out",
      exitCode: null,
      stdout: "",
      stderr: "",
      outputTruncated: false,
      treeTerminationConfirmed: true,
    }));
    const { gateway } = gatewayWith(runner);
    await expect(execute(gateway)).resolves.toMatchObject({
      lifecycle: "timed_out",
      appliedLimits: { timeoutMs: 2_000, maxOutputBytes: 1_024 },
    });
  });

  it("passes the caller cancellation signal to the existing supervisor", async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = successfulRunner();
    const { gateway } = gatewayWith(runner);
    await execute(gateway, baseRequest(), { signal: controller.signal });
    expect(runner.run).toHaveBeenCalledWith(spec, controller.signal);
  });

  it("keeps incomplete process-tree termination visible", async () => {
    const runner = successfulRunner();
    runner.run = vi.fn(async (): Promise<ProcessRunResult> => ({
      outcome: "cancelled",
      exitCode: null,
      stdout: "",
      stderr: "",
      outputTruncated: false,
      treeTerminationConfirmed: false,
    }));
    const { gateway } = gatewayWith(runner);
    await expect(execute(gateway)).resolves.toMatchObject({
      lifecycle: "cancelled",
      treeTerminationConfirmed: false,
    });
  });

  it("preserves request, descriptor, and backend provenance", async () => {
    const { gateway } = gatewayWith();
    const request = baseRequest();
    await expect(execute(gateway, request)).resolves.toMatchObject({
      provenance: {
        requestDigest: request.provenance.requestDigest,
        descriptorDigest: request.descriptorDigest,
        backendBuildDigest: manifest.provenance.buildDigest,
      },
    });
  });

  it("rejects inconsistent budget limits", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      budget: { ...baseRequest().budget, timeoutMs: 1_000 },
    });
    await expect(execute(gateway, request)).rejects.toThrow(
      "limits are inconsistent",
    );
  });

  it("does not place process arguments in the execution request", () => {
    const serialized = JSON.stringify(baseRequest());
    expect(serialized).not.toContain("process.stdout.write");
    expect(baseRequest().privacyMode).toBe("standard");
  });

  it("rejects an invalid backend manifest", () => {
    const runner = successfulRunner();
    expect(
      () =>
        new LocalSupervisedBackend(runner, {
          ...manifest,
          isolation: { level: "none", sandboxed: true },
        } as unknown as ExecutionBackendManifest),
    ).toThrow();
  });

  it("rejects an invalid execution result", async () => {
    const backend: ExecutionBackend = {
      manifest,
      execute: vi.fn(async () => ({ outcome: "success" }) as never),
    };
    const gateway = new ExecutionGateway([backend], sha256);
    await expect(execute(gateway)).rejects.toThrow("invalid result");
  });

  it("rejects duplicate backend identities", () => {
    const runner = successfulRunner();
    expect(
      () =>
        new ExecutionGateway(
          [
            new LocalSupervisedBackend(runner, manifest),
            new LocalSupervisedBackend(runner, manifest),
          ],
          sha256,
        ),
    ).toThrow("Duplicate execution backend");
  });

  it("rejects a process operation that differs from its descriptor", async () => {
    const { gateway } = gatewayWith();
    await expect(
      execute(gateway, baseRequest(), {
        spec: { ...spec, argv: ["-e", "process.exit(2)"] },
      }),
    ).rejects.toThrow("does not match");
  });

  it("rejects an effect assessment that differs from the planned action", async () => {
    const { gateway } = gatewayWith();
    const request = seal({
      ...baseRequest(),
      effectAssessment: {
        ...baseRequest().effectAssessment,
        severity: "read_only",
      },
    });
    await expect(execute(gateway, request)).rejects.toThrow("Planner effect");
  });

  it("rejects request tampering after the provenance digest is sealed", async () => {
    const { gateway } = gatewayWith();
    const request = {
      ...baseRequest(),
      binding: { ...baseRequest().binding, stepId: "step-tampered" },
    };
    await expect(execute(gateway, request)).rejects.toThrow(
      "request digest mismatch",
    );
  });

  it("uses the exact supplied runner instead of constructing a supervisor", async () => {
    const runner = successfulRunner();
    const { gateway } = gatewayWith(runner);
    await execute(gateway);
    expect(runner.validate).toHaveBeenCalledOnce();
    expect(runner.run).toHaveBeenCalledOnce();
  });
});
