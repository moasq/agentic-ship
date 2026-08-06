import { describe, expect, expectTypeOf, it } from "vitest";
import { authClient, convexProviderAuthClient } from "./auth-client";

type SessionData = ReturnType<typeof authClient.useSession>["data"];
type EmailSignInInput = Parameters<typeof authClient.signIn.email>[0];

describe("Better Auth client contract", () => {
  it("keeps the inferred session and email sign-in surfaces", () => {
    expectTypeOf<SessionData>().not.toBeNever();
    expectTypeOf<NonNullable<SessionData>>().toHaveProperty("session");
    expectTypeOf<NonNullable<SessionData>>().toHaveProperty("user");
    expectTypeOf<EmailSignInInput>().toMatchTypeOf<{
      email: string;
      password: string;
    }>();

    expect(typeof authClient.useSession).toBe("function");
    expect(typeof authClient.signIn.email).toBe("function");
    expect(typeof authClient.convex.token).toBe("function");
  });

  it("passes the same runtime client through the Convex type bridge", () => {
    expect(convexProviderAuthClient).toBe(authClient);
  });
});
