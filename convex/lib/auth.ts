import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";

/**
 * The auth seam.
 *
 * Domain code calls `requireUser` and never names the auth vendor. Swapping
 * Better Auth for Clerk or Convex Auth is then a change to this file, not a
 * change to every function in `convex/`.
 *
 * Identity always comes from the authenticated context. A user id passed as a
 * function argument is attacker-controlled input — never trust one.
 */

export type Identity = {
  subject: string;
  email?: string;
  name?: string;
};

export async function getUser(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<Identity | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return { subject: identity.subject, email: identity.email, name: identity.name };
}

/** A human label for a member row. Falls back through name → email local part → "Reader". */
export function displayName(user: Identity): string {
  if (user.name?.trim()) return user.name.trim().slice(0, 60);
  const local = user.email?.split("@")[0];
  if (local) return local.slice(0, 60);
  return "Reader";
}

export async function requireUser(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<Identity> {
  const user = await getUser(ctx);
  if (!user) throw new Error("Unauthenticated");
  return user;
}

/**
 * Ownership is checked per document, on every read and every write. A document
 * being reachable is not permission to read it.
 */
export function requireOwner(user: Identity, doc: { userId?: string } | null): void {
  if (!doc) throw new Error("Not found");
  if (doc.userId !== user.subject) throw new Error("Forbidden");
}
