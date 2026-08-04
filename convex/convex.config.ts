import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";
import resend from "@convex-dev/resend/convex.config.js";

// Components are the only backend "plugins" this app uses — all three first-party.
// Auth state, Stripe sync and the email queue live in component-owned tables, never
// in our schema.
const app = defineApp();
app.use(betterAuth);
app.use(stripe);
app.use(resend);

export default app;
