/**
 * Is email COHERENT on a deployment — not merely "is a Resend or Postmark name present".
 *
 * Same shape as `billing-coherence.mjs`, same reason: the keys live in Convex env by
 * rule R1, so no file check can see them, and each one is individually valid while the
 * COMBINATION is what silently breaks. A deployment carrying a webhook secret and no API
 * key reads as configured while every send is a no-op. A deployment out of `testMode`
 * with no verified sending address mails real people from an onboarding or unverified domain.
 *
 * Names only — this module never receives, inspects, or reports a secret VALUE. The one
 * exception is `EMAIL_FROM`, which is an address rather than a credential, and only its
 * DOMAIN is ever examined.
 */

/**
 * Social sign-in is all of a provider's pair or none of it.
 *
 * Better Auth registers a provider that has a client id and no secret, and the failure
 * then lands on the CUSTOMER — a broken redirect at the provider's own domain, after
 * they already clicked the button. `convex/auth.ts` therefore treats a half-set pair as
 * absent, which is safe but silent; this is what says it out loud.
 *
 * @param {Iterable<string>} envNames names present on the deployment
 * @returns {{ status: "PASS"|"WARN", detail: string }}
 */
export function inspectSocialAuthCoherence(envNames) {
  const names = new Set(envNames);
  const pairs = [
    { provider: "Google", id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
    { provider: "GitHub", id: "GITHUB_CLIENT_ID", secret: "GITHUB_CLIENT_SECRET" },
  ];

  const halves = pairs.filter((pair) => names.has(pair.id) !== names.has(pair.secret));
  if (halves.length > 0) {
    return {
      status: "WARN",
      detail: halves
        .map((pair) => {
          const present = names.has(pair.id) ? pair.id : pair.secret;
          const missing = names.has(pair.id) ? pair.secret : pair.id;
          return `${pair.provider} has ${present} but not ${missing} — the button stays hidden, so sign-in still works, but the provider is configured and unusable. Set the other half with \`pnpm secret:set ${missing}\`, or remove the first.`;
        })
        .join(" "),
    };
  }

  const enabled = pairs.filter((pair) => names.has(pair.id) && names.has(pair.secret));
  return {
    status: "PASS",
    detail: enabled.length ? `social sign-in: ${enabled.map((p) => p.provider).join(", ")}` : "email and password only",
  };
}

export const EMAIL_ENV = {
  apiKey: "RESEND_API_KEY",
  webhook: "RESEND_WEBHOOK_SECRET",
  from: "EMAIL_FROM",
};

export const POSTMARK_EMAIL_ENV = {
  serverToken: "POSTMARK_SERVER_TOKEN",
  webhook: "POSTMARK_WEBHOOK_SECRET",
  from: "EMAIL_FROM",
};

export const EMAIL_PROVIDER_ENV = "EMAIL_PROVIDER";

/**
 * @param {Iterable<string>} envNames names present on the deployment
 * @param {{ testMode: boolean, fromDomainIsResendDefault?: boolean, fromDomainIsDefault?: boolean }} config
 *   `testMode` is read from convex/email.ts, which is the file that decides whether
 *   the provider will accept a real address at all.
 * @param {{ selectedProvider?: string }} [options]
 * @returns {{ status: "PASS"|"WARN"|"FAIL"|"CRITICAL", detail: string, provider?: string }}
 */
export function inspectEmailCoherence(envNames, config = { testMode: true }, options = {}) {
  const names = new Set(envNames);
  const has = (name) => names.has(name);
  const { testMode, fromDomainIsResendDefault = false, fromDomainIsDefault = false } = config;

  const hasResendSecret = has(EMAIL_ENV.apiKey);
  const hasPostmarkSecret = has(POSTMARK_EMAIL_ENV.serverToken) || has("POSTMARK_API_KEY");
  const anyResend = [...names].some((name) => name.startsWith("RESEND_"));
  const anyPostmark = [...names].some((name) => name.startsWith("POSTMARK_"));

  // Check for multiple email provider secrets configured simultaneously
  if (hasResendSecret && hasPostmarkSecret) {
    return {
      status: "FAIL",
      detail: "Multiple email provider secrets are configured: RESEND_API_KEY and POSTMARK_SERVER_TOKEN. A deployment must use exactly one email provider.",
    };
  }

  // Determine provider selection: explicit option > detected prefix / secret > default "resend"
  let provider = options.selectedProvider;
  if (!provider) {
    if (anyPostmark && !anyResend) {
      provider = "postmark";
    } else {
      provider = "resend";
    }
  }

  if (provider === "postmark") {
    const postmarkKey = has(POSTMARK_EMAIL_ENV.serverToken)
      ? POSTMARK_EMAIL_ENV.serverToken
      : has("POSTMARK_API_KEY")
        ? "POSTMARK_API_KEY"
        : null;

    if (!postmarkKey) {
      if (!anyPostmark) {
        return {
          status: "WARN",
          provider: "postmark",
          detail: "no POSTMARK_* on this deployment — email is a no-op, which is a normal pre-launch state. Run `pnpm connect` to configure Postmark when you want it to send.",
        };
      }
      const orphans = [...names].filter((name) => name.startsWith("POSTMARK_"));
      return {
        status: "WARN",
        provider: "postmark",
        detail:
          `${orphans.join(", ")} present but POSTMARK_SERVER_TOKEN is missing — email looks configured and sends nothing. ` +
          "Every verification and notification mail is silently dropped. Finish it with `pnpm secret:set POSTMARK_SERVER_TOKEN` (hidden input, straight into Convex env).",
      };
    }

    if (!testMode) {
      if (!has(POSTMARK_EMAIL_ENV.from)) {
        return {
          status: "CRITICAL",
          provider: "postmark",
          detail: "testMode is OFF and EMAIL_FROM is not set — verify a sending domain in Postmark (DKIM/Return-Path) and set EMAIL_FROM.",
        };
      }
      if (fromDomainIsResendDefault || fromDomainIsDefault) {
        return {
          status: "CRITICAL",
          provider: "postmark",
          detail: "testMode is OFF but EMAIL_FROM is still an unverified default/test domain. Verify your own sending domain in Postmark and set EMAIL_FROM to an address on it.",
        };
      }
    }

    if (!has(POSTMARK_EMAIL_ENV.webhook)) {
      return {
        status: "WARN",
        provider: "postmark",
        detail:
          "POSTMARK_SERVER_TOKEN is set but POSTMARK_WEBHOOK_SECRET is not — sending works, and every bounce, complaint and delivery failure is invisible. `/postmark/webhook` answers 500 until it is set. Add the endpoint in the Postmark dashboard and store its secret.",
      };
    }

    return {
      status: "PASS",
      provider: "postmark",
      detail: testMode
        ? "token, webhook secret and testMode on — Postmark non-production delivery mode active"
        : "token, webhook secret and a verified sending address all present",
    };
  }

  // Resend default inspection
  if (!has(EMAIL_ENV.apiKey)) {
    if (!anyResend) {
      return {
        status: "WARN",
        provider: "resend",
        detail:
          "no RESEND_* on this deployment — email is a no-op, which is a normal pre-launch state. Run `pnpm onboard resend --host <host>` when you want it to send.",
      };
    }
    const orphans = [...names].filter((name) => name.startsWith("RESEND_"));
    return {
      status: "WARN",
      provider: "resend",
      detail:
        `${orphans.join(", ")} present but RESEND_API_KEY is missing — email looks configured and sends nothing. ` +
        "Every verification and notification mail is silently dropped. Finish it with `pnpm secret:set RESEND_API_KEY` (hidden input, straight into Convex env) — Resend issues that key only in its dashboard, so no CLI can mint it.",
    };
  }

  // Below here a key exists, so mail can actually leave.
  if (!testMode) {
    if (!has(EMAIL_ENV.from)) {
      return {
        status: "CRITICAL",
        provider: "resend",
        detail:
          "testMode is OFF and EMAIL_FROM is not set — real mail goes out from Resend's onboarding address, which is not a domain you control and which Resend only accepts in test mode. Verify a sending domain and set EMAIL_FROM.",
      };
    }
    if (fromDomainIsResendDefault || fromDomainIsDefault) {
      return {
        status: "CRITICAL",
        provider: "resend",
        detail:
          "testMode is OFF but EMAIL_FROM is still on resend.dev — that is the onboarding fallback, not a domain you own. Verify your own sending domain in Resend and set EMAIL_FROM to an address on it.",
      };
    }
  }

  if (!has(EMAIL_ENV.webhook)) {
    return {
      status: "WARN",
      provider: "resend",
      detail:
        "RESEND_API_KEY is set but RESEND_WEBHOOK_SECRET is not — sending works, and every bounce, complaint and delivery failure is invisible. `/resend-webhook` answers 500 until it is set. Add the endpoint in the Resend dashboard and store its secret.",
    };
  }

  return {
    status: "PASS",
    provider: "resend",
    detail: testMode
      ? "key, webhook secret and testMode on — only Resend's test inboxes can receive mail"
      : "key, webhook secret and a verified sending address all present",
  };
}
