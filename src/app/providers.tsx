"use client";

import { useState, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { convexUrl } from "@/lib/convex-api";

/**
 * Convex + Better Auth are optional until configured. With no
 * `NEXT_PUBLIC_CONVEX_URL`, the app renders normally and every backend-driven
 * component shows its "not connected" state — a fresh clone must never crash
 * because the buyer has not connected a backend yet.
 *
 * The client is created in `useState` rather than at module scope: a module-level
 * client is shared across SSR requests, the same bug class as a module-level store.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => (convexUrl ? new ConvexReactClient(convexUrl) : null));

  if (!client) return <>{children}</>;
  return (
    <ConvexBetterAuthProvider client={client} authClient={authClient}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
