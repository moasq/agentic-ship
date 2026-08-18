import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function verifyLemonSqueezyWebhook({ rawBody, signature, secret }) {
  if (typeof rawBody !== "string" || typeof secret !== "string" || secret.length === 0) {
    throw new Error("Lemon Squeezy webhook verification requires the raw body and signing secret");
  }
  if (!/^[a-f0-9]{64}$/i.test(signature ?? "")) {
    return { verified: false, deliveryId: null, payload: null };
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { verified: false, deliveryId: null, payload: null };
  }

  return {
    verified: true,
    deliveryId: createHash("sha256").update(rawBody).digest("hex"),
    payload: JSON.parse(rawBody),
  };
}

export function createLemonSqueezyCheckoutInput({ planKey, plans, storeId, authenticatedReference }) {
  const plan = plans?.[planKey];
  if (!plan?.variantId) throw new Error("Lemon Squeezy checkout requires a server-allowed plan key");
  if (!storeId) throw new Error("Lemon Squeezy checkout requires a configured store");
  if (!authenticatedReference?.id || !["user", "organization"].includes(authenticatedReference.kind)) {
    throw new Error("Lemon Squeezy checkout requires an authenticated user or organization reference");
  }

  const identityKey = authenticatedReference.kind === "organization" ? "organization_id" : "user_id";
  return {
    storeId,
    variantId: plan.variantId,
    checkoutData: { custom: { [identityKey]: authenticatedReference.id, plan_key: planKey } },
  };
}

export function resolveLemonSqueezyPortalUrl({ authenticatedSubject, providerUrl }) {
  if (!authenticatedSubject) throw new Error("Lemon Squeezy portal access requires an authenticated session");
  const url = new URL(providerUrl);
  if (url.protocol !== "https:" || !(url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"))) {
    throw new Error("Lemon Squeezy portal URL must be provider-hosted");
  }
  return url.toString();
}

export function createLemonSqueezyEntitlementState() {
  return {
    entitled: false,
    status: "none",
    lastEventAt: null,
    processedDeliveryIds: [],
  };
}

export function toLemonSqueezyEvent(verifiedRequest) {
  if (verifiedRequest?.verified !== true) return { verified: false };
  const attributes = verifiedRequest.payload?.data?.attributes ?? {};
  return {
    verified: true,
    deliveryId: verifiedRequest.deliveryId,
    type: verifiedRequest.payload?.meta?.event_name,
    occurredAt: attributes.updated_at ?? attributes.created_at,
    subscriptionStatus: attributes.status,
    endsAt: attributes.ends_at,
  };
}

function withDelivery(state, event, changes = {}) {
  return {
    ...state,
    ...changes,
    lastEventAt: event.occurredAt,
    processedDeliveryIds: [...state.processedDeliveryIds, event.deliveryId],
  };
}

function applySubscriptionStatus(state, event) {
  if (["active", "on_trial"].includes(event.subscriptionStatus)) {
    return withDelivery(state, event, { entitled: true, status: "active" });
  }
  if (event.subscriptionStatus === "cancelled") {
    const paidPeriodRemains = Date.parse(event.endsAt ?? "") > Date.parse(event.occurredAt);
    return withDelivery(state, event, {
      entitled: paidPeriodRemains,
      status: paidPeriodRemains ? "canceling" : "expired",
    });
  }
  if (["paused", "expired"].includes(event.subscriptionStatus)) {
    return withDelivery(state, event, { entitled: false, status: event.subscriptionStatus });
  }
  if (["past_due", "unpaid"].includes(event.subscriptionStatus)) {
    return withDelivery(state, event, { status: state.entitled ? "past_due" : state.status });
  }
  return withDelivery(state, event, state.status === "none" ? { status: "pending" } : {});
}

function transition(state, event) {
  switch (event.type) {
    case "subscription_created":
    case "subscription_updated":
      return applySubscriptionStatus(state, event);
    case "subscription_paused":
      return withDelivery(state, event, { entitled: false, status: "paused" });
    case "subscription_unpaused":
    case "subscription_resumed":
    case "subscription_payment_recovered":
    case "subscription_payment_success":
      return withDelivery(state, event, { entitled: true, status: "active" });
    case "subscription_cancelled":
      return withDelivery(state, event, { status: state.entitled ? "canceling" : state.status });
    case "subscription_expired":
      return withDelivery(state, event, { entitled: false, status: "expired" });
    case "subscription_payment_failed":
      return withDelivery(state, event, { status: state.entitled ? "past_due" : state.status });
    case "subscription_payment_refunded":
    case "order_refunded":
      return withDelivery(state, event);
    default:
      return withDelivery(state, event);
  }
}

/**
 * Model the transaction that stores the delivery id and entitlement update together.
 * A downstream Convex mutation must keep these writes in the same atomic boundary.
 */
export function applyLemonSqueezyEntitlementEvent(current, event) {
  const state = current ?? createLemonSqueezyEntitlementState();
  if (event?.verified !== true) return { outcome: "rejected_unverified", state };
  if (!event.deliveryId || !event.occurredAt || !event.type) {
    throw new Error("verified Lemon Squeezy events need deliveryId, occurredAt, and type");
  }
  if (!Number.isFinite(Date.parse(event.occurredAt))) {
    throw new Error("verified Lemon Squeezy events need a valid occurredAt timestamp");
  }
  if (state.processedDeliveryIds.includes(event.deliveryId)) return { outcome: "ignored_duplicate", state };
  if (state.lastEventAt && Date.parse(event.occurredAt) <= Date.parse(state.lastEventAt)) {
    return {
      outcome: "ignored_stale",
      state: {
        ...state,
        processedDeliveryIds: [...state.processedDeliveryIds, event.deliveryId],
      },
    };
  }
  return { outcome: "applied", state: transition(state, event) };
}
