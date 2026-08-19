export function inspectDeploymentBlueprint({ netlifySource = "", vercelSource = "" } = {}) {
  const hasNetlify = Boolean(netlifySource.trim());
  const hasVercel = Boolean(vercelSource.trim());
  if (!hasNetlify && !hasVercel) {
    return { status: "SKIP", detail: "no downstream product deployment exists in this tool repository" };
  }
  if (hasNetlify && hasVercel) {
    return { status: "FAIL", detail: "both netlify.toml and vercel.json are present; keep only the selected deployment adapter" };
  }
  if (hasNetlify) {
    const passed = netlifySource.includes("npx convex deploy --cmd 'pnpm build'");
    return {
      status: passed ? "PASS" : "FAIL",
      detail: passed ? "" : "netlify.toml must deploy Convex before the frontend build",
    };
  }

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
