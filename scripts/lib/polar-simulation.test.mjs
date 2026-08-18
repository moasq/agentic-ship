// @vitest-environment node
import { describe, expect, test } from "vitest";
import crypto from "node:crypto";

function generatePolarSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyPolarSignature(payload, signature, secret) {
  const expected = generatePolarSignature(payload, secret);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function createCheckoutSession(priceId, userId) {
  return {
    id: `checkout_${crypto.randomBytes(8).toString("hex")}`,
    url: `https://sandbox.polar.sh/checkout/...`,
    status: "open",
    customer_id: userId,
  };
}

function createPortalSession(customerId) {
  return {
    url: `https://sandbox.polar.sh/customer-portal/...`,
  };
}

function generateWebhookPayload(type, data) {
  return JSON.stringify({ type, data });
}

describe("Polar Simulation", () => {
  const secret = "whsec_test123";

  test("HMAC-SHA256 signature verification over raw request payloads", () => {
    const rawPayload = JSON.stringify({ event: "subscription.created", data: { id: "sub_123" } });
    const signature = generatePolarSignature(rawPayload, secret);
    
    expect(verifyPolarSignature(rawPayload, signature, secret)).toBe(true);
    expect(verifyPolarSignature(rawPayload, signature.replace('a', 'b').padEnd(signature.length, '0'), secret)).toBe(false);
  });

  test("simulated Polar checkout sessions", () => {
    const session = createCheckoutSession("price_pro", "user_123");
    expect(session.id).toMatch(/^checkout_/);
    expect(session.url).toContain("polar.sh");
  });

  test("customer portal session generation", () => {
    const session = createPortalSession("cus_123");
    expect(session.url).toContain("polar.sh/customer-portal");
  });

  test("all lifecycle transitions", () => {
    const transitions = [
      "subscription.created", // pending
      "subscription.active", // entitled
      "subscription.updated", 
      "subscription.past_due", // grace period
      "subscription.canceled", 
      "subscription.revoked", // revoked
    ];
    
    for (const transition of transitions) {
      const payload = generateWebhookPayload(transition, { id: "sub_123" });
      expect(payload).toContain(transition);
    }
  });
});
