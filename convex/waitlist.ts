import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * One domain, one file. This file is the entire public API of the waitlist.
 *
 * Security posture, on purpose:
 *   - emails are NEVER returned by a public function; `count` returns a number
 *   - `listRecent` is internal, so it is unreachable from the browser
 *   - all input is length-capped and normalized before it touches the database
 */

const MAX_EMAIL_LENGTH = 254; // RFC 5321 limit — cap before storing attacker-controlled text
const MAX_SOURCE_LENGTH = 64;
const COUNTER_NAME = "waitlist";

// Deliberately permissive but bounded. Real deliverability checking is the email
// provider's job; this only rejects obvious junk before it reaches the table.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) throw new Error("Invalid email");
  if (!EMAIL_SHAPE.test(email)) throw new Error("Invalid email");
  return email;
}

export const join = mutation({
  args: {
    email: v.string(),
    source: v.optional(v.string()),
  },
  returns: v.object({
    status: v.union(v.literal("added"), v.literal("already")),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const source = args.source?.slice(0, MAX_SOURCE_LENGTH);

    // Indexed lookup, not `.filter()` — this runs on every signup.
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) return { status: "already" as const };

    await ctx.db.insert("waitlist", { email, source, createdAt: Date.now() });

    // The counter is server-maintained only. No client value is ever written
    // into it, so it cannot be pushed to an arbitrary or negative number.
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
      .unique();

    if (counter) await ctx.db.patch(counter._id, { value: counter.value + 1 });
    else await ctx.db.insert("counters", { name: COUNTER_NAME, value: 1 });

    return { status: "added" as const };
  },
});

export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // O(1). Never `.collect()` a table a stranger can grow.
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
      .unique();
    return counter?.value ?? 0;
  },
});

/**
 * Internal: the browser cannot call this. Export the list from a trusted
 * surface (a scheduled job, a Server Action behind auth) — never a public query.
 */
export const listRecent = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("waitlist"),
      _creationTime: v.number(),
      email: v.string(),
      source: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await ctx.db.query("waitlist").order("desc").take(limit);
  },
});
