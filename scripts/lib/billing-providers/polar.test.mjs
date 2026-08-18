// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  applyPolarEntitlementEvent,
  createPolarCheckoutInput,
  createPolarEntitlementState,
  createPolarPortalInput,
} from "./polar.mjs";

function event(deliveryId, type, occurredAt, fields = {}) {
  return { deliveryId, type, occurredAt, verified: true, ...fields };
}

function apply(state, nextEvent) {
  return applyPolarEntitlementEvent(state, nextEvent).state;
}

describe("Polar entitlement lifecycle", () => {
  test("creation waits for activation before granting access", () => {
    const created = apply(createPolarEntitlementState(), event("evt_1", "subscription.created", "2026-01-01T00:00:00.000Z"));
    expect(created).toMatchObject({ entitled: false, status: "pending" });

    const active = apply(created, event("evt_2", "subscription.active", "2026-01-01T00:00:01.000Z"));
    expect(active).toMatchObject({ entitled: true, status: "active" });
  });

  test("renewal and refund events do not invent entitlement changes", () => {
    let state = apply(createPolarEntitlementState(), event("evt_1", "subscription.active", "2026-01-01T00:00:00.000Z"));
    state = apply(state, event("evt_2", "order.paid", "2026-02-01T00:00:00.000Z"));
    expect(state.entitled).toBe(true);
    state = apply(state, event("evt_3", "order.refunded", "2026-02-01T00:00:01.000Z"));
    expect(state.entitled).toBe(true);
  });

  test("scheduled cancellation keeps access until revocation", () => {
    let state = apply(createPolarEntitlementState(), event("evt_1", "subscription.active", "2026-01-01T00:00:00.000Z"));
    state = apply(state, event("evt_2", "subscription.canceled", "2026-01-02T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "canceling" });
    state = apply(state, event("evt_3", "subscription.uncanceled", "2026-01-03T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "active" });
    state = apply(state, event("evt_4", "subscription.revoked", "2026-01-04T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: false, status: "revoked" });
  });

  test("past due keeps current access and activation records recovery", () => {
    let state = apply(createPolarEntitlementState(), event("evt_1", "subscription.active", "2026-01-01T00:00:00.000Z"));
    state = apply(state, event("evt_2", "subscription.past_due", "2026-02-01T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "past_due" });
    state = apply(state, event("evt_3", "subscription.active", "2026-02-02T00:00:00.000Z"));
    expect(state).toMatchObject({ entitled: true, status: "active" });
  });

  test("verified customer state can revoke or restore access", () => {
    let state = apply(createPolarEntitlementState(), event("evt_1", "customer.state_changed", "2026-01-01T00:00:00.000Z", { hasActiveSubscription: true }));
    expect(state.entitled).toBe(true);
    state = apply(state, event("evt_2", "customer.state_changed", "2026-01-02T00:00:00.000Z", { hasActiveSubscription: false }));
    expect(state.entitled).toBe(false);
  });
});

describe("Polar customer flows", () => {
  test("checkout accepts only an allowlisted plan and authenticated reference", () => {
    expect(
      createPolarCheckoutInput({
        planKey: "pro",
        allowedPlanKeys: ["starter", "pro"],
        authenticatedReferenceId: "org_123",
      }),
    ).toEqual({ slug: "pro", referenceId: "org_123" });
    expect(() =>
      createPolarCheckoutInput({ planKey: "enterprise", allowedPlanKeys: ["pro"], authenticatedReferenceId: "org_123" }),
    ).toThrow(/server-allowed plan key/);
    expect(() => createPolarCheckoutInput({ planKey: "pro", allowedPlanKeys: ["pro"] })).toThrow(/authenticated/);
  });

  test("portal access requires an authenticated session", () => {
    expect(createPolarPortalInput("user_123")).toEqual({});
    expect(() => createPolarPortalInput(null)).toThrow(/authenticated session/);
  });
});

describe("Polar delivery safety", () => {
  test("an unverified request cannot mutate entitlement", () => {
    const state = createPolarEntitlementState();
    const result = applyPolarEntitlementEvent(state, {
      ...event("evt_bad", "subscription.active", "2026-01-01T00:00:00.000Z"),
      verified: false,
    });
    expect(result).toEqual({ outcome: "rejected_unverified", state });
  });

  test("duplicate and stale deliveries cannot overwrite current state", () => {
    let state = apply(createPolarEntitlementState(), event("evt_1", "subscription.active", "2026-02-01T00:00:00.000Z"));
    const duplicate = applyPolarEntitlementEvent(state, event("evt_1", "subscription.revoked", "2026-03-01T00:00:00.000Z"));
    expect(duplicate.outcome).toBe("ignored_duplicate");
    expect(duplicate.state.entitled).toBe(true);

    const stale = applyPolarEntitlementEvent(state, event("evt_older", "subscription.revoked", "2026-01-01T00:00:00.000Z"));
    expect(stale.outcome).toBe("ignored_stale");
    expect(stale.state.entitled).toBe(true);
  });
});
