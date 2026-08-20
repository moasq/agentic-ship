import {
  createPlausibleClient,
  getPublicPlausibleConfig,
  isValidPlausibleDomain,
  isValidPlausibleScriptUrl,
  PLAUSIBLE_API_HOST_ENV,
  PLAUSIBLE_DOMAIN_ENV,
  PLAUSIBLE_SCRIPT_URL_ENV,
} from "./plausible.mjs";

import {
  createUmamiClient,
  getPublicUmamiConfig,
  isValidUmamiHostUrl,
  isValidUmamiWebsiteId,
  UMAMI_DOMAINS_ENV,
  UMAMI_HOST_URL_ENV,
  UMAMI_SCRIPT_URL_ENV,
  UMAMI_WEBSITE_ID_ENV,
} from "./umami.mjs";

import { scrubObject, scrubString, scrubUrl } from "./privacy.mjs";

export * from "./privacy.mjs";
export * from "./plausible.mjs";
export * from "./umami.mjs";

export const ANALYTICS_PROVIDERS = ["posthog", "plausible", "umami"];

export const POSTHOG_PUBLIC_KEY_ENV = "NEXT_PUBLIC_POSTHOG_KEY";
export const ANALYTICS_PROVIDER_ENV = "ANALYTICS_PROVIDER";

function parseEnv(stdout) {
  const map = new Map();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match) {
      map.set(match[1], match[2].trim());
    }
  }
  return map;
}

/**
 * Factory for creating an analytics client for the selected provider.
 * Enforces mutual exclusivity: selecting Plausible will never initialize PostHog or Umami;
 * selecting Umami will never initialize PostHog or Plausible; selecting PostHog will never initialize Plausible or Umami.
 *
 * @param {"posthog"|"plausible"|"umami"} provider
 * @param {Record<string, any>} [options]
 * @returns {object}
 */
export function createAnalyticsClient(provider, options = {}) {
  const normalizedProvider = typeof provider === "string" ? provider.toLowerCase().trim() : "none";

  if (normalizedProvider === "plausible") {
    return createPlausibleClient({
      domain: options.domain || process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN,
      scriptUrl: options.scriptUrl || process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL,
      apiHost: options.apiHost || process.env.NEXT_PUBLIC_PLAUSIBLE_API_HOST,
      ...options,
    });
  }

  if (normalizedProvider === "umami") {
    return createUmamiClient({
      websiteId: options.websiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      hostUrl: options.hostUrl || process.env.NEXT_PUBLIC_UMAMI_HOST_URL,
      domains: options.domains || process.env.NEXT_PUBLIC_UMAMI_DOMAINS,
      scriptUrl: options.scriptUrl || process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
      ...options,
    });
  }

  if (normalizedProvider === "posthog") {
    const apiKey = options.apiKey || process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const enabled = Boolean(apiKey && apiKey.startsWith("phc_"));

    if (!enabled) {
      return {
        provider: "posthog",
        isInitialized: () => false,
        getConfig: () => ({ enabled: false, provider: "posthog", apiKey: null }),
        track: () => ({ success: true, delivered: false, reason: "unconfigured" }),
        capture: () => ({ success: true, delivered: false, reason: "unconfigured" }),
        identify: () => ({ success: true, delivered: false, reason: "unconfigured" }),
      };
    }

    return {
      provider: "posthog",
      isInitialized: () => true,
      getConfig: () => ({ enabled: true, provider: "posthog", apiKey }),
      track: (eventName, properties) => ({
        success: true,
        delivered: true,
        eventName: scrubString(String(eventName || "custom_event")),
        properties: scrubObject(properties || {}),
      }),
      capture: (eventName, properties) => ({
        success: true,
        delivered: true,
        eventName: scrubString(String(eventName || "custom_event")),
        properties: scrubObject(properties || {}),
      }),
      identify: (distinctId) => ({
        success: true,
        delivered: true,
        distinctId: scrubString(String(distinctId || "anonymous")),
      }),
    };
  }

  // Safe fallback no-op client
  return {
    provider: "none",
    isInitialized: () => false,
    getConfig: () => ({ enabled: false, provider: "none" }),
    track: () => ({ success: true, delivered: false, reason: "unconfigured" }),
    trackEvent: () => ({ success: true, delivered: false, reason: "unconfigured" }),
    trackPageview: () => ({ success: true, delivered: false, reason: "unconfigured" }),
    capture: () => ({ success: true, delivered: false, reason: "unconfigured" }),
    identify: () => ({ success: true, delivered: false, reason: "unconfigured" }),
  };
}

/**
 * Inspect and audit production analytics environment for preflight checks.
 *
 * @param {string|Map<string, string>} stdout
 * @param {{ selectedProvider?: string, catalogDirectory?: string }} [options]
 * @returns {{ status: "PASS"|"WARN"|"FAIL"|"SKIP", provider: string, providerDisplayName: string, detail: string }}
 */
export function inspectProductionAnalyticsEnvironment(stdout, { selectedProvider } = {}) {
  const values = typeof stdout === "string" ? parseEnv(stdout) : stdout;
  const has = (k) => values.has(k) && (values.get(k) ?? "").trim().length > 0;
  const val = (k) => (values.get(k) ?? "").trim();

  // 1. Check for personal PostHog keys in client environment
  if (has("NEXT_PUBLIC_POSTHOG_KEY") && val("NEXT_PUBLIC_POSTHOG_KEY").startsWith("phx_")) {
    return {
      status: "FAIL",
      provider: "posthog",
      providerDisplayName: "PostHog",
      detail: "NEXT_PUBLIC_POSTHOG_KEY contains a personal phx_ key. Use public phc_ project keys only in browser bundles.",
    };
  }

  // 2. Determine target provider
  let provider = selectedProvider ? selectedProvider.toLowerCase().trim() : null;
  if (!provider) {
    if (has(ANALYTICS_PROVIDER_ENV)) {
      provider = val(ANALYTICS_PROVIDER_ENV).toLowerCase();
    } else if (has(PLAUSIBLE_DOMAIN_ENV)) {
      provider = "plausible";
    } else if (has(UMAMI_WEBSITE_ID_ENV) || has(UMAMI_HOST_URL_ENV)) {
      provider = "umami";
    } else if (has(POSTHOG_PUBLIC_KEY_ENV)) {
      provider = "posthog";
    }
  }

  if (!provider) {
    return {
      status: "SKIP",
      provider: "none",
      providerDisplayName: "Analytics",
      detail: "Analytics is not configured for production (analytics is optional).",
    };
  }

  // 3. Provider-specific audit
  if (provider === "plausible") {
    const domain = val(PLAUSIBLE_DOMAIN_ENV);
    if (!domain) {
      return {
        status: "FAIL",
        provider: "plausible",
        providerDisplayName: "Plausible",
        detail: "Plausible provider selected but NEXT_PUBLIC_PLAUSIBLE_DOMAIN is not set.",
      };
    }
    if (!isValidPlausibleDomain(domain) || domain === "localhost" || domain.endsWith(".local")) {
      return {
        status: "FAIL",
        provider: "plausible",
        providerDisplayName: "Plausible",
        detail: `Production Plausible domain "${domain}" is not a valid production domain.`,
      };
    }
    if (has(PLAUSIBLE_SCRIPT_URL_ENV) && !isValidPlausibleScriptUrl(val(PLAUSIBLE_SCRIPT_URL_ENV))) {
      return {
        status: "FAIL",
        provider: "plausible",
        providerDisplayName: "Plausible",
        detail: `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL "${val(PLAUSIBLE_SCRIPT_URL_ENV)}" must be a valid HTTPS URL.`,
      };
    }
    return {
      status: "PASS",
      provider: "plausible",
      providerDisplayName: "Plausible",
      detail: "Production Plausible analytics domain is configured and valid.",
    };
  }

  if (provider === "umami") {
    const websiteId = val(UMAMI_WEBSITE_ID_ENV);
    const hostUrl = val(UMAMI_HOST_URL_ENV);
    if (!websiteId) {
      return {
        status: "FAIL",
        provider: "umami",
        providerDisplayName: "Umami",
        detail: "Umami provider selected but NEXT_PUBLIC_UMAMI_WEBSITE_ID is not set.",
      };
    }
    if (!isValidUmamiWebsiteId(websiteId)) {
      return {
        status: "FAIL",
        provider: "umami",
        providerDisplayName: "Umami",
        detail: `Production Umami Website ID "${websiteId}" is not a valid UUID.`,
      };
    }
    if (!hostUrl) {
      return {
        status: "FAIL",
        provider: "umami",
        providerDisplayName: "Umami",
        detail: "Umami provider selected but NEXT_PUBLIC_UMAMI_HOST_URL is not set.",
      };
    }
    if (!isValidUmamiHostUrl(hostUrl)) {
      return {
        status: "FAIL",
        provider: "umami",
        providerDisplayName: "Umami",
        detail: `Production Umami Host URL "${hostUrl}" must be a valid HTTPS URL.`,
      };
    }
    return {
      status: "PASS",
      provider: "umami",
      providerDisplayName: "Umami",
      detail: "Production Umami analytics website ID and host URL are configured and valid.",
    };
  }

  if (provider === "posthog") {
    const key = val(POSTHOG_PUBLIC_KEY_ENV);
    if (!key) {
      return {
        status: "FAIL",
        provider: "posthog",
        providerDisplayName: "PostHog",
        detail: "PostHog provider selected but NEXT_PUBLIC_POSTHOG_KEY is not set.",
      };
    }
    if (!key.startsWith("phc_")) {
      return {
        status: "FAIL",
        provider: "posthog",
        providerDisplayName: "PostHog",
        detail: `Production PostHog key "${key}" must be a public project key starting with phc_.`,
      };
    }
    return {
      status: "PASS",
      provider: "posthog",
      providerDisplayName: "PostHog",
      detail: "Production PostHog analytics key is configured and valid.",
    };
  }

  return {
    status: "FAIL",
    provider,
    providerDisplayName: provider,
    detail: `Unknown analytics provider "${provider}". Expected one of: ${ANALYTICS_PROVIDERS.join(", ")}.`,
  };
}
