import { describe, expect, it } from "vitest";
import { inspectDeploymentBlueprint } from "./deployment-coherence.mjs";

describe("deployment blueprint coherence", () => {
  it("accepts the Netlify default", () => {
    expect(inspectDeploymentBlueprint({ netlifySource: "command = \"npx convex deploy --cmd 'pnpm build'\"" }).status).toBe("PASS");
  });

  it("accepts the Vercel alternative", () => {
    expect(
      inspectDeploymentBlueprint({
        vercelSource: JSON.stringify({ buildCommand: "npx convex deploy --cmd 'pnpm build'" }),
      }).status,
    ).toBe("PASS");
  });

  it("rejects a stale Vercel build and two active adapters", () => {
    expect(inspectDeploymentBlueprint({ vercelSource: '{"buildCommand":"pnpm build"}' }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ netlifySource: "x", vercelSource: "{}" }).status).toBe("FAIL");
  });
});
