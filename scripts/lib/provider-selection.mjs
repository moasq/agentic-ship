import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConnectionCatalog } from "./connections/catalog.mjs";

export const PRODUCT_PROVIDER_CAPABILITIES = ["billing", "email", "analytics", "deployment", "tracking"];

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveProviderSelection(selection, { catalogDirectory } = {}) {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new Error("providerSelection must be an object");
  }

  const unexpected = Object.keys(selection).filter((capability) => !PRODUCT_PROVIDER_CAPABILITIES.includes(capability));
  if (unexpected.length > 0) throw new Error(`providerSelection has unsupported capabilities: ${unexpected.join(", ")}`);

  const catalog = loadConnectionCatalog({ projectRoot: moduleRoot, catalogDirectory });
  const resolved = {};
  for (const capability of PRODUCT_PROVIDER_CAPABILITIES) {
    const requested = selection[capability] === undefined ? catalog.defaults[capability] : selection[capability];
    if (requested === null && capability === "tracking") {
      resolved[capability] = null;
      continue;
    }
    const provider = catalog.providers[requested];
    if (!provider || provider.capability !== capability) {
      const supported = Object.entries(catalog.providers)
        .filter(([, candidate]) => candidate.capability === capability)
        .map(([id]) => id);
      throw new Error(`Unsupported ${capability} provider "${requested}". Expected one of: ${supported.join(", ")}`);
    }
    resolved[capability] = requested;
  }
  return resolved;
}
