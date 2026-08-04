"use client";

import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import type { AuthClient } from "@convex-dev/better-auth/react";

/**
 * The browser half of auth. Plugins here mirror convex/auth.ts one-to-one —
 * enabling a feature (magic links, 2FA, …) means adding its plugin in BOTH files
 * and nowhere else. Domain code never imports this; it renders from
 * api.auth.getCurrentUser and api.billing.getEntitlement instead.
 */
// Annotated with the adapter's own AuthClient union so a plugin mismatch fails HERE,
// at the definition, instead of as an unreadable generic error at the provider.
export const authClient: AuthClient = createAuthClient({
  plugins: [convexClient()],
});
