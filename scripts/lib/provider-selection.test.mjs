// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { PRODUCT_PROVIDER_CAPABILITIES, resolveProviderSelection } from "./provider-selection.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const connectionDirectory = join(repositoryRoot, ".agents", "connections");

function catalogWithAlternatives(t) {
  const root = mkdtempSync(join(tmpdir(), "provider-selection-"));
  const directory = join(root, "connections");
  mkdirSync(directory, { recursive: true });
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  const document = JSON.parse(readFileSync(join(connectionDirectory, "providers.json"), "utf8"));
  const alternatives = {};
  for (const capability of PRODUCT_PROVIDER_CAPABILITIES) {
    const [sourceId, source] = Object.entries(document.providers).find(
      ([, provider]) => provider.capability === capability && provider.defaultForCapability,
    );
    const id = `fixture-${capability}`;
    const provider = structuredClone(source);
    provider.displayName = `Fixture ${capability}`;
    provider.defaultForCapability = false;
    if (capability === "billing") {
      provider.billing = {
        ownedEnvPrefixes: ["FIXTURE_BILLING_"],
        secretEnv: "FIXTURE_BILLING_SECRET",
        webhookEnv: "FIXTURE_BILLING_WEBHOOK",
        requiredEnv: ["SITE_URL"],
        mappingEnvPrefix: "FIXTURE_BILLING_PLAN_",
        productionChecks: [
          {
            type: "equals",
            env: "FIXTURE_BILLING_MODE",
            value: "live",
            message: "Fixture billing requires live mode.",
          },
        ],
      };
    }
    document.providers[id] = provider;
    alternatives[capability] = id;
    expect(sourceId).toBeTruthy();
  }
  writeFileSync(join(directory, "providers.json"), JSON.stringify(document), "utf8");
  writeFileSync(join(directory, "hosts.json"), readFileSync(join(connectionDirectory, "hosts.json")), "utf8");
  return { directory, alternatives };
}

test("provider selection resolves the declared defaults", () => {
  expect(resolveProviderSelection({})).toEqual({
    billing: "stripe",
    email: "resend",
    analytics: "posthog",
    deployment: "netlify",
    tracking: "linear",
  });
});

test("every capability accepts an alternative through the same contract", (t) => {
  const { directory, alternatives } = catalogWithAlternatives(t);
  expect(resolveProviderSelection(alternatives, { catalogDirectory: directory })).toEqual(alternatives);
});

test("tracking may be disabled without weakening the other selections", () => {
  expect(resolveProviderSelection({ tracking: null })).toEqual({
    billing: "stripe",
    email: "resend",
    analytics: "posthog",
    deployment: "netlify",
    tracking: null,
  });
});

test("a provider cannot be selected for the wrong capability", () => {
  expect(() => resolveProviderSelection({ billing: "resend" })).toThrow(/Unsupported billing provider/);
});

test("the product brief requires the versioned provider selection", () => {
  const schema = JSON.parse(readFileSync(join(repositoryRoot, ".agents", "contracts", "product-brief.schema.json"), "utf8"));
  expect(schema.properties.schemaVersion.const).toBe(2);
  expect(schema.required).toContain("providerSelection");
  expect(schema.properties.providerSelection.$ref).toBe("provider-selection.schema.json");
});
