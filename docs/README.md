# Agentic Ship wiki

This directory is the toolkit's wiki: one article per question, with the direct answer
in the first paragraph. Start with the stack if you are evaluating, getting started if
you are adopting, and tracking if you are already building and want to watch the work
move.

## Articles

- [What is the Agentic Ship stack?](stack.md): every layer of the agentic development
  stack and the reasoning behind each pick.
- [How do I go from empty folder to shipped product?](getting-started.md): install,
  verify, connect, build, and go live.
- [How is the toolkit put together?](architecture.md): the one-rule-one-home design,
  the generated adapters, and the provenance lockfile.
- [How do service connections work?](connections.md): consent-gated, receipt-backed,
  revocable connections to Convex, Stripe, GitHub, Linear, Resend, PostHog,
  Netlify, Vercel, and Cloudflare.
- [How do I see what the agents are doing?](tracking.md): the durable work queue, the
  Linear mirror, and the GitHub delivery seam.
- [How are these docs written?](writing.md): the vendored writing skills and the gate
  that keeps documentation honest.

## Reference material

The wiki explains; these files govern:

- [AGENTS.md](../AGENTS.md): every rule, declared once.
- [.agents/skills/](../.agents/skills): the procedures those rules bind.
- [.agents/agents/](../.agents/agents): the specialist role briefs.
- [skills.lock.json](../skills.lock.json): provenance for everything vendored, pinned,
  or declined.

Every article here is bound by the documentation rules in AGENTS.md. Prose follows the
`writing-guidelines` skill, and finished text gets a `humanizer` pass. If an article
promises a command that does not exist, `pnpm check:commands` fails the build.
