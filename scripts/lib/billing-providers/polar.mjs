export function createPolarEntitlementState() {
  return {
    entitled: false,
    status: "none",
    lastEventAt: null,
    processedDeliveryIds: [],
  };
}

export function createPolarCheckoutInput({ planKey, allowedPlanKeys, authenticatedReferenceId }) {
  if (!allowedPlanKeys?.includes(planKey)) throw new Error("Polar checkout requires a server-allowed plan key");
  if (!authenticatedReferenceId) throw new Error("Polar checkout requires an authenticated user or organization reference");
  return { slug: planKey, referenceId: authenticatedReferenceId };
}

export function createPolarPortalInput(authenticatedSubject) {
  if (!authenticatedSubject) throw new Error("Polar portal access requires an authenticated session");
  return {};
}

function withDelivery(state, event, changes = {}) {
  return {
    ...state,
    ...changes,
    lastEventAt: event.occurredAt,
    processedDeliveryIds: [...state.processedDeliveryIds, event.deliveryId],
  };
}

function transition(state, event) {
  switch (event.type) {
    case "subscription.created":
      return withDelivery(state, event, state.entitled ? {} : { status: "pending" });
    case "subscription.active":
    case "subscription.uncanceled":
      return withDelivery(state, event, { entitled: true, status: "active" });
    case "subscription.canceled":
      return withDelivery(state, event, { status: state.entitled ? "canceling" : state.status });
    case "subscription.past_due":
      return withDelivery(state, event, { status: state.entitled ? "past_due" : state.status });
    case "subscription.revoked":
      return withDelivery(state, event, { entitled: false, status: "revoked" });
    case "subscription.updated": {
      if (["active", "trialing"].includes(event.subscriptionStatus)) {
        return withDelivery(state, event, {
          entitled: true,
          status: event.cancelAtPeriodEnd ? "canceling" : "active",
        });
      }
      if (event.subscriptionStatus === "past_due") {
        return withDelivery(state, event, { status: state.entitled ? "past_due" : state.status });
      }
      if (["canceled", "unpaid", "incomplete_expired"].includes(event.subscriptionStatus)) {
        return withDelivery(state, event, { entitled: false, status: "revoked" });
      }
      return withDelivery(state, event);
    }
    case "customer.state_changed":
      return withDelivery(state, event, {
        entitled: event.hasActiveSubscription === true,
        status: event.hasActiveSubscription === true ? "active" : "revoked",
      });
    default:
      return withDelivery(state, event);
  }
}

/**
 * Model the mutation boundary after Polar's validateEvent has accepted the request.
 * The downstream mutation stores the delivery id and entitlement update atomically.
 */
export function applyPolarEntitlementEvent(current, event) {
  const state = current ?? createPolarEntitlementState();
  if (event?.verified !== true) return { outcome: "rejected_unverified", state };
  if (!event.deliveryId || !event.occurredAt || !event.type) throw new Error("verified Polar events need deliveryId, occurredAt, and type");
  if (state.processedDeliveryIds.includes(event.deliveryId)) return { outcome: "ignored_duplicate", state };
  if (state.lastEventAt && event.occurredAt <= state.lastEventAt) {
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
