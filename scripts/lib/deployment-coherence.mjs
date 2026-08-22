export function inspectDeploymentBlueprint({ netlifySource = "", vercelSource = "", cloudflareSource = "", packageJsonSource = "" } = {}) {
  const hasNetlify = Boolean(netlifySource.trim());
  const hasVercel = Boolean(vercelSource.trim());
  const hasCloudflare = Boolean(cloudflareSource.trim());
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

  const source = cloudflareSource.trim();
  const passed =
    source.includes("convex deploy") ||
    source.includes("npx convex deploy --cmd 'pnpm build'") ||
    packageJsonSource.includes("convex deploy");
  return {
    status: passed ? "PASS" : "FAIL",
    detail: passed ? "" : "Cloudflare deployment must deploy Convex before the frontend build",
  };
}
