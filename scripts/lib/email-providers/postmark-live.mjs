const API_ORIGIN = "https://api.postmarkapp.com";
const SAFE_RECIPIENT = "test@blackhole.postmarkapp.com";

function headers(serverToken, json = false) {
  return {
    Accept: "application/json",
    "X-Postmark-Server-Token": serverToken,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
}

function hasWebhookAuth(webhook, secret) {
  const basic = webhook.HttpAuth;
  if (basic?.Username === "postmark" && basic.Password === secret) return true;
  return (webhook.HttpHeaders ?? []).some(
    (header) => header?.Name?.toLowerCase() === "x-postmark-secret" && header.Value === secret,
  );
}

function senderAddress(from) {
  const value = from.match(/<([^>]+)>/)?.[1] ?? from;
  const match = value.trim().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return null;
  const domain = match[2].toLowerCase();
  if (domain === "localhost" || /(?:^|\.)(?:example\.(?:com|net|org)|test|invalid)$/.test(domain)) return null;
  return value.trim();
}

/**
 * Verify the selected production Postmark server without exposing credentials.
 * The final request sends only to Postmark's documented black-hole recipient.
 */
export async function verifyPostmarkLive({
  serverToken,
  webhookSecret,
  from,
  messageStream = "outbound",
  fetchImpl = fetch,
} = {}) {
  if (!serverToken || serverToken === "POSTMARK_API_TEST") {
    throw new Error("POSTMARK_SERVER_TOKEN must be a live server token");
  }
  if (!webhookSecret) throw new Error("POSTMARK_WEBHOOK_SECRET is required");
  if (!from || /resend\.dev/i.test(from) || !senderAddress(from)) {
    throw new Error("EMAIL_FROM must use the verified production sender identity");
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(messageStream)) {
    throw new Error("POSTMARK_MESSAGE_STREAM is invalid");
  }

  const streamResponse = await fetchImpl(`${API_ORIGIN}/message-streams/${encodeURIComponent(messageStream)}`, {
    headers: headers(serverToken),
  });
  const stream = await readJson(streamResponse, "Postmark message stream check");
  if (stream.ID !== messageStream || stream.MessageStreamType !== "Transactional" || stream.ArchivedAt) {
    throw new Error("Postmark message stream must exist, be transactional, and remain active");
  }

  const webhookResponse = await fetchImpl(
    `${API_ORIGIN}/webhooks?MessageStream=${encodeURIComponent(messageStream)}`,
    { headers: headers(serverToken) },
  );
  const webhookPayload = await readJson(webhookResponse, "Postmark webhook check");
  const webhook = (webhookPayload.Webhooks ?? []).find((candidate) => {
    try {
      const url = new URL(candidate.Url);
      return url.protocol === "https:" && url.hostname.endsWith(".convex.site") && url.pathname === "/postmark/webhook";
    } catch {
      return false;
    }
  });
  const requiredTriggers = ["Delivery", "Bounce", "SpamComplaint"];
  if (
    !webhook ||
    webhook.Status !== "verified" ||
    !requiredTriggers.every((trigger) => webhook.Triggers?.[trigger]?.Enabled === true) ||
    !hasWebhookAuth(webhook, webhookSecret)
  ) {
    throw new Error("Postmark needs one verified HTTPS webhook with authentication and delivery, bounce, and complaint triggers");
  }

  const sendResponse = await fetchImpl(`${API_ORIGIN}/email`, {
    method: "POST",
    headers: headers(serverToken, true),
    body: JSON.stringify({
      From: from,
      To: SAFE_RECIPIENT,
      Subject: "Agentic Ship production preflight",
      TextBody: "Postmark live sending verification. This message is discarded by Postmark.",
      MessageStream: messageStream,
      TrackOpens: false,
      TrackLinks: "None",
      Tag: "agentic-ship-preflight",
    }),
  });
  const send = await readJson(sendResponse, "Postmark live send check");
  if (send.ErrorCode !== 0 || typeof send.MessageID !== "string" || !send.MessageID) {
    throw new Error("Postmark did not accept the live black-hole verification message");
  }

  return {
    status: "PASS",
    detail: "live token, transactional stream, verified webhook, sender identity, and black-hole send passed",
  };
}
