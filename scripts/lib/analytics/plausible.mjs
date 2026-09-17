import { keepAllowedProperties, scrubObject, scrubString, scrubUrl } from "./privacy.mjs";

export const PLAUSIBLE_DOMAIN_ENV = "NEXT_PUBLIC_PLAUSIBLE_DOMAIN";
export const PLAUSIBLE_SCRIPT_URL_ENV = "NEXT_PUBLIC_PLAUSIBLE_SCRIPT_URL";
export const PLAUSIBLE_EVENT_ENDPOINT_ENV = "NEXT_PUBLIC_PLAUSIBLE_EVENT_ENDPOINT";
export const PLAUSIBLE_ALLOWED_ORIGINS_ENV = "NEXT_PUBLIC_PLAUSIBLE_ALLOWED_ORIGINS";

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Validate whether a string is a valid domain for Plausible.
 * Plausible expects bare domain / hostname (e.g. "example.com", "app.example.com").
 *
 * @param {string} domain
 * @returns {boolean}
 */
export function isValidPlausibleDomain(domain) {
  if (typeof domain !== "string" || !domain.trim()) return false;
  const trimmed = domain.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("/") || trimmed.includes(":")) {
    return false;
  }
  if (trimmed === "localhost" || trimmed.endsWith(".local") || trimmed.endsWith(".internal")) {
    return true;
  }
  return DOMAIN_REGEX.test(trimmed);
}

/**
 * Validate custom Plausible script URL (must be HTTPS URL).
 *
 * @param {string} scriptUrl
 * @returns {boolean}
 */
export function isValidPlausibleScriptUrl(scriptUrl) {
  if (typeof scriptUrl !== "string" || !scriptUrl.trim()) return false;
  const trimmed = scriptUrl.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname.length > 1 && !(url.origin === "https://plausible.io" && url.pathname === "/js/script.js");
  } catch {
    return false;
  }
}

export function parsePlausibleAllowedOrigins(origins) {
  const candidates = Array.isArray(origins) ? origins : typeof origins === "string" ? origins.split(",") : [];
  return candidates.map((value) => String(value).trim()).filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && url.origin === value.replace(/\/$/, "");
    } catch {
      return false;
    }
  }).map((value) => value.replace(/\/$/, ""));
}

export function isSafePlausibleUrl(value, allowedOrigins = ["https://plausible.io"]) {
  if (typeof value !== "string" || !value.trim()) return false;
  const candidate = value.trim();
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return true;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

/**
 * Validate Plausible API host URL (must be HTTPS URL).
 *
 * @param {string} eventEndpoint
 * @returns {boolean}
 */
export function isValidPlausibleEventEndpoint(eventEndpoint) {
  if (typeof eventEndpoint !== "string" || !eventEndpoint.trim()) return false;
  const trimmed = eventEndpoint.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Build a safe public configuration for Plausible client bundle.
 *
 * @param {{
 *   domain?: string,
 *   scriptUrl?: string,
 *   eventEndpoint?: string,
 *   outboundLinks?: boolean,
 *   taggedEvents?: boolean,
 *   hashMode?: boolean
 * }} [options]
 * @returns {{
 *   enabled: boolean,
 *   provider: "plausible",
 *   domain: string|null,
 *   scriptUrl: string,
 *   eventEndpoint: string|null,
 *   outboundLinks: boolean,
 *   taggedEvents: boolean,
 *   hashMode: boolean
 * }}
 */
export function getPublicPlausibleConfig({
  domain,
  scriptUrl,
  eventEndpoint = "https://plausible.io/api/event",
  allowedOrigins = ["https://plausible.io"],
  outboundLinks = false,
  taggedEvents = false,
  hashMode = false,
} = {}) {
  const validDomain = typeof domain === "string" && isValidPlausibleDomain(domain) ? domain.trim() : null;
  const normalizedOrigins = parsePlausibleAllowedOrigins(allowedOrigins);
  const validScriptUrl = typeof scriptUrl === "string" && isSafePlausibleUrl(scriptUrl, normalizedOrigins)
    ? scriptUrl.trim()
    : null;
  const validEventEndpoint = typeof eventEndpoint === "string" && isSafePlausibleUrl(eventEndpoint, normalizedOrigins)
    ? eventEndpoint.trim()
    : null;

  return {
    enabled: Boolean(validDomain && validScriptUrl && validEventEndpoint),
    provider: "plausible",
    domain: validDomain,
    scriptUrl: validScriptUrl,
    eventEndpoint: validEventEndpoint,
    allowedOrigins: normalizedOrigins,
    outboundLinks: Boolean(outboundLinks),
    taggedEvents: Boolean(taggedEvents),
    hashMode: Boolean(hashMode),
  };
}

/**
 * Filter and scrub Plausible custom event properties.
 * Enforces zero-PII and zero-secret data leakage.
 *
 * @param {Record<string, any>} [props]
 * @returns {Record<string, any>}
 */
export function filterPlausibleProps(props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  const scrubbed = scrubObject(props);
  // Ensure flat or sanitized properties only
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
 * Scrub a Plausible event payload.
 *
 * @param {{
 *   name?: string,
 *   eventName?: string,
 *   url?: string,
 *   domain?: string,
 *   props?: Record<string, any>
 * }} event
 * @returns {{
 *   name: string,
 *   url: string,
 *   domain?: string,
 *   props: Record<string, any>
 * }}
 */
export function scrubPlausibleEvent(event) {
  if (!event || typeof event !== "object") {
    return { name: "custom_event", url: "https://agentic-ship.local", props: {} };
  }
  const rawName = event.name || event.eventName || "custom_event";
  const scrubbedName = scrubString(String(rawName));
  const rawUrl = event.url || "https://agentic-ship.local";
  const scrubbedUrl = scrubUrl(String(rawUrl));
  const scrubbedProps = filterPlausibleProps(event.props || {});

  return {
    name: scrubbedName,
    url: scrubbedUrl,
    ...(event.domain ? { domain: String(event.domain).trim() } : {}),
    props: scrubbedProps,
  };
}

/**
 * Create a synthetic Plausible event for integration verification.
 *
 * @param {{
 *   eventName?: string,
 *   domain?: string,
 *   url?: string,
 *   props?: Record<string, any>
 * }} [options]
 * @returns {object}
 */
export function createSyntheticPlausibleEvent({
  eventName = "synthetic_verification",
  domain = "example.com",
  url = "https://example.com/test",
  props = {},
} = {}) {
  const scrubbedProps = filterPlausibleProps({
    ...props,
    synthetic: "true",
    verification: "true",
    stage: "verification",
  });

  return {
    name: scrubString(eventName),
    domain,
    url: scrubUrl(url),
    props: scrubbedProps,
  };
}

/**
 * Simulate Plausible capture without network side-effects.
 *
 * @param {object} event
 * @param {{ domain?: string, eventEndpoint?: string }} [options]
 * @returns {{ delivered: false, acceptedByAdapter: true, payload: object, scrubbedEvent: object }}
 */
export function simulatePlausibleCapture(event, { domain, eventEndpoint = "https://plausible.io/api/event" } = {}) {
  const targetDomain = domain || event?.domain || "example.com";
  if (!isValidPlausibleDomain(targetDomain)) {
    throw new Error(`Cannot capture Plausible event: Invalid domain "${targetDomain}".`);
  }

  const scrubbedEvent = scrubPlausibleEvent({ ...event, domain: targetDomain });
  const payload = {
    name: scrubbedEvent.name,
    url: scrubbedEvent.url,
    domain: targetDomain,
    props: scrubbedEvent.props,
  };

  return {
    delivered: false,
    acceptedByAdapter: true,
    reason: "dry_run",
    apiEndpoint: eventEndpoint,
    payload,
    scrubbedEvent,
  };
}

/**
 * Create a Plausible client instance.
 * Guarantees zero runtime errors and non-blocking no-op behavior when unconfigured.
 *
 * @param {{
 *   domain?: string,
 *   scriptUrl?: string,
 *   eventEndpoint?: string,
 *   outboundLinks?: boolean,
 *   taggedEvents?: boolean,
 *   hashMode?: boolean
 * }} [options]
 * @returns {object}
 */
export function createPlausibleClient(options = {}) {
  const config = getPublicPlausibleConfig(options);
  const tracker = options.tracker ?? globalThis.plausible;
  const allowedEvents = new Set(options.allowedEvents ?? []);
  const allowedProperties = options.allowedProperties ?? [];

  if (!config.enabled) {
    return {
      provider: "plausible",
      isInitialized: () => false,
      getConfig: () => config,
      trackEvent: (eventName, { props } = {}) => {
        return {
          success: true,
          delivered: false,
          reason: "unconfigured",
          eventName: scrubString(String(eventName || "unknown")),
          props: filterPlausibleProps(keepAllowedProperties(props, allowedProperties)),
        };
      },
      trackPageview: ({ url, props } = {}) => {
        return {
          success: true,
          delivered: false,
          reason: "unconfigured",
          eventName: "pageview",
          url: scrubUrl(url || ""),
          props: filterPlausibleProps(keepAllowedProperties(props, allowedProperties)),
        };
      },
    };
  }

  return {
    provider: "plausible",
    isInitialized: () => typeof tracker === "function",
    getConfig: () => config,
    trackEvent: (eventName, { props, url } = {}) => {
      if (!allowedEvents.has(eventName)) {
        return { success: true, dispatched: false, delivered: false, reason: "event_not_allowed" };
      }
      const scrubbed = scrubPlausibleEvent({
        name: eventName,
        url: url || `https://${config.domain}/`,
        domain: config.domain,
        props: keepAllowedProperties(props, allowedProperties),
      });

      if (typeof tracker !== "function") {
        return { success: true, dispatched: false, delivered: false, reason: "tracker_unavailable", eventName: scrubbed.name, props: scrubbed.props };
      }
      try {
        tracker(scrubbed.name, { props: scrubbed.props, url: scrubbed.url });
      } catch {
        return { success: true, dispatched: false, delivered: false, reason: "tracker_error", eventName: scrubbed.name, props: scrubbed.props };
      }
      return {
        success: true,
        dispatched: true,
        delivered: false,
        eventName: scrubbed.name,
        domain: config.domain,
        url: scrubbed.url,
        props: scrubbed.props,
      };
    },
    trackPageview: ({ url, props } = {}) => {
      const targetUrl = url || `https://${config.domain}/`;
      const scrubbed = scrubPlausibleEvent({
        name: "pageview",
        url: targetUrl,
        domain: config.domain,
        props: keepAllowedProperties(props, allowedProperties),
      });

      if (typeof tracker !== "function") {
        return { success: true, dispatched: false, delivered: false, reason: "tracker_unavailable", eventName: "pageview", url: scrubbed.url, props: scrubbed.props };
      }
      try {
        tracker("pageview", { props: scrubbed.props, url: scrubbed.url });
      } catch {
        return { success: true, dispatched: false, delivered: false, reason: "tracker_error", eventName: "pageview", url: scrubbed.url, props: scrubbed.props };
      }
      return {
        success: true,
        dispatched: true,
        delivered: false,
        eventName: "pageview",
        domain: config.domain,
        url: scrubbed.url,
        props: scrubbed.props,
      };
    },
  };
}
