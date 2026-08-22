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

  it("accepts the Cloudflare alternative", () => {
    expect(
      inspectDeploymentBlueprint({
        cloudflareSource: JSON.stringify({ name: "my-worker", main: "src/index.ts" }),
        packageJsonSource: JSON.stringify({ scripts: { build: "npx convex deploy --cmd 'pnpm build'" } }),
      }).status,
    ).toBe("PASS");
    expect(
      inspectDeploymentBlueprint({
        cloudflareSource: 'name = "my-worker"\n# npx convex deploy --cmd \'pnpm build\'\n',
      }).status,
    ).toBe("PASS");
  });

  it("rejects a stale Vercel build and multiple active adapters", () => {
    expect(inspectDeploymentBlueprint({ vercelSource: '{"buildCommand":"pnpm build"}' }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ netlifySource: "x", vercelSource: "{}" }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ netlifySource: "x", cloudflareSource: "x" }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ vercelSource: "{}", cloudflareSource: "x" }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ cloudflareSource: 'name = "test"' }).status).toBe("FAIL");
  });
});
