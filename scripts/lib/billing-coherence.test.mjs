// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { envNamesFrom, inspectBillingCoherence, inspectProductionBillingEnvironment } from "./billing-coherence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const connectionDirectory = join(repositoryRoot, ".agents", "connections");
const STRIPE_COMPLETE = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO", "SITE_URL"];

function alternativeBillingCatalog(t) {
  const root = mkdtempSync(join(tmpdir(), "billing-adapter-"));
  const directory = join(root, "connections");
  mkdirSync(directory, { recursive: true });
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  const providers = JSON.parse(readFileSync(join(connectionDirectory, "providers.json"), "utf8"));
  providers.providers.fixturepay = structuredClone(providers.providers.stripe);
  Object.assign(providers.providers.fixturepay, {
    displayName: "Fixture Pay",
    defaultForCapability: false,
    billing: {
      ownedEnvPrefixes: ["FIXTURE_PAY_"],
      secretEnv: "FIXTURE_PAY_SECRET",
      webhookEnv: "FIXTURE_PAY_WEBHOOK",
      requiredEnv: ["SITE_URL", "FIXTURE_PAY_MODE"],
      mappingEnvPrefix: "FIXTURE_PAY_PLAN_",
      productionChecks: [
        {
          type: "equals",
          env: "FIXTURE_PAY_MODE",
          value: "live",
          message: "Fixture Pay requires live mode in production.",
        },
      ],
    },
  });
  writeFileSync(join(directory, "providers.json"), JSON.stringify(providers), "utf8");
  writeFileSync(join(directory, "hosts.json"), readFileSync(join(connectionDirectory, "hosts.json")), "utf8");
  return directory;
}

describe("billing coherence", () => {
  test("keeps Stripe as the default and treats no keys as pre-launch", () => {
    expect(inspectBillingCoherence(["SITE_URL"])).toEqual({
      status: "WARN",
      detail: "No billing keys are configured. Billing is off, which is valid before launch.",
      provider: "stripe",
    });
  });

  test("accepts a complete selected provider", () => {
    expect(inspectBillingCoherence(STRIPE_COMPLETE).status).toBe("PASS");
  });

  test("reports the money-losing partial configuration as critical", () => {
    const result = inspectBillingCoherence(["STRIPE_SECRET_KEY", "STRIPE_PRICE_PRO", "SITE_URL"]);
    expect(result.status).toBe("CRITICAL");
    expect(result.detail).toMatch(/take payment without granting entitlement/);
  });

  test("dispatches an alternative adapter without editing coherence code", (t) => {
    const catalogDirectory = alternativeBillingCatalog(t);
    const names = ["FIXTURE_PAY_SECRET", "FIXTURE_PAY_WEBHOOK", "FIXTURE_PAY_MODE", "FIXTURE_PAY_PLAN_PRO", "SITE_URL"];
    expect(inspectBillingCoherence(names, { selectedProvider: "fixturepay", catalogDirectory }).status).toBe("PASS");
  });

  test("rejects foreign provider names and multiple active secrets", (t) => {
    const catalogDirectory = alternativeBillingCatalog(t);
    const names = [...STRIPE_COMPLETE, "FIXTURE_PAY_SECRET", "FIXTURE_PAY_WEBHOOK", "FIXTURE_PAY_PLAN_PRO"];
    const result = inspectBillingCoherence(names, { selectedProvider: "stripe", catalogDirectory });
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/Multiple billing provider secrets/);
  });

  test("rejects an unsupported provider with an actionable list", () => {
    const result = inspectBillingCoherence(STRIPE_COMPLETE, { selectedProvider: "unknown" });
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/Expected one of: stripe/);
  });
});

describe("production billing", () => {
  test("preserves Stripe live-mode behavior when selection is omitted", () => {
    const env = [
      "STRIPE_SECRET_KEY=sk_live_private",
      "STRIPE_WEBHOOK_SECRET=whsec_private",
      "STRIPE_PRICE_PRO=price_private",
      "SITE_URL=https://example.com",
      "",
    ].join("\n");
    expect(inspectProductionBillingEnvironment(env)).toEqual({
      status: "PASS",
      detail: "Stripe production billing is live.",
      provider: "stripe",
    });
  });

  test("rejects Stripe test keys without exposing their value", () => {
    const env = [
      "STRIPE_SECRET_KEY=sk_test_do_not_print",
      "STRIPE_WEBHOOK_SECRET=whsec_do_not_print",
      "STRIPE_PRICE_PRO=price_do_not_print",
      "SITE_URL=https://example.com",
      "",
    ].join("\n");
    const result = inspectProductionBillingEnvironment(env);
    expect(result.status).toBe("FAIL");
    expect(result.detail).toMatch(/live secret key/);
    expect(JSON.stringify(result)).not.toMatch(/do_not_print/);
  });

  test("runs provider-owned production checks for alternatives", (t) => {
    const catalogDirectory = alternativeBillingCatalog(t);
    const base = [
      "BILLING_PROVIDER=fixturepay",
      "FIXTURE_PAY_SECRET=private",
      "FIXTURE_PAY_WEBHOOK=private",
      "FIXTURE_PAY_PLAN_PRO=private",
      "SITE_URL=https://example.com",
    ];
    expect(inspectProductionBillingEnvironment([...base, "FIXTURE_PAY_MODE=test"].join("\n"), { catalogDirectory }).status).toBe("FAIL");
    expect(inspectProductionBillingEnvironment([...base, "FIXTURE_PAY_MODE=live"].join("\n"), { catalogDirectory }).status).toBe("PASS");
  });

  test("rejects empty required values", () => {
    const env = "STRIPE_SECRET_KEY=\nSTRIPE_WEBHOOK_SECRET=\nSTRIPE_PRICE_PRO=\nSITE_URL=\n";
    expect(inspectProductionBillingEnvironment(env).status).toBe("FAIL");
  });
});

describe("environment parsing", () => {
  test("keeps names and discards values", () => {
    const names = envNamesFrom("STRIPE_SECRET_KEY=sk_test_dont_leak_me\nSITE_URL=http://x\n");
    expect(names).toEqual(["STRIPE_SECRET_KEY", "SITE_URL"]);
    expect(names.join()).not.toMatch(/dont_leak_me/);
  });
});
