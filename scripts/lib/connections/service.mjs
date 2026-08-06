import { randomUUID } from "node:crypto";
import { relative, resolve } from "node:path";
import { loadConnectionCatalog } from "./catalog.mjs";
import { runConnectionProbe, runConnectionProbes } from "./probes.mjs";
import { ConnectionStateBusyError, createConnectionStateStore } from "./state-store.mjs";

const ACTIVE_STATES = new Set(["waiting_for_user", "failed_retryable"]);
const CANCELLABLE_STATES = new Set([...ACTIVE_STATES, "blocked_manual"]);

export class ConnectionCommandError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ConnectionCommandError";
    this.code = code;
  }
}

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function summary(action, now) {
  const state = ACTIVE_STATES.has(action.state) && new Date(action.expiresAt).getTime() <= now.getTime() ? "expired" : action.state;
  return {
    actionId: action.actionId,
    provider: action.provider,
    host: action.host,
    state,
    phase: action.phase,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    expiresAt: action.expiresAt,
    verificationAttempts: action.verificationAttempts,
  };
}

function commandFor(command, actionId) {
  return `pnpm --silent connect ${command} ${actionId} --json`;
}

export function createConnectionService({
  projectRoot = process.cwd(),
  catalogDirectory,
  stateDirectory,
  homeDirectory,
  now = () => new Date(),
  idFactory = () => `conn_${randomUUID()}`,
  lockOptions,
} = {}) {
  const root = resolve(projectRoot);
  const catalog = loadConnectionCatalog({ projectRoot: root, catalogDirectory });
  const store = createConnectionStateStore(stateDirectory ?? resolve(root, ".agent-state", "connections"), lockOptions);
  const probeContext = { projectRoot: root, homeDirectory };

  function currentTime() {
    return new Date(now());
  }

  function mutate(operation) {
    try {
      return store.withLock(operation);
    } catch (error) {
      if (error instanceof ConnectionStateBusyError) {
        throw new ConnectionCommandError("connection_busy", error.message);
      }
      throw error;
    }
  }

  function getProvider(id) {
    const provider = catalog.providers[id];
    if (!provider) {
      throw new ConnectionCommandError("unknown_provider", `Unknown provider "${id}". Expected one of: ${Object.keys(catalog.providers).join(", ")}`);
    }
    return provider;
  }

  function getHost(id) {
    const host = catalog.hosts[id];
    if (!host) {
      throw new ConnectionCommandError("unknown_host", `Unknown host "${id}". Expected one of: ${Object.keys(catalog.hosts).join(", ")}`);
    }
    return host;
  }

  function getAction(actionId) {
    const action = store.read(actionId);
    if (!action) throw new ConnectionCommandError("unknown_action", `Connection action "${actionId}" was not found`);
    getProvider(action.provider);
    getHost(action.host);
    return action;
  }

  function addEvent(action, event, at) {
    action.history.push({ event, at: timestamp(at) });
    action.updatedAt = timestamp(at);
  }

  function expireIfNeeded(action, at) {
    if (!ACTIVE_STATES.has(action.state) || new Date(action.expiresAt).getTime() > at.getTime()) return false;
    action.state = "expired";
    action.phase = "complete";
    addEvent(action, "expired", at);
    store.write(action);
    return true;
  }

  function projectVerification(provider) {
    return runConnectionProbes(provider.projectProvisioning.verification.probes, probeContext);
  }

  function agentToolConfiguration(provider) {
    return runConnectionProbe(provider.agentTool.configurationProbe, probeContext);
  }

  function baseResult(type, action, at) {
    return {
      schemaVersion: 1,
      type,
      action: summary(action, at),
    };
  }

  function agentToolInput(action, at) {
    const provider = getProvider(action.provider);
    const host = getHost(action.host);
    const configuration = agentToolConfiguration(provider);
    const hostInstruction = host.authInstructions[provider.agentTool.authFlow].replaceAll("<server>", provider.agentTool.mcpServer);
    return {
      ...baseResult("input_required", action, at),
      inputRequired: {
        requestedFrom: "user",
        kind: provider.agentTool.authFlow === "remote_oauth" ? "browser_authorization" : "provider_login",
        title: `Authorize ${provider.displayName} for ${host.displayName}`,
        consent: {
          question: `Authorize ${provider.displayName} for ${host.displayName} now?`,
          onYes: "The agent runs every listed command on your behalf; a browser opens only where your consent is needed.",
          onNo: `Nothing runs and nothing opens. Cancel the receipt with: ${commandFor("cancel", action.actionId)}`,
        },
        browserUrl: null,
        urlSource: "host_managed",
        agentRuns: provider.agentTool.automation?.run ?? [],
        instructions: [hostInstruction, ...provider.agentTool.instructions, host.readOnlyProbeInstruction],
        configuration,
        sensitiveInputAllowed: false,
        resumeOnlyAfter: "Browser consent has returned and a read-only provider call succeeds.",
        resumeCommand: commandFor("resume", action.actionId),
        cancelCommand: commandFor("cancel", action.actionId),
      },
    };
  }

  function projectInput(action, at, verification, reason = "Project provisioning needs the builder") {
    const provider = getProvider(action.provider);
    const decision = provider.projectProvisioning.automation?.decision ?? null;
    const configuredRuns = provider.projectProvisioning.automation?.run ?? [];
    // When a provider has no runnable CLI step, its own page IS the path — so the
    // opener becomes the step. A `browserUrl` that nobody opens is the friction this
    // process exists to delete: it turns into "go find this page yourself", which is
    // what telling a user to visit a dashboard has always been.
    const agentRuns =
      configuredRuns.length || decision
        ? configuredRuns
        : [
            {
              command: `pnpm open:url ${provider.projectProvisioning.setupUrl}`,
              why: `Open ${provider.displayName}'s setup page in your browser`,
              opensBrowser: true,
            },
          ];
    return {
      ...baseResult("input_required", action, at),
      inputRequired: {
        requestedFrom: "user",
        kind: "project_provisioning",
        title: `Finish ${provider.displayName} project provisioning`,
        reason,
        consent: {
          question: `Set up ${provider.displayName} for this project now?`,
          onYes: `The agent runs every listed command on your behalf and opens ${provider.projectProvisioning.setupUrl} for any dashboard step.`,
          onNo: `Nothing runs and nothing opens. Cancel the receipt with: ${commandFor("cancel", action.actionId)}`,
        },
        // The decision precedes every run: its chosen option's steps execute first, with
        // the user's answers substituted for the declared {placeholder} tokens.
        ...(decision ? { decision } : {}),
        browserUrl: provider.projectProvisioning.setupUrl,
        agentRuns,
        instructions: provider.projectProvisioning.instructions,
        verificationPolicy: provider.projectProvisioning.verification.policy,
        verification,
        sensitiveInputAllowed: false,
        resumeOnlyAfter: "The requested dashboard or CLI work is complete. Do not paste credentials into the resume command.",
        resumeCommand: commandFor("resume", action.actionId),
        cancelCommand: commandFor("cancel", action.actionId),
      },
    };
  }

  function terminalResult(action, at, verification) {
    if (action.state === "ready") {
      return {
        ...baseResult("connection_ready", action, at),
        verification: {
          policy: getProvider(action.provider).projectProvisioning.verification.policy,
          project: verification ?? projectVerification(getProvider(action.provider)),
          agentTool: {
            passed: Boolean(action.agentToolAttestedAt) || action.history.some((entry) => entry.event === "verified_preexisting"),
            basis: action.agentToolAttestedAt
              ? "resume_after_user_consent_and_host_read_only_probe"
              : action.history.some((entry) => entry.event === "verified_preexisting")
                ? "preexisting_local_configuration"
                : "resume_after_user_consent_and_host_read_only_probe",
          },
        },
      };
    }
    if (action.state === "canceled") {
      return {
        ...baseResult("connection_canceled", action, at),
        message: "The local handoff was canceled. No remote access was revoked or changed.",
        revocation: getProvider(action.provider).revocation ?? [],
      };
    }
    if (action.state === "expired") {
      return { ...baseResult("connection_expired", action, at), message: "The handoff expired. Begin a new action; do not reuse an old browser consent URL." };
    }
    if (action.state === "blocked_manual") {
      return {
        ...baseResult("connection_blocked", action, at),
        message: "Verification reached its retry limit. Inspect the failed probes, cancel this receipt, and begin a fresh action after correcting the project state.",
        cancelCommand: commandFor("cancel", action.actionId),
      };
    }
    throw new Error(`Unsupported terminal connection state: ${action.state}`);
  }

  function finalizeReady(action, at, verification, attested) {
    action.state = "ready";
    action.phase = "complete";
    if (attested) action.projectAttestedAt = timestamp(at);
    if (!action.completedPhases.includes("project_provisioning")) action.completedPhases.push("project_provisioning");
    addEvent(action, "connection_ready", at);
    store.write(action);
    return terminalResult(action, at, verification);
  }

  function readyOrStale(action, at) {
    const provider = getProvider(action.provider);
    const verification = projectVerification(provider);
    if (verification.passed) return terminalResult(action, at, verification);

    action.state = "failed_retryable";
    action.phase = "project_provisioning";
    action.verificationAttempts = 0;
    action.projectAttestedAt = null;
    action.completedPhases = action.completedPhases.filter((phase) => phase !== "project_provisioning");
    action.expiresAt = timestamp(new Date(at.getTime() + provider.actionTtlMinutes * 60_000));
    addEvent(action, "project_configuration_drifted", at);
    store.write(action);
    return projectInput(action, at, verification, "A previously ready local prerequisite drifted; restore it and verify again");
  }

  return {
    status() {
      const at = currentTime();
      const actions = store
        .list()
        .map((action) => summary(action, at))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      const providers = Object.entries(catalog.providers).map(([id, provider]) => {
        const project = projectVerification(provider);
        const policy = provider.projectProvisioning.verification.policy;
        return {
          id,
          displayName: provider.displayName,
          revocation: provider.revocation ?? [],
          agentToolConfiguration: agentToolConfiguration(provider),
          projectVerification: {
            policy,
            passed: policy === "machine" && project.passed,
            localPrerequisitesPassed: project.passed,
            results: project.results,
          },
          latestAction: actions.find((action) => action.provider === id) ?? null,
        };
      });
      return {
        schemaVersion: 1,
        type: "connection_status",
        stateDirectory: relative(root, store.directory) || ".",
        supportedHosts: Object.keys(catalog.hosts),
        providers,
        actions,
      };
    },

    begin(providerId, hostId) {
      return mutate(() => {
        const at = currentTime();
        const provider = getProvider(providerId);
        getHost(hostId);
        const prior = store
          .list()
          .filter((action) => action.provider === providerId && action.host === hostId)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

        if (prior && !expireIfNeeded(prior, at)) {
          if (prior.state === "ready") return readyOrStale(prior, at);
          if (prior.state === "blocked_manual") return terminalResult(prior, at);
          if (ACTIVE_STATES.has(prior.state)) {
            return prior.phase === "agent_tool_authorization"
              ? agentToolInput(prior, at)
              : projectInput(prior, at, projectVerification(provider), "An existing connection handoff is still active");
          }
        }

        // Check first, ask second: when every safe local probe already passes there is
        // nothing to redirect to and nothing to consent to — the receipt is born ready
        // and no browser, command, or question ever reaches the user.
        const preexistingConfiguration = agentToolConfiguration(provider);
        const preexistingVerification = projectVerification(provider);
        if (
          preexistingConfiguration.passed &&
          provider.projectProvisioning.verification.policy === "machine" &&
          preexistingVerification.passed
        ) {
          const bornAt = timestamp(at);
          const action = {
            schemaVersion: 1,
            actionId: idFactory(),
            provider: providerId,
            host: hostId,
            state: "ready",
            phase: "complete",
            createdAt: bornAt,
            updatedAt: bornAt,
            expiresAt: timestamp(new Date(at.getTime() + provider.actionTtlMinutes * 60_000)),
            verificationAttempts: 0,
            completedPhases: ["agent_tool_authorization", "project_provisioning"],
            agentToolAttestedAt: null,
            projectAttestedAt: null,
            history: [
              { event: "created", at: bornAt },
              { event: "verified_preexisting", at: bornAt },
            ],
          };
          store.write(action);
          return terminalResult(action, at, preexistingVerification);
        }

        const createdAt = timestamp(at);
        const action = {
          schemaVersion: 1,
          actionId: idFactory(),
          provider: providerId,
          host: hostId,
          state: "waiting_for_user",
          phase: "agent_tool_authorization",
          createdAt,
          updatedAt: createdAt,
          expiresAt: timestamp(new Date(at.getTime() + provider.actionTtlMinutes * 60_000)),
          verificationAttempts: 0,
          completedPhases: [],
          agentToolAttestedAt: null,
          projectAttestedAt: null,
          history: [{ event: "created", at: createdAt }],
        };
        store.write(action);
        return agentToolInput(action, at);
      });
    },

    resume(actionId) {
      return mutate(() => {
        const at = currentTime();
        const action = getAction(actionId);
        const provider = getProvider(action.provider);
        if (expireIfNeeded(action, at)) return terminalResult(action, at);
        if (action.state === "ready") return readyOrStale(action, at);
        if (["canceled", "expired", "blocked_manual"].includes(action.state)) return terminalResult(action, at);

        if (action.phase === "agent_tool_authorization") {
          action.agentToolAttestedAt = timestamp(at);
          action.completedPhases.push("agent_tool_authorization");
          action.phase = "project_provisioning";
          action.state = "waiting_for_user";
          action.expiresAt = timestamp(new Date(at.getTime() + provider.actionTtlMinutes * 60_000));
          addEvent(action, "agent_tool_authorized", at);
          const verification = projectVerification(provider);
          if (provider.projectProvisioning.verification.policy === "machine" && verification.passed) {
            return finalizeReady(action, at, verification, false);
          }
          store.write(action);
          return projectInput(action, at, verification);
        }

        action.state = "verifying";
        action.verificationAttempts += 1;
        addEvent(action, "verification_started", at);
        const verification = projectVerification(provider);
        const attested = provider.projectProvisioning.verification.policy === "probe_and_attestation";
        if (verification.passed) return finalizeReady(action, at, verification, attested);

        if (action.verificationAttempts >= provider.maxVerificationAttempts) {
          action.state = "blocked_manual";
          action.phase = "complete";
          addEvent(action, "verification_blocked", at);
          store.write(action);
          return {
            ...terminalResult(action, at),
            verification,
          };
        }

        action.state = "failed_retryable";
        addEvent(action, "verification_failed", at);
        store.write(action);
        return projectInput(action, at, verification, "Safe local verification did not pass; correct the reported checks and retry");
      });
    },

    cancel(actionId) {
      return mutate(() => {
        const at = currentTime();
        const action = getAction(actionId);
        if (expireIfNeeded(action, at)) return terminalResult(action, at);
        if (action.state === "canceled") return terminalResult(action, at);
        if (!CANCELLABLE_STATES.has(action.state)) {
          return {
            ...terminalResult(action, at),
            message: "This receipt is already complete. Canceling it would not revoke provider access; use the provider or host controls to revoke access explicitly.",
          };
        }
        action.state = "canceled";
        action.phase = "complete";
        addEvent(action, "canceled", at);
        store.write(action);
        return terminalResult(action, at);
      });
    },
  };
}
