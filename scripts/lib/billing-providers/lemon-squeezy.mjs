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

export function resolveLemonSqueezyPortalUrl({ authenticatedSubject, ownerSubject, providerUrl, allowedPortalHosts = [] }) {
  if (!authenticatedSubject || authenticatedSubject !== ownerSubject) {
    throw new Error("Lemon Squeezy portal access requires the authenticated owner");
  }
  const url = new URL(providerUrl);
  const knownProviderHost = url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com");
  if (url.protocol !== "https:" || (!knownProviderHost && !allowedPortalHosts.includes(url.hostname))) {
    throw new Error("Lemon Squeezy portal URL must be provider-hosted");
  }
  return url.toString();
}

export function createLemonSqueezyEntitlementState() {
  return {
    entitled: false,
    status: "none",
    ownerReference: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    lastEventAt: null,
    processedDeliveryIds: [],
  };
}

export function toLemonSqueezyEvent(verifiedRequest) {
  if (verifiedRequest?.verified !== true) return { verified: false };
  const data = verifiedRequest.payload?.data ?? {};
  const attributes = data.attributes ?? {};
  const customData = verifiedRequest.payload?.meta?.custom_data ?? {};
  const ownerReference = customData.organization_id
    ? { kind: "organization", id: String(customData.organization_id) }
    : customData.user_id
      ? { kind: "user", id: String(customData.user_id) }
      : null;
  return {
    verified: true,
    deliveryId: verifiedRequest.deliveryId,
    type: verifiedRequest.payload?.meta?.event_name,
    occurredAt: attributes.updated_at ?? attributes.created_at,
    subscriptionStatus: attributes.status,
    endsAt: attributes.ends_at,
    ownerReference,
    providerCustomerId: attributes.customer_id ? String(attributes.customer_id) : null,
    providerSubscriptionId:
      data.type === "subscriptions" && data.id
        ? String(data.id)
        : attributes.subscription_id
          ? String(attributes.subscription_id)
          : null,
  };
}

function withDelivery(state, event, changes = {}) {
  const routing = {
    ...(event.ownerReference ? { ownerReference: event.ownerReference } : {}),
    ...(event.providerCustomerId ? { providerCustomerId: event.providerCustomerId } : {}),
    ...(event.providerSubscriptionId ? { providerSubscriptionId: event.providerSubscriptionId } : {}),
  };
  return {
    ...state,
    ...routing,
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
    return withDelivery(state, event, { entitled: true, status: "canceling" });
  }
  if (event.subscriptionStatus === "paused") {
    return withDelivery(state, event, { entitled: true, status: "paused" });
  }
  if (event.subscriptionStatus === "expired") {
    return withDelivery(state, event, { entitled: false, status: "expired" });
  }
  if (["past_due", "unpaid"].includes(event.subscriptionStatus)) {
    return withDelivery(state, event, { entitled: true, status: "past_due" });
  }
  return withDelivery(state, event, state.status === "none" ? { status: "pending" } : {});
}

function transition(state, event) {
  switch (event.type) {
    case "subscription_created":
    case "subscription_updated":
      return applySubscriptionStatus(state, event);
    case "subscription_paused":
      return withDelivery(state, event, { entitled: true, status: "paused" });
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
      return withDelivery(state, event, { entitled: true, status: "past_due" });
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
