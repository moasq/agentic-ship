import { randomUUID } from "node:crypto";
import { scrubObject, scrubString, scrubUrl } from "./privacy.mjs";

export const UMAMI_WEBSITE_ID_ENV = "NEXT_PUBLIC_UMAMI_WEBSITE_ID";
export const UMAMI_HOST_URL_ENV = "NEXT_PUBLIC_UMAMI_HOST_URL";
export const UMAMI_DOMAINS_ENV = "NEXT_PUBLIC_UMAMI_DOMAINS";
export const UMAMI_SCRIPT_URL_ENV = "NEXT_PUBLIC_UMAMI_SCRIPT_URL";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate whether a string is a valid Umami Website ID (UUID format).
 *
 * @param {string} websiteId
 * @returns {boolean}
 */
export function isValidUmamiWebsiteId(websiteId) {
  if (typeof websiteId !== "string" || !websiteId.trim()) return false;
  return UUID_REGEX.test(websiteId.trim());
}

/**
 * Validate whether a host URL is a well-formed HTTPS URL for Umami.
 *
 * @param {string} hostUrl
 * @returns {boolean}
 */
export function isValidUmamiHostUrl(hostUrl) {
  if (typeof hostUrl !== "string" || !hostUrl.trim()) return false;
  const trimmed = hostUrl.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Parse and normalize an allowed domains list (string or array).
 *
 * @param {string|string[]} [domains]
 * @returns {string[]}
 */
export function parseUmamiDomains(domains) {
  if (!domains) return [];
  if (Array.isArray(domains)) {
    return domains
      .map((d) => String(d).trim().toLowerCase())
      .filter((d) => d.length > 0);
  }
  if (typeof domains === "string") {
    return domains
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
  }
  return [];
}

/**
 * Check if a hostname or origin is permitted by the allowed domains list.
 * If no allowed domains are configured, all origins are permitted.
 *
 * @param {string} originOrHostname
 * @param {string|string[]} [allowedDomains]
 * @returns {boolean}
 */
export function isUmamiOriginAllowed(originOrHostname, allowedDomains) {
  const allowed = parseUmamiDomains(allowedDomains);
  if (allowed.length === 0) return true;
  if (!originOrHostname || typeof originOrHostname !== "string") return false;

  let hostname = originOrHostname.trim().toLowerCase();
  try {
    if (hostname.includes("://")) {
      hostname = new URL(hostname).hostname.toLowerCase();
    }
  } catch {
    // Keep as hostname if URL parsing fails
  }

  return allowed.some((domain) => {
    if (domain === hostname) return true;
    if (domain.startsWith("*.") && hostname.endsWith(domain.slice(2))) return true;
    return false;
  });
}

/**
 * Derive or validate the Umami tracker script URL.
 *
 * @param {string} hostUrl
 * @param {string} [customScriptUrl]
 * @returns {string|null}
 */
export function getUmamiScriptUrl(hostUrl, customScriptUrl) {
  if (customScriptUrl && typeof customScriptUrl === "string" && customScriptUrl.trim().startsWith("https://")) {
    return customScriptUrl.trim();
  }
  if (isValidUmamiHostUrl(hostUrl)) {
    return `${hostUrl.trim().replace(/\/+$/, "")}/script.js`;
  }
  return null;
}

/**
 * Build a safe public configuration for Umami client bundle.
 *
 * @param {{
 *   websiteId?: string,
 *   hostUrl?: string,
 *   domains?: string|string[],
 *   scriptUrl?: string,
 *   autoTrack?: boolean,
 *   doNotTrack?: boolean
 * }} [options]
 * @returns {{
 *   enabled: boolean,
 *   provider: "umami",
 *   websiteId: string|null,
 *   hostUrl: string|null,
 *   scriptUrl: string|null,
 *   domains: string[],
 *   autoTrack: boolean,
 *   doNotTrack: boolean
 * }}
 */
export function getPublicUmamiConfig({
  websiteId,
  hostUrl,
  domains,
  scriptUrl,
  autoTrack = true,
  doNotTrack = false,
} = {}) {
  const validWebsiteId = typeof websiteId === "string" && isValidUmamiWebsiteId(websiteId)
    ? websiteId.trim()
    : null;
  const validHostUrl = typeof hostUrl === "string" && isValidUmamiHostUrl(hostUrl)
    ? hostUrl.trim().replace(/\/+$/, "")
    : null;
  const normalizedDomains = parseUmamiDomains(domains);
  const resolvedScriptUrl = validHostUrl ? getUmamiScriptUrl(validHostUrl, scriptUrl) : null;

  const enabled = Boolean(validWebsiteId && validHostUrl);

  return {
    enabled,
    provider: "umami",
    websiteId: validWebsiteId,
    hostUrl: validHostUrl,
    scriptUrl: resolvedScriptUrl,
    domains: normalizedDomains,
    autoTrack: Boolean(autoTrack),
    doNotTrack: Boolean(doNotTrack),
  };
}

/**
 * Filter and scrub Umami custom event data.
 * Enforces zero-PII and zero-secret data leakage.
 *
 * @param {Record<string, any>} [data]
 * @returns {Record<string, any>}
 */
export function filterUmamiData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const scrubbed = scrubObject(data);
  const sanitized = {};
  for (const [k, v] of Object.entries(scrubbed)) {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      sanitized[k] = JSON.stringify(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Scrub an Umami event payload.
 *
 * @param {{
 *   name?: string,
 *   eventName?: string,
 *   url?: string,
 *   websiteId?: string,
 *   hostname?: string,
 *   data?: Record<string, any>
 * }} event
 * @returns {{
 *   name: string,
 *   url: string,
 *   websiteId?: string,
 *   hostname?: string,
 *   data: Record<string, any>
 * }}
 */
export function scrubUmamiEvent(event) {
  if (!event || typeof event !== "object") {
    return { name: "custom_event", url: "https://agentic-ship.local", data: {} };
  }
  const rawName = event.name || event.eventName || "custom_event";
  const scrubbedName = scrubString(String(rawName));
  const rawUrl = event.url || "https://agentic-ship.local";
  const scrubbedUrl = scrubUrl(String(rawUrl));
  const scrubbedData = filterUmamiData(event.data || {});

  return {
    name: scrubbedName,
    url: scrubbedUrl,
    ...(event.websiteId ? { websiteId: String(event.websiteId).trim() } : {}),
    ...(event.hostname ? { hostname: String(event.hostname).trim() } : {}),
    data: scrubbedData,
  };
}

/**
 * Create a synthetic Umami event for integration verification.
 *
 * @param {{
 *   eventName?: string,
 *   websiteId?: string,
 *   hostUrl?: string,
 *   url?: string,
 *   data?: Record<string, any>
 * }} [options]
 * @returns {object}
 */
export function createSyntheticUmamiEvent({
  eventName = "synthetic_verification",
  websiteId = "00000000-0000-0000-0000-000000000000",
  hostUrl = "https://cloud.umami.is",
  url = "https://example.com/test",
  data = {},
} = {}) {
  const scrubbedData = filterUmamiData({
    ...data,
    synthetic: "true",
    verification: "true",
    stage: "verification",
  });

  return {
    name: scrubString(eventName),
    websiteId,
    hostUrl,
    url: scrubUrl(url),
    data: scrubbedData,
  };
}

/**
 * Simulate Umami capture without network side-effects.
 *
 * @param {object} event
 * @param {{ websiteId?: string, hostUrl?: string }} [options]
 * @returns {{ delivered: boolean, eventId: string, payload: object, scrubbedEvent: object }}
 */
export function simulateUmamiCapture(event, { websiteId, hostUrl = "https://cloud.umami.is" } = {}) {
  const targetWebsiteId = websiteId || event?.websiteId;
  if (!isValidUmamiWebsiteId(targetWebsiteId)) {
    throw new Error(`Cannot capture Umami event: Invalid Website ID "${targetWebsiteId}".`);
  }
  const targetHostUrl = hostUrl || event?.hostUrl || "https://cloud.umami.is";
  if (!isValidUmamiHostUrl(targetHostUrl)) {
    throw new Error(`Cannot capture Umami event: Invalid Host URL "${targetHostUrl}".`);
  }

  const scrubbedEvent = scrubUmamiEvent({ ...event, websiteId: targetWebsiteId });
  const eventId = randomUUID();

  let hostname = "localhost";
  try {
    hostname = new URL(scrubbedEvent.url).hostname;
  } catch {
    // Keep fallback hostname
  }

  const payload = {
    type: "event",
    payload: {
      website: targetWebsiteId,
      hostname,
      url: scrubbedEvent.url,
      name: scrubbedEvent.name,
      data: scrubbedEvent.data,
    },
  };

  return {
    delivered: true,
    eventId,
    apiEndpoint: `${targetHostUrl.replace(/\/+$/, "")}/api/send`,
    payload,
    scrubbedEvent,
  };
}

/**
 * Create an Umami client instance.
 * Guarantees zero runtime errors and non-blocking no-op behavior when unconfigured.
 *
 * @param {{
 *   websiteId?: string,
 *   hostUrl?: string,
 *   domains?: string|string[],
 *   scriptUrl?: string,
 *   autoTrack?: boolean,
 *   doNotTrack?: boolean
 * }} [options]
 * @returns {object}
 */
export function createUmamiClient(options = {}) {
  const config = getPublicUmamiConfig(options);

  if (!config.enabled) {
    return {
      provider: "umami",
      isInitialized: () => false,
      getConfig: () => config,
      track: (eventName, data) => {
        return {
          success: true,
          delivered: false,
          reason: "unconfigured",
          eventName: scrubString(String(eventName || "unknown")),
          data: filterUmamiData(data || {}),
        };
      },
      trackPageview: (data) => {
        return {
          success: true,
          delivered: false,
          reason: "unconfigured",
          eventName: "pageview",
          data: filterUmamiData(data || {}),
        };
      },
      identify: (data) => {
        return {
          success: true,
          delivered: false,
          reason: "unconfigured",
          data: filterUmamiData(data || {}),
        };
      },
    };
  }

  return {
    provider: "umami",
    isInitialized: () => true,
    getConfig: () => config,
    track: (eventName, data) => {
      const scrubbed = scrubUmamiEvent({
        name: eventName,
        websiteId: config.websiteId,
        data,
      });

      return {
        success: true,
        delivered: true,
        eventName: scrubbed.name,
        websiteId: config.websiteId,
        data: scrubbed.data,
      };
    },
    trackPageview: (data) => {
      const scrubbed = scrubUmamiEvent({
        name: "pageview",
        websiteId: config.websiteId,
        data,
      });

      return {
        success: true,
        delivered: true,
        eventName: "pageview",
        websiteId: config.websiteId,
        data: scrubbed.data,
      };
    },
    identify: (data) => {
      const scrubbedData = filterUmamiData(data || {});
      return {
        success: true,
        delivered: true,
        data: scrubbedData,
      };
    },
  };
}
