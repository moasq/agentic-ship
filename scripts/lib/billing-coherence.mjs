import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConnectionCatalog } from "./connections/catalog.mjs";

export const BILLING_PROVIDER_ENV = "BILLING_PROVIDER";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function billingCatalog(catalogDirectory) {
  const catalog = loadConnectionCatalog({ projectRoot: moduleRoot, catalogDirectory });
  const providers = Object.fromEntries(
    Object.entries(catalog.providers).filter(([, provider]) => provider.capability === "billing"),
  );
  return { providers, defaultProvider: catalog.defaults.billing };
}

function result(status, detail, provider = null) {
  return { status, detail, provider };
}

function namesForProvider(names, adapter) {
  return [...names].filter((name) => adapter.ownedEnvPrefixes.some((prefix) => name.startsWith(prefix)));
}

function inspectSelectedProvider(names, id, provider) {
  const adapter = provider.billing;
  const owned = namesForProvider(names, adapter);
  const has = (name) => names.has(name);

  if (owned.length === 0) {
    return result("WARN", `${provider.displayName} is selected but billing is not configured.`, id);
  }
  if (!has(adapter.secretEnv)) {
    return result("WARN", `${provider.displayName} billing is off because ${adapter.secretEnv} is missing.`, id);
  }
  if (!has(adapter.webhookEnv)) {
    return result(
      "CRITICAL",
      `${adapter.secretEnv} is set but ${adapter.webhookEnv} is missing. Checkout can take payment without granting entitlement.`,
      id,
    );
  }
  const missing = adapter.requiredEnv.filter((name) => !has(name));
  if (missing.length > 0) return result("FAIL", `${provider.displayName} is missing ${missing.join(", ")}.`, id);

  const mappings = [...names].filter((name) => name.startsWith(adapter.mappingEnvPrefix));
  if (mappings.length === 0) {
    return result("FAIL", `${provider.displayName} has no ${adapter.mappingEnvPrefix}* mapping.`, id);
  }
  return result("PASS", `${provider.displayName} billing configuration is complete.`, id);
}

/**
 * Check billing completeness without reading secret values.
 *
 * Stripe remains the default when BILLING_PROVIDER is absent. Alternative providers
 * must be selected explicitly by the caller.
 */
export function inspectBillingCoherence(envNames, { selectedProvider, catalogDirectory } = {}) {
  const names = new Set(envNames ?? []);
  const { providers, defaultProvider } = billingCatalog(catalogDirectory);
  const selected = selectedProvider || defaultProvider;

  if (!providers[selected]) {
    return result("FAIL", `Unsupported billing provider "${selected}". Expected one of: ${Object.keys(providers).join(", ")}.`);
  }

  const configured = Object.entries(providers).filter(([, provider]) => namesForProvider(names, provider.billing).length > 0);
  const active = configured.filter(([, provider]) => names.has(provider.billing.secretEnv));
  if (active.length > 1) {
    return result("FAIL", `Multiple billing provider secrets are configured: ${active.map(([, provider]) => provider.displayName).join(", ")}.`, selected);
  }

  const foreign = configured.filter(([id]) => id !== selected);
  if (foreign.length > 0) {
    return result(
      "FAIL",
      `${providers[selected].displayName} is selected, but environment names for ${foreign.map(([, provider]) => provider.displayName).join(", ")} are also present.`,
      selected,
    );
  }

  if (configured.length === 0) {
    return result("WARN", "No billing keys are configured. Billing is off, which is valid before launch.", selected);
  }
  return inspectSelectedProvider(names, selected, providers[selected]);
}

function parseEnv(stdout) {
  const values = new Map();
  for (const line of (stdout ?? "").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function productionCheckPasses(check, value) {
  if (check.type === "equals") return value === check.value;
  if (check.type === "matches") return new RegExp(check.pattern).test(value);
  return false;
}

/** Validate production-only values without returning or printing any credential. */
export function inspectProductionBillingEnvironment(stdout, { catalogDirectory } = {}) {
  const values = parseEnv(stdout);
  const { providers, defaultProvider } = billingCatalog(catalogDirectory);
  const selected = values.get(BILLING_PROVIDER_ENV) || defaultProvider;
  const coherence = inspectBillingCoherence(values.keys(), { selectedProvider: selected, catalogDirectory });
  if (coherence.status !== "PASS") return coherence;

  const provider = providers[selected];
  const adapter = provider.billing;
  const required = [adapter.secretEnv, adapter.webhookEnv, ...adapter.requiredEnv];
  const empty = required.filter((name) => !(values.get(name) ?? "").trim());
  const mappings = [...values.entries()].filter(
    ([name, value]) => name.startsWith(adapter.mappingEnvPrefix) && value.trim().length > 0,
  );
  if (empty.length > 0 || mappings.length === 0) {
    return result("FAIL", `${provider.displayName} production billing has empty required values or mappings.`, selected);
  }

  for (const check of adapter.productionChecks) {
    if (!productionCheckPasses(check, values.get(check.env) ?? "")) return result("FAIL", check.message, selected);
  }
  return result("PASS", `${provider.displayName} production billing is live.`, selected);
}

/** Parse `convex env list` output into names. Values are discarded. */
export function envNamesFrom(stdout) {
  return [...parseEnv(stdout).keys()];
}
