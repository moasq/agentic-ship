"use client";

import { useState, type ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { convexUrl } from "@/lib/convex-api";

/**
 * Convex is optional until it is configured. With no `NEXT_PUBLIC_CONVEX_URL`, the app
 * renders normally and Convex-backed components show their "not connected" state — a
 * fresh clone must never crash because the buyer has not signed up for a backend yet.
 *
 * The client is created in `useState` rather than at module scope: a module-level
 * client is shared across SSR requests, which is the same bug class as a module-level
 * store.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => (convexUrl ? new ConvexReactClient(convexUrl) : null));

  if (!client) return <>{children}</>;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
