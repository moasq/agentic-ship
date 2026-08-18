// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  applyLemonSqueezyEntitlementEvent,
  createLemonSqueezyCheckoutInput,
  createLemonSqueezyEntitlementState,
  resolveLemonSqueezyPortalUrl,
  toLemonSqueezyEvent,
  verifyLemonSqueezyWebhook,
} from "./lemon-squeezy.mjs";

function event(deliveryId, type, occurredAt, fields = {}) {
  return { deliveryId, type, occurredAt, verified: true, ...fields };
}

function apply(state, nextEvent) {
  return applyLemonSqueezyEntitlementEvent(state, nextEvent).state;
}

describe("Lemon Squeezy webhook verification", () => {
  const secret = "fixture_webhook_secret";
  const rawBody = JSON.stringify({
    meta: { event_name: "subscription_created", custom_data: { organization_id: "org_123" } },
    data: {
      type: "subscriptions",
      id: "sub_123",
      attributes: {
        status: "active",
        customer_id: 456,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    },
  });

  test("verifies X-Signature over the exact raw body before parsing", () => {
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    const verified = verifyLemonSqueezyWebhook({ rawBody, signature, secret });
    const mapped = toLemonSqueezyEvent(verified);

    expect(verified.verified).toBe(true);
    expect(verified.payload.meta.event_name).toBe("subscription_created");
    expect(mapped).toMatchObject({
      verified: true,
      type: "subscription_created",
      occurredAt: "2026-01-01T00:00:00.000Z",
      subscriptionStatus: "active",
      ownerReference: { kind: "organization", id: "org_123" },
      providerCustomerId: "456",
      providerSubscriptionId: "sub_123",
    });
    expect(applyLemonSqueezyEntitlementEvent(null, mapped).state).toMatchObject({
      ownerReference: { kind: "organization", id: "org_123" },
      providerCustomerId: "456",
      providerSubscriptionId: "sub_123",
      entitled: true,
    });
  });

  test("maps payment invoice events back to their provider subscription", () => {
    const invoiceBody = JSON.stringify({
      meta: { event_name: "subscription_payment_failed" },
      data: {
        type: "subscription-invoices",
        id: "invoice_123",
        attributes: { subscription_id: 789, created_at: "2026-02-01T00:00:00.000Z" },
      },
    });
    const signature = createHmac("sha256", secret).update(invoiceBody).digest("hex");
    const mapped = toLemonSqueezyEvent(verifyLemonSqueezyWebhook({ rawBody: invoiceBody, signature, secret }));

    expect(mapped.providerSubscriptionId).toBe("789");
    expect(mapped.type).toBe("subscription_payment_failed");
  });

  test("rejects changed bodies and malformed signatures without parsing or mutating", () => {
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    const invalid = verifyLemonSqueezyWebhook({ rawBody: `${rawBody} `, signature, secret });
    const malformed = verifyLemonSqueezyWebhook({ rawBody, signature: "not-hex", secret });
    const state = createLemonSqueezyEntitlementState();

    expect(invalid).toEqual({ verified: false, deliveryId: null, payload: null });
    expect(malformed.verified).toBe(false);
    expect(applyLemonSqueezyEntitlementEvent(state, toLemonSqueezyEvent(invalid))).toEqual({
      outcome: "rejected_unverified",
      state,
    });
  });
});

describe("Lemon Squeezy customer flows", () => {
  test("checkout resolves a server-owned variant and authenticated custom data", () => {
    expect(
      createLemonSqueezyCheckoutInput({
        planKey: "pro",
        plans: { pro: { variantId: "variant_123" } },
        storeId: "store_123",
        authenticatedReference: { kind: "organization", id: "org_123" },
      }),
    ).toEqual({
      storeId: "store_123",
      variantId: "variant_123",
      checkoutData: { custom: { organization_id: "org_123", plan_key: "pro" } },
    });
    expect(() =>
      createLemonSqueezyCheckoutInput({
        planKey: "enterprise",
        plans: { pro: { variantId: "variant_123" } },
        storeId: "store_123",
        authenticatedReference: { kind: "user", id: "user_123" },
      }),
    ).toThrow(/server-allowed plan key/);
  });

  test("portal access requires the owner and supports an allowlisted custom store domain", () => {
    expect(
      resolveLemonSqueezyPortalUrl({
        authenticatedSubject: "user_123",
        ownerSubject: "user_123",
        providerUrl: "https://app.lemonsqueezy.com/my-orders/example?expires=1&signature=fixture",
      }),
    ).toMatch(/^https:\/\/app\.lemonsqueezy\.com/);
    expect(
      resolveLemonSqueezyPortalUrl({
        authenticatedSubject: "user_123",
        ownerSubject: "user_123",
        providerUrl: "https://billing.example.com/billing?expires=1&signature=fixture",
        allowedPortalHosts: ["billing.example.com"],
      }),
    ).toMatch(/^https:\/\/billing\.example\.com/);
    expect(() =>
      resolveLemonSqueezyPortalUrl({
        authenticatedSubject: "user_123",
        ownerSubject: "user_456",
        providerUrl: "https://app.lemonsqueezy.com/my-orders/example",
      }),
    ).toThrow(/authenticated owner/);
  });
});

describe("Lemon Squeezy entitlement lifecycle", () => {
  test("creation and verified updates follow current subscription status", () => {
    let state = apply(
      createLemonSqueezyEntitlementState(),
      event("delivery_1", "subscription_created", "2026-01-01T00:00:00.000Z", { subscriptionStatus: "active" }),
    );
    expect(state).toMatchObject({ entitled: true, status: "active" });
    state = apply(
      state,
      event("delivery_2", "subscription_updated", "2026-01-02T00:00:00.000Z", { subscriptionStatus: "paused" }),
    );
    expect(state).toMatchObject({ entitled: true, status: "paused" });
  });

  test("a cancelled update keeps access until a verified expiration arrives", () => {
    let state = apply(
      createLemonSqueezyEntitlementState(),
      event("delivery_1", "subscription_created", "2026-01-01T00:00:00.000Z", { subscriptionStatus: "active" }),
    );
    state = apply(
      state,
      event("delivery_2", "subscription_updated", "2026-01-02T00:00:00.000Z", {
        subscriptionStatus: "cancelled",
        endsAt: "2026-02-01T00:00:00.000Z",
      }),
    );
    expect(state).toMatchObject({ entitled: true, status: "canceling" });
    state = apply(state, event("delivery_3", "subscription_expired", "2026-02-02T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: false, status: "expired" });
  });

  test("pause, unpause, cancellation, resume, and expiration preserve paid-period access", () => {
    let state = apply(
      createLemonSqueezyEntitlementState(),
      event("delivery_1", "subscription_created", "2026-01-01T00:00:00.000Z", { subscriptionStatus: "active" }),
    );
    state = apply(state, event("delivery_2", "subscription_paused", "2026-01-02T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "paused" });
    state = apply(state, event("delivery_3", "subscription_unpaused", "2026-01-03T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "active" });
    state = apply(state, event("delivery_4", "subscription_cancelled", "2026-01-04T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "canceling" });
    state = apply(state, event("delivery_5", "subscription_resumed", "2026-01-05T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "active" });
    state = apply(state, event("delivery_6", "subscription_expired", "2026-02-01T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: false, status: "expired" });
  });

  test("payment failure keeps current access, recovery restores it, and refund alone does not revoke", () => {
    let state = apply(
      createLemonSqueezyEntitlementState(),
      event("delivery_1", "subscription_created", "2026-01-01T00:00:00.000Z", { subscriptionStatus: "active" }),
    );
    state = apply(state, event("delivery_2", "subscription_payment_failed", "2026-02-01T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "past_due" });
    state = apply(state, event("delivery_3", "subscription_payment_recovered", "2026-02-02T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "active" });
    state = apply(state, event("delivery_4", "subscription_payment_refunded", "2026-02-03T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "active" });
  });

  test("duplicates and stale deliveries cannot overwrite newer entitlement", () => {
    const state = apply(
      createLemonSqueezyEntitlementState(),
      event("delivery_1", "subscription_created", "2026-02-01T00:00:00.000Z", { subscriptionStatus: "active" }),
    );
    const duplicate = applyLemonSqueezyEntitlementEvent(
      state,
      event("delivery_1", "subscription_expired", "2026-03-01T00:00:00.000Z"),
    );
    const stale = applyLemonSqueezyEntitlementEvent(
      state,
      event("delivery_old", "subscription_expired", "2026-01-01T00:00:00.000Z"),
    );

    expect(duplicate.outcome).toBe("ignored_duplicate");
    expect(duplicate.state.entitled).toBe(true);
    expect(stale.outcome).toBe("ignored_stale");
    expect(stale.state.entitled).toBe(true);
  });
});
