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
    const packageJsonSource = JSON.stringify({
      dependencies: { vinext: "1.0.0-beta.8", "@vinext/cloudflare": "1.0.0-beta.6" },
      scripts: {
        "build:vinext": "vinext build",
        "build:cloudflare": "node scripts/build-cloudflare.mjs",
        "check:cloudflare-build": "node scripts/build-cloudflare.mjs --dry-run",
        "deploy:cloudflare": "vinext-cloudflare deploy --skip-build --config dist/server/wrangler.json",
        "preview:cloudflare": "wrangler versions upload --config dist/server/wrangler.json",
      },
    });
    expect(
      inspectDeploymentBlueprint({
        cloudflareSources: [
          {
            path: "wrangler.json",
            source: JSON.stringify({
              name: "my-worker",
              account_id: "0123456789abcdef0123456789abcdef",
              main: "dist/server/index.js",
              compatibility_date: "2026-08-29",
              compatibility_flags: ["nodejs_compat"],
            }),
          },
        ],
        packageJsonSource,
      }).status,
    ).toBe("PASS");
  });

  it("rejects a stale Vercel build and multiple active adapters", () => {
    expect(inspectDeploymentBlueprint({ vercelSource: '{"buildCommand":"pnpm build"}' }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ netlifySource: "x", vercelSource: "{}" }).status).toBe("FAIL");
    const cloudflareSources = [{ path: "wrangler.json", source: "x" }];
    expect(inspectDeploymentBlueprint({ netlifySource: "x", cloudflareSources }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ vercelSource: "{}", cloudflareSources }).status).toBe("FAIL");
    expect(inspectDeploymentBlueprint({ cloudflareSources }).status).toBe("FAIL");
  });
});
