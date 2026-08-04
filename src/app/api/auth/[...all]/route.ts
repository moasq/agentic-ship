import { handler } from "@/lib/auth-server";

/**
 * The ONE sanctioned Next API route: the Better Auth proxy. Every other data path
 * goes through Convex functions. Without this file, every sign-in fails with no
 * useful error — pnpm health checks it exists whenever convex/auth.ts does.
 */
export const { GET, POST } = handler;
