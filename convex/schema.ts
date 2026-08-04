import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Your tables. Nothing exists unless it is declared here.
 *
 * Empty on purpose — your first feature defines the first table. The rules that make a
 * table safe (indexes over .filter(), ownership on every row, counters instead of
 * scanning) are in .agents/skills/convex-structure/SKILL.md, and a complete worked
 * example is in that skill's references/example-domain.md.
 *
 * Auth, billing and email tables are NOT here: those live inside their components and
 * are managed by them.
 */
export default defineSchema({
  // Delete this table once you have a real one. It exists so `npx convex dev` has
  // something valid to deploy on the very first run.
  counters: defineTable({
    name: v.string(),
    value: v.number(), // server-maintained only — never written from a client argument
  }).index("by_name", ["name"]),
});
