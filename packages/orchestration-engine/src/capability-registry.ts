import {
  capabilityDescriptorSchema,
  type CapabilityDescriptor,
} from "@trivergence/contracts";

const registrySchema = capabilityDescriptorSchema.array().min(1).max(1_000);

export class CapabilityRegistry {
  readonly version: string;
  readonly #capabilities: ReadonlyMap<string, CapabilityDescriptor>;

  constructor(version: string, capabilities: readonly CapabilityDescriptor[]) {
    if (version.length < 1 || version.length > 80) {
      throw new Error(
        "Registry version must contain between 1 and 80 characters",
      );
    }
    this.version = version;
    const parsed = registrySchema.parse(capabilities);
    const byId = new Map<string, CapabilityDescriptor>();

    for (const capability of parsed) {
      if (byId.has(capability.id)) {
        throw new Error(`Duplicate capability: ${capability.id}`);
      }
      if (capability.dependencies.includes(capability.id)) {
        throw new Error(`Capability cannot depend on itself: ${capability.id}`);
      }
      byId.set(capability.id, capabilityDescriptorSchema.parse(capability));
    }

    this.#capabilities = byId;
  }

  get(id: string): CapabilityDescriptor | undefined {
    const capability = this.#capabilities.get(id);
    return capability
      ? capabilityDescriptorSchema.parse(capability)
      : undefined;
  }

  list(): CapabilityDescriptor[] {
    return [...this.#capabilities.values()].map((capability) =>
      capabilityDescriptorSchema.parse(capability),
    );
  }
}
