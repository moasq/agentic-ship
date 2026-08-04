import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";

// Components are the only backend "plugins" this app uses — both first-party:
// auth state and Stripe sync live in component-owned tables, not in our schema.
const app = defineApp();
app.use(betterAuth);
app.use(stripe);

export default app;
