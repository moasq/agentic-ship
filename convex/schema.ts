import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Nothing exists unless it is declared here. Every query path gets an index —
// `.filter()` on a growable table is a defect, not a shortcut.
export default defineSchema({
  waitlist: defineTable({
    email: v.string(), // normalized: trimmed + lowercased before insert
    source: v.optional(v.string()), // where the signup came from, for attribution
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Counters are kept as documents so public reads never scan the table they
  // count. `waitlist.count` must stay O(1) no matter how many rows exist.
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),
});
