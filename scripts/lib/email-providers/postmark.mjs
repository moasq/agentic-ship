import { timingSafeEqual } from "node:crypto";

export function inspectPostmarkBlueprint({ emailSource = "", httpSource = "" } = {}) {
  const missing = [];
  const emailRules = [
    ["Postmark provider seam", /postmark/i],
    ["server token", /POSTMARK_SERVER_TOKEN/],
    ["non-delivery test token", /POSTMARK_API_TEST/],
    ["shipped test mode", /\btestMode\s*:\s*true\b/],
    ["suppressed-recipient guard", /inactive|suppress/i],
  ];
  const webhookRules = [
    ["webhook route", /["']\/postmark\/webhook["']/],
    ["webhook secret", /POSTMARK_WEBHOOK_SECRET/],
    ["webhook authentication", /verifyPostmarkWebhook|timingSafeEqual/],
    ["idempotency key", /X-PM-Webhook-Trace-Id|x-pm-webhook-trace-id|processedEventIds/],
  ];
  for (const [label, pattern] of emailRules) if (!pattern.test(emailSource)) missing.push(label);
  for (const [label, pattern] of webhookRules) if (!pattern.test(httpSource)) missing.push(label);
  return missing.length === 0
    ? { status: "PASS", detail: "Postmark email and webhook blueprint is complete" }
    : { status: "FAIL", detail: `Postmark blueprint is incomplete: ${missing.join(", ")}` };
}

/**
 * Verify inbound Postmark webhook authentication using constant-time comparison.
 * Postmark does not sign webhooks. Downstream projects configure either the
 * X-Postmark-Secret custom header or HTTP Basic Auth with the fixed username.
 *
 * @param {{ headers?: Record<string, string>, secret?: string, username?: string }} options
 * @returns {boolean}
 */
export function verifyPostmarkWebhook({ headers = {}, secret = "", username = "postmark" } = {}) {
  if (!secret || typeof secret !== "string" || secret.trim().length === 0) return false;

  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalizedHeaders[key.toLowerCase()] = value;
    }
  }

  let candidate = normalizedHeaders["x-postmark-secret"] ?? null;
  let expected = secret;

  if (!candidate && normalizedHeaders["authorization"]) {
    const auth = normalizedHeaders["authorization"].trim();
    if (auth.startsWith("Basic ")) {
      try {
        candidate = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
        expected = `${username}:${secret}`;
      } catch {
        return false;
      }
    }
  }

  if (!candidate || typeof candidate !== "string") return false;

  const candidateBuf = Buffer.from(candidate, "utf8");
  const secretBuf = Buffer.from(expected, "utf8");

  if (candidateBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(candidateBuf, secretBuf);
}

/**
 * Initial delivery and recipient tracking state for Postmark.
 */
export function createPostmarkDeliveryState() {
  return {
    deliveredCount: 0,
    bouncedCount: 0,
    complaintCount: 0,
    recipients: {},
    processedEventIds: [],
  };
}

function eventId(event, traceId) {
  if (traceId) return `trace:${traceId}`;
  const type = event.RecordType || event.type || "";
  if (type === "Delivery") {
    return [type, event.MessageID, event.Recipient || event.email, event.DeliveredAt || event.occurredAt].join(":");
  }
  return [
    type,
    event.ID || event.MessageID || event.deliveryId,
    event.Email || event.Recipient || event.email,
    event.BouncedAt || event.occurredAt || event.ReceivedAt,
  ].join(":");
}

/**
 * Apply a verified Postmark webhook event to recipient and delivery state.
 *
 * @param {object} current current state
 * @param {object} event webhook event payload
 * @param {{ authenticated?: boolean, traceId?: string }} [options] authentication result and X-PM-Webhook-Trace-Id
 * @returns {{ outcome: "applied"|"ignored_duplicate"|"ignored_unsupported"|"rejected_unverified", state: object }}
 */
export function applyPostmarkEvent(current, event, { authenticated = false, traceId = "" } = {}) {
  const state = current ?? createPostmarkDeliveryState();
  if (!authenticated) {
    return { outcome: "rejected_unverified", state };
  }

  const eventType = event.RecordType || event.type || "";
  const occurredAt = event.DeliveredAt || event.BouncedAt || event.occurredAt || event.ReceivedAt || "";

  if (!(event.MessageID || event.ID || event.deliveryId) || !eventType || !occurredAt) {
    throw new Error("verified Postmark events need MessageID/ID, RecordType/type, and DeliveredAt/BouncedAt/occurredAt");
  }

  if (!["Delivery", "Bounce", "SpamComplaint"].includes(eventType)) {
    return { outcome: "ignored_unsupported", state };
  }

  const processedEventIds = state.processedEventIds ?? [];
  const id = eventId(event, traceId);
  if (processedEventIds.includes(id)) {
    return { outcome: "ignored_duplicate", state };
  }

  const updatedEventIds = [...processedEventIds, id];

  switch (eventType) {
    case "Delivery": {
      const recipient = (event.Recipient || event.email || "").toLowerCase();
      const recipients = { ...state.recipients };
      if (recipient) {
        recipients[recipient] = {
          status: "delivered",
          lastEventAt: occurredAt,
          inactive: false,
        };
      }
      return {
        outcome: "applied",
        state: {
          ...state,
          deliveredCount: state.deliveredCount + 1,
          recipients,
          processedEventIds: updatedEventIds,
        },
      };
    }

    case "Bounce": {
      const recipient = (event.Email || event.Recipient || event.email || "").toLowerCase();
      const isHard = event.Type === "HardBounce" || event.TypeCode === 1 || event.Inactive === true;
      const recipients = { ...state.recipients };
      if (recipient) {
        recipients[recipient] = {
          status: "bounced",
          lastEventAt: occurredAt,
          inactive: isHard,
          bounceType: event.Type || event.Name || "Bounce",
        };
      }
      return {
        outcome: "applied",
        state: {
          ...state,
          bouncedCount: state.bouncedCount + 1,
          recipients,
          processedEventIds: updatedEventIds,
        },
      };
    }

    case "SpamComplaint": {
      const recipient = (event.Email || event.Recipient || event.email || "").toLowerCase();
      const recipients = { ...state.recipients };
      if (recipient) {
        recipients[recipient] = {
          status: "complaint",
          lastEventAt: occurredAt,
          inactive: true,
          details: event.Details || "",
        };
      }
      return {
        outcome: "applied",
        state: {
          ...state,
          complaintCount: state.complaintCount + 1,
          recipients,
          processedEventIds: updatedEventIds,
        },
      };
    }

    default:
      return { outcome: "ignored_unsupported", state };
  }
}

/**
 * Select the server token without letting test mode deliver real mail.
 */
export function resolvePostmarkServerToken({ configuredToken = "", testMode = true } = {}) {
  if (testMode) return "POSTMARK_API_TEST";
  if (!configuredToken.trim()) throw new Error("Live Postmark delivery requires POSTMARK_SERVER_TOKEN");
  return configuredToken.trim();
}

/**
 * Simulate a Postmark delivery webhook payload.
 */
export function simulatePostmarkDelivery({
  messageId = "pm_msg_test_deliv_001",
  recipient = "test@example.com",
  deliveredAt = new Date().toISOString(),
  tag = "auth-verification",
  metadata = {},
} = {}) {
  return {
    RecordType: "Delivery",
    ServerID: 12345,
    MessageID: messageId,
    Recipient: recipient,
    Tag: tag,
    DeliveredAt: deliveredAt,
    Details: "smtp;250 2.0.0 OK",
    Metadata: metadata,
  };
}

/**
 * Simulate a Postmark bounce webhook payload.
 */
export function simulatePostmarkBounce({
  id = 1001,
  messageId = "pm_msg_test_bounce_001",
  email = "bounced@example.com",
  type = "HardBounce",
  typeCode = 1,
  name = "Hard bounce",
  bouncedAt = new Date().toISOString(),
  details = "smtp;550 5.1.1 User unknown",
  inactive = true,
} = {}) {
  return {
    RecordType: "Bounce",
    ID: id,
    Type: type,
    TypeCode: typeCode,
    Name: name,
    Tag: "auth-verification",
    MessageID: messageId,
    ServerID: 12345,
    Description: "The recipient mailbox was not found",
    Details: details,
    Email: email,
    From: "notifications@example.com",
    BouncedAt: bouncedAt,
    DumpAvailable: false,
    Inactive: inactive,
    CanActivate: !inactive,
    Subject: "Verify your email",
  };
}

/**
 * Simulate a Postmark spam complaint webhook payload.
 */
export function simulatePostmarkSpamComplaint({
  id = 2001,
  messageId = "pm_msg_test_spam_001",
  email = "complaint@example.com",
  bouncedAt = new Date().toISOString(),
  details = "Spam complaint notification received",
} = {}) {
  return {
    RecordType: "SpamComplaint",
    ID: id,
    Type: "SpamComplaint",
    TypeCode: 512,
    Name: "Spam complaint",
    Tag: "auth-verification",
    MessageID: messageId,
    ServerID: 12345,
    Email: email,
    From: "notifications@example.com",
    BouncedAt: bouncedAt,
    Details: details,
    Inactive: true,
    CanActivate: false,
    Subject: "Verify your email",
  };
}

/**
 * Create normalized send input for Postmark transactional API.
 */
export function createPostmarkSendInput({
  to,
  from,
  subject,
  htmlBody,
  textBody,
  tag = "transactional",
  messageStream = "outbound",
  testMode = false,
  deliveryState,
}) {
  if (!to || typeof to !== "string") throw new Error("Postmark send requires a recipient (to)");
  if (!from || typeof from !== "string") throw new Error("Postmark send requires a sender (from)");
  if (!subject || typeof subject !== "string") throw new Error("Postmark send requires a subject");

  const recipients = to.split(",").map((value) => {
    const trimmed = value.trim();
    return (trimmed.match(/<([^>]+)>$/)?.[1] ?? trimmed).toLowerCase();
  });
  const suppressed = recipients.find((recipient) => deliveryState?.recipients?.[recipient]?.inactive === true);
  if (suppressed) throw new Error(`Postmark recipient is suppressed: ${suppressed}`);

  return {
    From: from,
    To: to,
    Subject: subject,
    HtmlBody: htmlBody,
    TextBody: textBody,
    Tag: tag,
    MessageStream: messageStream,
    ...(testMode ? { TrackOpens: false, TrackLinks: "None" } : {}),
  };
}
