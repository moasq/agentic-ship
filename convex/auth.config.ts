import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// The file whose absence causes "works locally, 401s in production".
// It tells Convex to trust JWTs minted by the Better Auth component.
export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
