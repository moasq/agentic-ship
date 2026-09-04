import { timingSafeEqual } from "node:crypto";

/**
 * Verify inbound Postmark webhook authentication using constant-time comparison.
 * Supports X-Postmark-Secret, X-Webhook-Secret, Bearer authorization, and Basic auth.
 *
 * @param {{ headers?: Record<string, string>, rawBody?: string, secret?: string }} options
 * @returns {boolean}
 */
export function verifyPostmarkWebhook({ headers = {}, secret = "" } = {}) {
  if (!secret || typeof secret !== "string" || secret.trim().length === 0) return false;

  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalizedHeaders[key.toLowerCase()] = value;
    }
  }

  let candidate = null;

  if (normalizedHeaders["x-postmark-secret"]) {
    candidate = normalizedHeaders["x-postmark-secret"];
  } else if (normalizedHeaders["x-webhook-secret"]) {
    candidate = normalizedHeaders["x-webhook-secret"];
  } else if (normalizedHeaders["authorization"]) {
    const auth = normalizedHeaders["authorization"].trim();
    if (auth.startsWith("Bearer ")) {
      candidate = auth.slice(7).trim();
    } else if (auth.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
        const parts = decoded.split(":");
        if (parts.length === 2) {
          candidate = parts[1] || parts[0];
        } else {
          candidate = decoded;
        }
      } catch {
        return false;
      }
    }
  }

  if (!candidate || typeof candidate !== "string") return false;

  const candidateBuf = Buffer.from(candidate, "utf8");
  const secretBuf = Buffer.from(secret, "utf8");

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
    processedDeliveryIds: [],
  };
}

/**
 * Apply a verified Postmark webhook event to recipient and delivery state.
 *
 * @param {object} current current state
 * @param {object} event webhook event payload
 * @returns {{ outcome: "applied"|"ignored_duplicate"|"rejected_unverified", state: object }}
 */
export function applyPostmarkEvent(current, event) {
  const state = current ?? createPostmarkDeliveryState();
  if (event?.verified !== true) {
    return { outcome: "rejected_unverified", state };
  }

  const deliveryId = String(event.MessageID || event.ID || event.deliveryId || "");
  const eventType = event.RecordType || event.type || "";
  const occurredAt = event.DeliveredAt || event.BouncedAt || event.occurredAt || event.ReceivedAt || "";

  if (!deliveryId || !eventType || !occurredAt) {
    throw new Error("verified Postmark events need MessageID/ID, RecordType/type, and DeliveredAt/BouncedAt/occurredAt");
  }

  if (state.processedDeliveryIds.includes(deliveryId)) {
    return { outcome: "ignored_duplicate", state };
  }

  const updatedDeliveryIds = [...state.processedDeliveryIds, deliveryId];

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
          processedDeliveryIds: updatedDeliveryIds,
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
          processedDeliveryIds: updatedDeliveryIds,
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
          processedDeliveryIds: updatedDeliveryIds,
        },
      };
    }

    case "Open":
    case "Click":
    default:
      return {
        outcome: "applied",
        state: {
          ...state,
          processedDeliveryIds: updatedDeliveryIds,
        },
      };
  }
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
    verified: true,
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
    verified: true,
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
    verified: true,
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
}) {
  if (!to || typeof to !== "string") throw new Error("Postmark send requires a recipient (to)");
  if (!from || typeof from !== "string") throw new Error("Postmark send requires a sender (from)");
  if (!subject || typeof subject !== "string") throw new Error("Postmark send requires a subject");

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
