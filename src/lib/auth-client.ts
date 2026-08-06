"use client";

import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import type { AuthClient as ConvexAdapterAuthClient } from "@convex-dev/better-auth/react";

/**
 * The browser half of auth. Plugins here mirror convex/auth.ts one-to-one —
 * enabling a feature (magic links, 2FA, …) means adding its plugin in BOTH files
 * and nowhere else. Domain code never imports this; it renders from
 * api.auth.getCurrentUser and api.billing.getEntitlement instead.
 */
// Keep Better Auth's inferred type: it is the source of truth for useSession and
// every enabled client action (signIn.email, signUp.email, signOut, ...).
export const authClient = createAuthClient({
  plugins: [convexClient()],
});

/**
 * @convex-dev/better-auth@0.12.5 builds its public AuthClient alias with an
 * intersection that Better Auth >=1.6.22 now infers as useSession().data = never.
 * The provider's configured (non-cross-domain) path still consumes this unchanged
 * surface. Keep these compile-only accesses beside the narrow bridge so an upstream
 * API change fails the build before the assertion can become unsafe.
 */
function assertConfiguredConvexProviderRuntime(client: typeof authClient) {
  const session = client.useSession();
  const sessionId: string | undefined = session.data?.session.id;
  const isPending: boolean = session.isPending;
  const sessionRequest: PromiseLike<unknown> = client.getSession({
    fetchOptions: { headers: { Authorization: "Bearer compile-time-check" } },
  });
  const tokenRequest = client.convex.token({ fetchOptions: { throw: false } });

  tokenRequest.then(({ data }) => {
    const token: string | null | undefined = data?.token;
    return token;
  });

  return { isPending, sessionId, sessionRequest };
}
void assertConfiguredConvexProviderRuntime;

// The cast is isolated to the adapter's stale declaration. Application code keeps
// the exact inferred type above; only the third-party provider receives this alias.
export const convexProviderAuthClient =
  authClient as unknown as ConvexAdapterAuthClient;
