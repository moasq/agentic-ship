"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, isConvexConfigured } from "@/lib/convex-api";
import { WaitlistForm, type WaitlistState } from "@/components/blocks/waitlist-form";

/**
 * The feature owns the data. Hooks live here, never in `blocks/`.
 *
 * The split is not cosmetic: with no `NEXT_PUBLIC_CONVEX_URL` there is no
 * `ConvexProvider` in the tree, and `useQuery` throws on sight — `"skip"` does not save
 * you, because the failure is a missing client, not a missing argument. So the branch
 * happens BEFORE any Convex hook is called, and `WaitlistLive` calls its hooks
 * unconditionally. `isConvexConfigured` is inlined at build time, so the branch never
 * flips between renders and hook order stays stable.
 */
export function WaitlistPanel() {
  if (!isConvexConfigured) {
    return <WaitlistForm count={null} state="not-connected" action={() => {}} />;
  }
  return <WaitlistLive />;
}

function WaitlistLive() {
  const [state, setState] = useState<WaitlistState>("idle");

  // `useQuery` is the default data path: reactive, no refetch plumbing.
  const count = useQuery(api.waitlist.count, {});
  const join = useMutation(api.waitlist.join);

  async function action(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    setState("submitting");
    try {
      const result = (await join({ email, source: "site" })) as { status: "added" | "already" };
      setState(result.status);
    } catch {
      // The server message can carry input detail — show a fixed string instead.
      setState("error");
    }
  }

  return <WaitlistForm count={typeof count === "number" ? count : null} state={state} action={action} />;
}
