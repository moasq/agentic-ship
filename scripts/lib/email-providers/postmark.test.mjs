// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  applyPostmarkEvent,
  createPostmarkDeliveryState,
  createPostmarkSendInput,
  resolvePostmarkServerToken,
  simulatePostmarkBounce,
  simulatePostmarkDelivery,
  simulatePostmarkSpamComplaint,
  verifyPostmarkWebhook,
} from "./postmark.mjs";

const apply = (state, event, options = {}) => applyPostmarkEvent(state, event, { authenticated: true, ...options });

describe("Postmark webhook authentication", () => {
  const SECRET = ["fixture", "webhook", "secret", "value"].join("-");

  test("verifies valid X-Postmark-Secret header", () => {
    const verified = verifyPostmarkWebhook({
      headers: { "X-Postmark-Secret": SECRET },
      secret: SECRET,
    });
    expect(verified).toBe(true);
  });

  test("verifies valid lowercase x-postmark-secret header", () => {
    const verified = verifyPostmarkWebhook({
      headers: { "x-postmark-secret": SECRET },
      secret: SECRET,
    });
    expect(verified).toBe(true);
  });

  test("verifies Basic auth header", () => {
    const encoded = Buffer.from(`postmark:${SECRET}`).toString("base64");
    const verified = verifyPostmarkWebhook({
      headers: { authorization: `Basic ${encoded}` },
      secret: SECRET,
    });
    expect(verified).toBe(true);
  });

  test("rejects Basic auth with the wrong username", () => {
    const encoded = Buffer.from(`attacker:${SECRET}`).toString("base64");
    expect(verifyPostmarkWebhook({
      headers: { authorization: `Basic ${encoded}` },
      secret: SECRET,
    })).toBe(false);
  });

  test("rejects unconfigured authentication schemes", () => {
    expect(verifyPostmarkWebhook({
      headers: { authorization: `Bearer ${SECRET}` },
      secret: SECRET,
    })).toBe(false);
    expect(verifyPostmarkWebhook({
      headers: { "x-webhook-secret": SECRET },
      secret: SECRET,
    })).toBe(false);
  });

  test("rejects mismatched secret", () => {
    const verified = verifyPostmarkWebhook({
      headers: { "x-postmark-secret": ["wrong", "fixture", "value"].join("-") },
      secret: SECRET,
    });
    expect(verified).toBe(false);
  });

  test("rejects missing headers or secret", () => {
    expect(verifyPostmarkWebhook({ headers: {}, secret: SECRET })).toBe(false);
    expect(verifyPostmarkWebhook({ headers: { "x-postmark-secret": SECRET }, secret: "" })).toBe(false);
  });
});

describe("Postmark event state transitions & simulation", () => {
  test("delivery event records delivery and increments count", () => {
    const initial = createPostmarkDeliveryState();
    const event = simulatePostmarkDelivery({
      messageId: "msg-001",
      recipient: "user@example.com",
    });

    const result = apply(initial, event);
    expect(result.outcome).toBe("applied");
    expect(result.state.deliveredCount).toBe(1);
    expect(result.state.recipients["user@example.com"]).toEqual({
      status: "delivered",
      lastEventAt: event.DeliveredAt,
      inactive: false,
    });
    expect(result.state.processedEventIds).toHaveLength(1);
  });

  test("hard bounce marks recipient inactive and increments bounced count", () => {
    const initial = createPostmarkDeliveryState();
    const event = simulatePostmarkBounce({
      id: 101,
      messageId: "msg-002",
      email: "bad-address@example.com",
      type: "HardBounce",
      typeCode: 1,
      inactive: true,
    });

    const result = apply(initial, event);
    expect(result.outcome).toBe("applied");
    expect(result.state.bouncedCount).toBe(1);
    expect(result.state.recipients["bad-address@example.com"].status).toBe("bounced");
    expect(result.state.recipients["bad-address@example.com"].inactive).toBe(true);
  });

  test("soft bounce does not permanently mark recipient inactive", () => {
    const initial = createPostmarkDeliveryState();
    const event = simulatePostmarkBounce({
      id: 102,
      messageId: "msg-003",
      email: "mailbox-full@example.com",
      type: "SoftBounce",
      typeCode: 4096,
      name: "Soft bounce",
      inactive: false,
    });

    const result = apply(initial, event);
    expect(result.outcome).toBe("applied");
    expect(result.state.bouncedCount).toBe(1);
    expect(result.state.recipients["mailbox-full@example.com"].status).toBe("bounced");
    expect(result.state.recipients["mailbox-full@example.com"].inactive).toBe(false);
  });

  test("spam complaint marks recipient inactive and increments complaint count", () => {
    const initial = createPostmarkDeliveryState();
    const event = simulatePostmarkSpamComplaint({
      id: 201,
      messageId: "msg-004",
      email: "complainer@example.com",
    });

    const result = apply(initial, event);
    expect(result.outcome).toBe("applied");
    expect(result.state.complaintCount).toBe(1);
    expect(result.state.recipients["complainer@example.com"].status).toBe("complaint");
    expect(result.state.recipients["complainer@example.com"].inactive).toBe(true);
  });

  test("unverified events are rejected without modifying state", () => {
    const initial = createPostmarkDeliveryState();
    const unverifiedEvent = {
      RecordType: "Delivery",
      MessageID: "msg-unverified",
      Recipient: "user@example.com",
      DeliveredAt: new Date().toISOString(),
      verified: true,
    };

    const result = applyPostmarkEvent(initial, unverifiedEvent);
    expect(result.outcome).toBe("rejected_unverified");
    expect(result.state.deliveredCount).toBe(0);
    expect(result.state.processedEventIds).toHaveLength(0);
  });

  test("duplicate delivery IDs are safely ignored", () => {
    const initial = createPostmarkDeliveryState();
    const event = simulatePostmarkDelivery({
      messageId: "msg-dup-001",
      recipient: "user@example.com",
    });

    const first = apply(initial, event);
    expect(first.outcome).toBe("applied");
    expect(first.state.deliveredCount).toBe(1);

    const duplicate = apply(first.state, event);
    expect(duplicate.outcome).toBe("ignored_duplicate");
    expect(duplicate.state.deliveredCount).toBe(1);
  });

  test("the same message can deliver to multiple recipients", () => {
    const deliveredAt = new Date().toISOString();
    const first = apply(createPostmarkDeliveryState(), simulatePostmarkDelivery({
      messageId: "msg-multi-001",
      recipient: "first@example.com",
      deliveredAt,
    }));
    const second = apply(first.state, simulatePostmarkDelivery({
      messageId: "msg-multi-001",
      recipient: "second@example.com",
      deliveredAt,
    }));

    expect(second.outcome).toBe("applied");
    expect(second.state.deliveredCount).toBe(2);
  });

  test("uses the webhook trace ID as the preferred retry key", () => {
    const event = simulatePostmarkDelivery({ messageId: "msg-trace-001" });
    const first = apply(createPostmarkDeliveryState(), event, { traceId: "trace-001" });
    const duplicate = apply(first.state, { ...event, Recipient: "changed@example.com" }, { traceId: "trace-001" });
    expect(duplicate.outcome).toBe("ignored_duplicate");
  });
});

describe("Postmark test-mode token selection", () => {
  const configuredToken = ["fixture", "configured", "value"].join("-");

  test("uses Postmark's non-delivery test token in test mode", () => {
    expect(resolvePostmarkServerToken({ configuredToken, testMode: true })).toBe("POSTMARK_API_TEST");
  });

  test("requires a configured server token for live delivery", () => {
    expect(resolvePostmarkServerToken({ configuredToken, testMode: false })).toBe(configuredToken);
    expect(() => resolvePostmarkServerToken({ testMode: false })).toThrow(/POSTMARK_SERVER_TOKEN/);
  });
});

describe("Postmark send input creation", () => {
  test("creates valid transactional send payload", () => {
    const payload = createPostmarkSendInput({
      to: "recipient@example.com",
      from: "sender@example.com",
      subject: "Welcome to our app",
      htmlBody: "<p>Hello</p>",
      textBody: "Hello",
      tag: "welcome",
      testMode: false,
    });

    expect(payload).toEqual({
      To: "recipient@example.com",
      From: "sender@example.com",
      Subject: "Welcome to our app",
      HtmlBody: "<p>Hello</p>",
      TextBody: "Hello",
      Tag: "welcome",
      MessageStream: "outbound",
    });
  });

  test("testMode disables open/link tracking", () => {
    const payload = createPostmarkSendInput({
      to: "recipient@example.com",
      from: "sender@example.com",
      subject: "Test email",
      htmlBody: "<p>Test</p>",
      testMode: true,
    });

    expect(payload.TrackOpens).toBe(false);
    expect(payload.TrackLinks).toBe("None");
  });

  test("validates required parameters", () => {
    expect(() => createPostmarkSendInput({ from: "a@b.com", subject: "test" })).toThrow(/recipient/);
    expect(() => createPostmarkSendInput({ to: "a@b.com", subject: "test" })).toThrow(/sender/);
    expect(() => createPostmarkSendInput({ to: "a@b.com", from: "b@c.com" })).toThrow(/subject/);
  });

  test("refuses a recipient suppressed by a hard bounce or complaint", () => {
    const deliveryState = createPostmarkDeliveryState();
    deliveryState.recipients["blocked@example.com"] = { inactive: true, status: "bounced" };
    expect(() => createPostmarkSendInput({
      to: "Blocked <blocked@example.com>",
      from: "sender@example.com",
      subject: "Do not send",
      deliveryState,
    })).toThrow(/recipient is suppressed/);
  });
});
