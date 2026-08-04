# A worked example — one domain, end to end

Reference for the convex-structure skill. This is the shape every domain follows. It
lives here as a **document, not as shipped code**: the repo starts empty so nothing has
to be deleted before you can build.

The example is a waitlist because it exercises every rule with no auth required:
indexed dedupe, a counter instead of a scan, public/internal separation, and input
validation.

## `convex/schema.ts`

```ts
waitlist: defineTable({
  email: v.string(),      // normalized: trimmed + lowercased before insert
  source: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_email", ["email"]),

// Counters are documents so a public read never scans the table it counts.
counters: defineTable({
  name: v.string(),
  value: v.number(),
}).index("by_name", ["name"]),
```

## `convex/waitlist.ts` — the whole public API of the domain

```ts
import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const MAX_EMAIL_LENGTH = 254;          // RFC 5321 — cap attacker-controlled text
const COUNTER_NAME = "waitlist";
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) throw new Error("Invalid email");
  if (!EMAIL_SHAPE.test(email)) throw new Error("Invalid email");
  return email;
}

export const join = mutation({
  args: { email: v.string(), source: v.optional(v.string()) },
  returns: v.object({ status: v.union(v.literal("added"), v.literal("already")) }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);

    // Indexed lookup, not .filter() — this runs on every signup.
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return { status: "already" as const };

    await ctx.db.insert("waitlist", {
      email,
      source: args.source?.slice(0, 64),
      createdAt: Date.now(),
    });

    // Server-maintained: no client value is ever written into a counter.
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
    // O(1). Never .collect() a table a stranger can grow.
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_name", (q) => q.eq("name", COUNTER_NAME))
      .unique();
    return counter?.value ?? 0;
  },
});

/** Internal: unreachable from the browser. Emails never leave through a public query. */
export const listRecent = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({
    _id: v.id("waitlist"), _creationTime: v.number(),
    email: v.string(), source: v.optional(v.string()), createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return await ctx.db.query("waitlist").order("desc").take(limit);
  },
});
```

## The frontend split

A **block** takes props and renders. A **feature** owns the data. The branch on
`isConvexConfigured` happens in the parent, before any Convex hook mounts — `useQuery`
throws when there is no `ConvexProvider` in the tree, and `"skip"` does not save you.

```tsx
// src/components/features/waitlist/waitlist-panel.tsx
export function WaitlistPanel() {
  if (!isConvexConfigured) {
    return <WaitlistForm count={null} state="not-connected" action={() => {}} />;
  }
  return <WaitlistLive />;   // hooks live in here, called unconditionally
}
```

## What this example demonstrates

| Rule | Where you see it |
| --- | --- |
| `args` **and** `returns` validators on every function | all three functions |
| Indexes, never `.filter()` | `by_email` lookup |
| No unbounded `.collect()` | counter document; `.take(limit)` in `listRecent` |
| Public vs internal | `join`/`count` public, `listRecent` internal |
| Input capped and normalized before storage | `normalizeEmail`, `source.slice` |
| Counters never take a client value | the patch uses `counter.value + 1` |
| Blocks stateless, features own hooks | the panel/form split |
| Honest not-connected state | `state="not-connected"` |
