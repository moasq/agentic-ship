export function inspectReadmeProviderCatalog({ readme = "", agents = "", providers = {} } = {}) {
  const issues = [];
  const deploymentProviders = Object.entries(providers).filter(([, provider]) => provider.capability === "deployment");
  const unsupportedSection = readme.split("### Not wired yet, and what a swap costs")[1] ?? "";

  for (const [id, provider] of deploymentProviders) {
    const command = `pnpm onboard ${id} --host codex`;
    if (!readme.includes(command)) issues.push(`README is missing the supported ${provider.displayName} onboarding command`);
    if (new RegExp(`^\\|\\s*${provider.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|`, "m").test(unsupportedSection)) {
      issues.push(`README still lists supported provider ${provider.displayName} as not wired`);
    }
  }

  const loginRow = agents.split(/\r?\n/).find((line) => line.includes("pnpm provider:login <cli>")) ?? "";
  for (const [id, provider] of Object.entries(providers)) {
    const runs = provider.agentTool?.automation?.run ?? [];
    if (runs.some((step) => step.command === `pnpm provider:login ${id}`) && !loginRow.includes(id)) {
      issues.push(`AGENTS.md provider:login row is missing ${id}`);
    }
  }

  return { status: issues.length === 0 ? "PASS" : "FAIL", issues };
}
