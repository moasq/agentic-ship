import { describe, expect, it } from "vitest";
import { getUser, requireUser, requireOwner } from "./auth";

/**
 * The auth seam is pure logic over ctx.auth — testable today, before any deployment
 * exists. Domain-function tests (convex-test against the in-memory backend) join once
 * `npx convex dev` has generated `convex/_generated` — pattern in the testing skill.
 */
const ctxWith = (identity: { subject: string; email?: string } | null) =>
  ({ auth: { getUserIdentity: async () => identity } }) as never;

describe("getUser", () => {
  it("returns null when unauthenticated", async () => {
    expect(await getUser(ctxWith(null))).toBeNull();
  });

  it("returns subject and email from the authenticated context", async () => {
    const user = await getUser(ctxWith({ subject: "user_1", email: "a@b.co" }));
    expect(user).toEqual({ subject: "user_1", email: "a@b.co" });
  });
});

describe("requireUser", () => {
  it("throws when unauthenticated — never returns a guest", async () => {
    await expect(requireUser(ctxWith(null))).rejects.toThrow("Unauthenticated");
  });

  it("passes the identity through when authenticated", async () => {
    const user = await requireUser(ctxWith({ subject: "user_1" }));
    expect(user.subject).toBe("user_1");
  });
});

describe("requireOwner", () => {
  const me = { subject: "user_1" };

  it("throws Not found on a missing document — same as unauthorized, no oracle", () => {
    expect(() => requireOwner(me, null)).toThrow("Not found");
  });

  it("throws Forbidden when the document belongs to someone else", () => {
    expect(() => requireOwner(me, { userId: "user_2" })).toThrow("Forbidden");
  });

  it("throws Forbidden when the document has no owner at all", () => {
    expect(() => requireOwner(me, {})).toThrow("Forbidden");
  });

  it("allows the owner", () => {
    expect(() => requireOwner(me, { userId: "user_1" })).not.toThrow();
  });
});
