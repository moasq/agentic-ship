import { isIP } from "node:net";

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function requireHttpsUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${name} must be a valid HTTPS URL`);
  if (url.username || url.password) throw new Error(`${name} must not contain credentials`);
  return url;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function verifyCloudflareLiveEnvironment({
  config,
  configPath,
  env = process.env,
  commandRunner,
  fetchImpl = fetch,
} = {}) {
  if (!commandRunner) throw new Error("Cloudflare live verification needs a command runner");
  const productionUrl = requireHttpsUrl(env.CLOUDFLARE_PRODUCTION_URL, "CLOUDFLARE_PRODUCTION_URL");
  if (productionUrl.hostname.endsWith(".workers.dev")) throw new Error("CLOUDFLARE_PRODUCTION_URL must be the production custom domain");
  if (isIP(productionUrl.hostname) || productionUrl.hostname === "localhost" || !productionUrl.hostname.includes(".")) {
    throw new Error("CLOUDFLARE_PRODUCTION_URL must use a public custom-domain hostname");
  }
  const previewUrl = requireHttpsUrl(env.CLOUDFLARE_PREVIEW_URL, "CLOUDFLARE_PREVIEW_URL");
  if (!previewUrl.hostname.endsWith(".workers.dev")) throw new Error("CLOUDFLARE_PREVIEW_URL must use a Cloudflare workers.dev preview hostname");
  const previewLabel = previewUrl.hostname.split(".")[0];
  if (!previewLabel.endsWith(`-${config.name}`) || previewLabel.length <= config.name.length + 1) {
    throw new Error("CLOUDFLARE_PREVIEW_URL must be a version or alias preview for the selected Worker");
  }
  if (previewUrl.origin === productionUrl.origin) throw new Error("Cloudflare preview and production URLs must differ");
  const callbackUrl = requireHttpsUrl(env.CLOUDFLARE_AUTH_CALLBACK_URL, "CLOUDFLARE_AUTH_CALLBACK_URL");
  if (callbackUrl.origin !== productionUrl.origin) throw new Error("CLOUDFLARE_AUTH_CALLBACK_URL must use the production origin");
  const convexUrl = requireHttpsUrl(env.NEXT_PUBLIC_CONVEX_URL, "NEXT_PUBLIC_CONVEX_URL");
  if (!convexUrl.hostname.endsWith(".convex.cloud")) throw new Error("NEXT_PUBLIC_CONVEX_URL must target convex.cloud");
  const healthQuery = env.CLOUDFLARE_CONVEX_HEALTH_QUERY?.trim();
  if (!/^[A-Za-z0-9_/-]+:[A-Za-z0-9_]+$/.test(healthQuery ?? "")) {
    throw new Error("CLOUDFLARE_CONVEX_HEALTH_QUERY must name a public no-argument query");
  }
  const webhookUrls = (env.CLOUDFLARE_WEBHOOK_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => requireHttpsUrl(value, "CLOUDFLARE_WEBHOOK_URLS"));
  if (webhookUrls.length === 0) throw new Error("CLOUDFLARE_WEBHOOK_URLS must list the selected billing and email webhook endpoints");
  if (webhookUrls.some((url) => !url.hostname.endsWith(".convex.site") || url.search || url.hash)) {
    throw new Error("CLOUDFLARE_WEBHOOK_URLS must use secret-free convex.site endpoints");
  }

  const deployments = commandRunner("wrangler", ["deployments", "list", "--json", "--name", config.name, "--config", configPath], { env });
  let deploymentList;
  try {
    deploymentList = JSON.parse(deployments?.stdout ?? "");
  } catch {
    deploymentList = null;
  }
  const current = Array.isArray(deploymentList) ? deploymentList[0] : null;
  const currentVersions = Array.isArray(current?.versions) ? current.versions : [];
  const servingPercentage = currentVersions.reduce((sum, version) => sum + (typeof version?.percentage === "number" ? version.percentage : 0), 0);
  const validCurrent =
    typeof current?.id === "string" &&
    UUID_PATTERN.test(current.id) &&
    typeof current?.created_on === "string" &&
    !Number.isNaN(Date.parse(current.created_on)) &&
    currentVersions.length > 0 &&
    currentVersions.every((version) => typeof version?.version_id === "string" && UUID_PATTERN.test(version.version_id)) &&
    servingPercentage > 99.99 &&
    servingPercentage <= 100;
  if (deployments?.status !== 0 || !validCurrent) {
    throw new Error("Cloudflare has no readable production deployment for the selected Worker");
  }

  const request = async (url, init, name, accepted) => {
    const response = await fetchImpl(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (!accepted(response.status)) throw new Error(`${name} returned HTTP ${response.status}`);
    return response;
  };

  await request(productionUrl, {}, "Cloudflare production URL", (status) => status >= 200 && status < 400);
  await request(previewUrl, {}, "Cloudflare preview URL", (status) => status >= 200 && status < 400);
  await request(new URL("/api/auth/get-session", productionUrl), {}, "Better Auth session endpoint", (status) => status === 200 || status === 401);
  await request(callbackUrl, {}, "Better Auth callback endpoint", (status) => status >= 200 && status < 500 && status !== 404);

  const convex = await request(
    new URL("/api/query", convexUrl),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: healthQuery, args: {}, format: "json" }),
    },
    "Convex health query",
    (status) => status === 200,
  );
  if ((await responseJson(convex))?.status !== "success") throw new Error("Convex health query did not return success");

  for (const webhookUrl of webhookUrls) {
    await request(
      webhookUrl,
      { method: "OPTIONS" },
      `Webhook endpoint ${webhookUrl.origin}${webhookUrl.pathname}`,
      (status) => status >= 200 && status < 500 && status !== 404,
    );
  }

  return {
    productionOrigin: productionUrl.origin,
    previewOrigin: previewUrl.origin,
    webhookCount: webhookUrls.length,
  };
}
