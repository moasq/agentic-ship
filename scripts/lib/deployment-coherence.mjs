import { inspectCloudflareBlueprint } from "./connections/cloudflare.mjs";

export function inspectDeploymentBlueprint({ netlifySource = "", vercelSource = "", cloudflareSources = [], packageJsonSource = "" } = {}) {
  const hasNetlify = Boolean(netlifySource.trim());
  const hasVercel = Boolean(vercelSource.trim());
  const hasCloudflare = cloudflareSources.some((entry) => Boolean(entry?.source?.trim()));
  const activeCount = [hasNetlify, hasVercel, hasCloudflare].filter(Boolean).length;

  if (activeCount === 0) {
    return { status: "SKIP", detail: "no downstream product deployment exists in this tool repository" };
  }
  if (activeCount > 1) {
    return { status: "FAIL", detail: "multiple deployment adapters are present; keep only the selected deployment adapter" };
  }
  if (hasNetlify) {
    const passed = netlifySource.includes("npx convex deploy --cmd 'pnpm build'");
    return {
      status: passed ? "PASS" : "FAIL",
      detail: passed ? "" : "netlify.toml must deploy Convex before the frontend build",
    };
  }
  if (hasVercel) {
    let document;
    try {
      document = JSON.parse(vercelSource);
    } catch {
      return { status: "FAIL", detail: "vercel.json is not valid JSON" };
    }
    const passed = document.buildCommand === "npx convex deploy --cmd 'pnpm build'";
    return {
      status: passed ? "PASS" : "FAIL",
      detail: passed ? "" : "vercel.json buildCommand must deploy Convex before the frontend build",
    };
  }

  return inspectCloudflareBlueprint({ configSources: cloudflareSources, packageJsonSource });
}
