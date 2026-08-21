// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { inspectBackendContract } from "./backend-contract.mjs";

const roots = [];

function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), "backend-contract-"));
  roots.push(root);
  for (const [file, body] of Object.entries(files)) {
    const absolute = join(root, file);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, body);
  }
  return root;
}

const schema = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  posts: defineTable({ userId: v.string(), title: v.string() }),
  entitlements: defineTable({ userId: v.string(), entitled: v.boolean() }),
});`;

// This is the ownership shape declared in AGENTS.md: authenticated user.subject
// must match the fetched document's userId, and mismatch is a rejecting path.
const safeAuth = `
export async function requireUser(ctx) { return await ctx.auth.getUserIdentity(); }
export function requireOwner(user, doc) {
  if (doc.userId !== user.subject) throw new Error("not owner");
}`;

const safePosts = `
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireOwner, requireUser } from "./lib/auth";
export const get = query({ args: { id: v.id("posts") }, returns: v.any(), handler: async (ctx, args) => {
  const user = await requireUser(ctx);
  const post = await ctx.db.get(args.id);
  requireOwner(user, post);
  return post;
} });
export const update = mutation({ args: { id: v.id("posts"), title: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const user = await requireUser(ctx);
  const post = await ctx.db.get(args.id);
  requireOwner(user, post);
  await ctx.db.patch(args.id, { title: args.title });
  return null;
} });`;

const safeBilling = `
import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
export const createCheckout = action({ args: { planKey: v.string() }, returns: v.string(), handler: async (ctx, args) => {
  const user = await requireUser(ctx);
  return await hostedCheckout({ planKey: args.planKey, subject: user.subject });
} });
export const getEntitlement = query({ args: {}, returns: v.any(), handler: async (ctx) => {
  const user = await requireUser(ctx);
  return await stripe.getSubscription(ctx, user.subject);
} });
export const applyWebhookEntitlement = internalMutation({ args: { entitlementId: v.id("entitlements"), verified: v.boolean() }, returns: v.null(), handler: async (ctx, args) => {
  if (!args.verified) throw new Error("unverified webhook");
  await ctx.db.patch(args.entitlementId, { entitled: true });
  return null;
} });`;

const safeHttp = `
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const billingWebhook = httpAction({ handler: async (ctx, request) => {
  const event = await verifyWebhook(request);
  if (!event.verified) return new Response("invalid", { status: 401 });
  await ctx.runMutation(internal.billing.applyWebhookEntitlement, event);
  return new Response("ok");
} });`;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("inspectBackendContract", () => {
  test("keeps the tool-only engine green as not applicable", () => {
    expect(inspectBackendContract(workspace({}))).toEqual({ applicable: false, violations: [] });
  });

  test("accepts webhook-only authority and canonical userId versus subject ownership", () => {
    const result = inspectBackendContract(
      workspace({
        "convex/schema.ts": schema,
        "convex/lib/auth.ts": safeAuth,
        "convex/posts.ts": safePosts,
        "convex/billing.ts": safeBilling,
        "convex/http.ts": safeHttp,
      }),
    );
    expect(result).toEqual({ applicable: true, violations: [] });
  });

  test("rejects owned surfaces when requireOwner is a no-op", () => {
    const noOpAuth = `
export async function requireUser(ctx) { return await ctx.auth.getUserIdentity(); }
export function requireOwner(user, doc) { return doc; }`;
    const result = inspectBackendContract(
      workspace({ "convex/schema.ts": schema, "convex/lib/auth.ts": noOpAuth, "convex/posts.ts": safePosts }),
    );
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "convex/lib/auth.ts", rule: "owned-owner-helper" }),
      ]),
    );
  });

  test("rejects ownerId aliases because the declared helper contract protects userId", () => {
    const aliasedSchema = schema.replaceAll("userId", "ownerId");
    const result = inspectBackendContract(workspace({ "convex/schema.ts": aliasedSchema }));
    expect(result.violations.map((item) => item.rule)).toContain("owned-schema-field");
  });

  test("rejects checkout-success entitlement writes and client-supplied billing identity", () => {
    const billing = `
import { mutation } from "./_generated/server";
import { v } from "convex/values";
export const completeCheckout = mutation({ args: { entitlementId: v.id("entitlements"), userId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  await ctx.db.patch(args.entitlementId, { entitled: true, plan: "pro" });
  return null;
} });`;
    const result = inspectBackendContract(workspace({ "convex/schema.ts": schema, "convex/billing.ts": billing }));
    expect(result.violations.map((item) => item.rule)).toEqual(
      expect.arrayContaining(["billing-client-identity", "billing-public-entitlement-writer"]),
    );
  });

  test("rejects a public checkout path that hides the entitlement write behind a helper", () => {
    const billing = `
import { action } from "./_generated/server";
import { v } from "convex/values";
async function grantEntitlement(ctx, id) { await ctx.db.patch(id, { status: "active" }); }
export const createCheckout = action({ args: { entitlementId: v.id("entitlements") }, returns: v.null(), handler: async (ctx, args) => {
  await grantEntitlement(ctx, args.entitlementId);
  return null;
} });`;
    const result = inspectBackendContract(workspace({ "convex/schema.ts": schema, "convex/billing.ts": billing }));
    expect(result.violations.map((item) => item.rule)).toContain("billing-public-entitlement-writer");
  });

  test("rejects an internal entitlement writer when verification or webhook provenance is removed", () => {
    const billing = safeBilling.replace('if (!args.verified) throw new Error("unverified webhook");', "");
    const http = safeHttp.replace("const event = await verifyWebhook(request);", "const event = { verified: true };");
    const result = inspectBackendContract(
      workspace({ "convex/schema.ts": schema, "convex/billing.ts": billing, "convex/http.ts": http }),
    );
    expect(result.violations.map((item) => item.rule)).toEqual(
      expect.arrayContaining(["billing-writer-verification-guard", "billing-unverified-entitlement-path", "billing-webhook-source"]),
    );
  });

  test("rejects cross-owner reads and writes that bypass the authenticated owner guard", () => {
    const posts = `
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
export const get = query({ args: { id: v.id("posts") }, returns: v.any(), handler: async (ctx, args) => {
  const post = await ctx.db.get(args.id);
  return post;
} });
export const update = mutation({ args: { id: v.id("posts"), title: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const post = await ctx.db.get(args.id);
  await ctx.db.patch(args.id, { title: args.title });
  return null;
} });`;
    const result = inspectBackendContract(
      workspace({ "convex/schema.ts": schema, "convex/lib/auth.ts": safeAuth, "convex/posts.ts": posts }),
    );
    const rules = result.violations.map((item) => item.rule);
    expect(rules.filter((rule) => rule === "owned-auth-context")).toHaveLength(2);
    expect(rules.filter((rule) => rule === "owned-document-guard")).toHaveLength(2);
  });

  test("rejects a write that happens before requireOwner", () => {
    const posts = safePosts.replace(
      "requireOwner(user, post);\n  await ctx.db.patch",
      "await ctx.db.patch(args.id, { title: args.title });\n  requireOwner(user, post);\n  await ctx.db.patch",
    );
    const result = inspectBackendContract(
      workspace({ "convex/schema.ts": schema, "convex/lib/auth.ts": safeAuth, "convex/posts.ts": posts }),
    );
    expect(result.violations.map((item) => item.rule)).toContain("owned-write-order");
  });
});
