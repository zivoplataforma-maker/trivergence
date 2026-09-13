import { describe, expect, it } from "vitest";

import type { ActionRequest, PolicyProfile } from "@trivergence/contracts";

import { evaluatePolicy } from "./index.js";

const baseAction: ActionRequest = {
  id: "d0c1cd22-0cf4-4d08-a88f-0829a0988469",
  kinds: ["read"],
  risk: "safe",
  summary: "Listar archivos permitidos",
  tool: "workspace.list",
  toolVersion: "1",
};

describe("evaluatePolicy", () => {
  it.each<PolicyProfile>(["observer", "assistant", "developer"])(
    "allows a safe read for %s",
    (profile) => {
      expect(evaluatePolicy(profile, baseAction)).toMatchObject({
        decision: "allow",
        matchedRule: "safe-read-allow",
      });
    },
  );

  it("denies credential access for every profile", () => {
    for (const profile of ["observer", "assistant", "developer"] as const) {
      expect(
        evaluatePolicy(profile, {
          ...baseAction,
          kinds: ["credentials"],
          risk: "sensitive",
        }).decision,
      ).toBe("deny");
    }
  });

  it("allows safe read-only Git inspection but not Git effects", () => {
    expect(
      evaluatePolicy("observer", {
        ...baseAction,
        kinds: ["read", "git"],
      }).decision,
    ).toBe("allow");
    expect(
      evaluatePolicy("observer", {
        ...baseAction,
        kinds: ["write", "git"],
        risk: "guarded",
      }).decision,
    ).toBe("deny");
  });

  it("requires one-time review for destructive developer actions", () => {
    expect(
      evaluatePolicy("developer", {
        ...baseAction,
        kinds: ["delete"],
        risk: "destructive",
      }),
    ).toMatchObject({
      decision: "require_approval",
      matchedRule: "privileged-always-approve",
    });
  });

  it("denies non-read actions for the observer", () => {
    expect(
      evaluatePolicy("observer", {
        ...baseAction,
        kinds: ["execute"],
        risk: "guarded",
      }).decision,
    ).toBe("deny");
  });

  it("only auto-allows a guarded write in developer mode", () => {
    const write: ActionRequest = {
      ...baseAction,
      kinds: ["write"],
      risk: "guarded",
    };

    expect(evaluatePolicy("assistant", write).decision).toBe(
      "require_approval",
    );
    expect(evaluatePolicy("developer", write).decision).toBe("allow");
  });
});
