import {
  executionDescriptorSchema,
  type ExecutionDescriptor,
  type OrchestrationRequest,
  type PlannedStep,
  type ProviderRecoveryCheckpoint,
  type ProviderStreamEvent,
  type StepEvidence,
  type SubsystemKind,
} from "@trivergence/contracts";

export interface DispatchResult {
  readonly outcome: StepEvidence["outcome"];
  readonly summary: string;
  readonly outputDigest?: string;
  readonly treeTerminationConfirmed?: boolean;
  /** Resultado efímero y validado por el dispatcher; nunca se persiste. */
  readonly output?: unknown;
}

export interface DispatchContext {
  readonly runId: string;
  readonly planId: string;
  readonly request: OrchestrationRequest;
  readonly step: PlannedStep;
  readonly descriptor: ExecutionDescriptor;
  /**
   * Snapshot profundo e inmutable de los outputs de dependencias directas.
   * Nunca otorga autoridad ni expone resultados de pasos no declarados.
   */
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  readonly emit: (event: ProviderStreamEvent) => void;
}

export interface StepDispatcher {
  readonly capabilityId: string;
  readonly capabilityIds?: readonly string[];
  readonly subsystem: SubsystemKind;
  describe(step: PlannedStep): ExecutionDescriptor;
  dispatch(context: DispatchContext): Promise<DispatchResult>;
  recover?(
    context: DispatchContext,
    checkpoint: ProviderRecoveryCheckpoint,
  ): Promise<DispatchResult>;
}

const dispatcherKey = (subsystem: SubsystemKind, capabilityId: string) =>
  `${subsystem}\u0000${capabilityId}`;

export class DispatcherRegistry {
  readonly #dispatchers = new Map<string, StepDispatcher>();

  constructor(dispatchers: readonly StepDispatcher[]) {
    for (const dispatcher of dispatchers) {
      const capabilityIds = dispatcher.capabilityIds ?? [
        dispatcher.capabilityId,
      ];
      for (const capabilityId of capabilityIds) {
        const key = dispatcherKey(dispatcher.subsystem, capabilityId);
        if (this.#dispatchers.has(key)) {
          throw new Error(`Duplicate dispatcher: ${capabilityId}`);
        }
        this.#dispatchers.set(key, dispatcher);
      }
    }
  }

  resolve(step: PlannedStep): StepDispatcher {
    const dispatcher = this.#dispatchers.get(
      dispatcherKey(step.subsystem, step.capabilityId),
    );
    if (!dispatcher) {
      throw new Error(
        `No dispatcher for ${step.subsystem}/${step.capabilityId}`,
      );
    }
    return dispatcher;
  }

  describe(step: PlannedStep): ExecutionDescriptor {
    const descriptor = executionDescriptorSchema.parse(
      this.resolve(step).describe(step),
    );
    if (
      descriptor.capabilityId !== step.capabilityId ||
      descriptor.subsystem !== step.subsystem
    ) {
      throw new Error("Dispatcher descriptor does not match the planned step");
    }
    return descriptor;
  }
}
