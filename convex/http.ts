import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { registerRoutes } from "@convex-dev/stripe";
import { authComponent, createAuth } from "./auth";

/**
 * ALL inbound HTTP lives here: auth routes + webhooks, nothing else.
 *
 * The Stripe component owns /stripe/webhook — it verifies the signature and rejects
 * everything unsigned BEFORE any of our code runs. We never parse a webhook body
 * ourselves, and we never add a second webhook path in front of it.
 */
const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  // Pinned in skills.lock.json. upstream-sync flags drift; never blind-bump an
  // API version — Stripe versions change webhook payload shapes.
  apiVersion: "2026-04-22.dahlia",
});

export default http;
