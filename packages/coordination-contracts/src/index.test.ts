import { describe, expect, it } from "vitest";

import { coordinationBudgetSchema, coordinationInputSchema } from "./index.js";

describe("coordination contracts", () => {
  it("applies conservative M6 defaults", () => {
    const budget = coordinationBudgetSchema.parse(
      coordinationInputSchema.parse({}),
    );
    expect(budget).toMatchObject({
      maxAgents: 3,
      maxProviderCalls: 4,
      maxReplans: 1,
      maxCostMicrounits: 0,
      retentionDays: 30,
    });
  });

  it("rejects unbounded coordination requests", () => {
    expect(() => coordinationInputSchema.parse({ maxAgents: 4 })).toThrow();
    expect(() => coordinationInputSchema.parse({ maxReplans: 2 })).toThrow();
  });
});
