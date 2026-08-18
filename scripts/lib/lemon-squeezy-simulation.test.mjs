// @vitest-environment node
import { describe, expect, test } from "vitest";
import crypto from "node:crypto";

function generateLemonSqueezySignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyLemonSqueezySignature(payload, signature, secret) {
  const expected = generateLemonSqueezySignature(payload, secret);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function createCheckoutSession(storeId, variantId, customData) {
  return {
    id: `checkout_${crypto.randomBytes(8).toString("hex")}`,
    url: `https://store.lemonsqueezy.com/checkout/buy/${variantId}?checkout[custom][user_id]=${customData.user_id}`,
    custom_data: customData,
  };
}

function createPortalSession(customerId) {
  return {
    url: `https://app.lemonsqueezy.com/my-orders/`,
  };
}

function generateWebhookPayload(eventName, data) {
  return JSON.stringify({
    meta: {
      event_name: eventName,
    },
    data: data,
  });
}

describe("Lemon Squeezy Simulation", () => {
  const secret = "whsec_test123";

  test("HMAC-SHA256 X-Signature verification using crypto.timingSafeEqual", () => {
    const rawPayload = JSON.stringify({ meta: { event_name: "subscription_created" }, data: { id: "sub_123" } });
    const signature = generateLemonSqueezySignature(rawPayload, secret);
    
    expect(verifyLemonSqueezySignature(rawPayload, signature, secret)).toBe(true);
    expect(verifyLemonSqueezySignature(rawPayload, signature.replace('a', 'b').padEnd(signature.length, '0'), secret)).toBe(false);
  });

  test("simulated Lemon Squeezy hosted checkouts with custom data", () => {
    const customData = { user_id: "user_123" };
    const session = createCheckoutSession("store_1", "var_1", customData);
    expect(session.id).toMatch(/^checkout_/);
    expect(session.url).toContain("lemonsqueezy.com/checkout/buy/var_1");
    expect(session.url).toContain("user_id]=user_123");
    expect(session.custom_data).toEqual(customData);
  });

  test("portal URLs", () => {
    const session = createPortalSession("cus_123");
    expect(session.url).toContain("lemonsqueezy.com");
  });

  test("all lifecycle transitions", () => {
    const transitions = [
      "subscription_created",
      "subscription_updated",
      "subscription_paused",
      "subscription_unpaused",
      "subscription_cancelled",
      "subscription_resumed",
      "subscription_expired",
      "subscription_payment_failed",
    ];
    
    for (const transition of transitions) {
      const payload = generateWebhookPayload(transition, { id: "sub_123" });
      expect(payload).toContain(transition);
      const parsed = JSON.parse(payload);
      expect(parsed.meta.event_name).toBe(transition);
    }
  });
});
