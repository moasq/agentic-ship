# ShipKit

**Stop paying for Lovable, Bolt, v0 and Replit. Build with the coding subscription you already have.**

```bash
npx github:moasq/create-shipkit my-app
```

That's it. One command, and you have a real Next.js project your coding agent already
knows how to work in.

---

## What this actually is

Hosted app builders don't sell you a smarter AI. They sell you the **setup around it** —
a project that's already configured, a design system, a component library, a database,
payments, a deploy button.

ShipKit is that setup, in a repo you own, that works with Claude Code, Cursor, Codex and
the rest. No credits, no monthly fee, no export button.

Precisely: it is a **plugin and an engine in one repo**. Install it as a plugin and
your agent gains the ten ShipKit skills — the deterministic UI system, the backend
structure, the gates. Scaffold it as a project and you get the wired engine those
skills operate. Not a boilerplate: there is no demo app to delete.

**Honest version:** if you don't already pay for a coding agent, a hosted builder is
probably a better deal. This is for people who do.

---

## Install as a plugin

The same repo is a plugin marketplace for Claude Code **and** Codex — the manifests
(`.claude-plugin/`, `.codex-plugin/`) point at the same ten skills in
`.agents/skills/`, so there is one copy of every rule no matter how it arrives.

In **Claude Code**:

```
/plugin marketplace add moasq/shipkit
/plugin install shipkit@shipkit
```

In **Codex**:

```
/plugin marketplace add moasq/shipkit
/plugin install shipkit@shipkit
```

Every other tool reads the skills as plain markdown straight from the repo — no
install step at all.

---

## Start building

```bash
npx github:moasq/create-shipkit my-app
cd my-app
pnpm dev
```

Type that command exactly, `github:` prefix and all. Plain `npx create-shipkit` is an
unrelated package on npm by someone else — it is not this project.

Open the folder in your coding agent and tell it what you want to build. It reads
`AGENTS.md` on its own and follows the rules in there.

There is **no demo site to delete**. The home page is one paragraph. Nothing is
pre-built for you to tear out.

---

## Five commands worth remembering

| Command | Ask it when you want to know |
| --- | --- |
| `pnpm health` | Is anything wrong? |
| `pnpm onboard` | What do I need to connect next? |
| `pnpm verify` | Is my work actually finished? |
| `pnpm heal` | Can it fix itself? (links, mirrors, lockfile — then proves it) |
| `pnpm preflight` | Am I actually ready to launch? |

`pnpm health` prints a table. Every failure comes with the exact fix, so you never get a
red line without being told what to do about it.

---

## What's already wired

You don't set any of this up. It's connected — you just add your account when you're
ready for that piece.

| You want | It's there | You do |
| --- | --- | --- |
| A website | Next.js 16, React 19, Tailwind, shadcn/ui, MagicUI | nothing |
| A database | Convex | run `npx convex dev` once |
| Sign in / sign up | Better Auth, wired — no screens | connect Convex, set one secret |
| Take payments | Stripe (subscriptions, hosted checkout) | paste your keys |
| Send email | Resend | paste your key |
| See who uses it | PostHog | paste your key |
| Put it online | Render | connect the repo |
| A blog that ranks | MDX + sitemap + metadata | write the article |

Every one of these is the **official** integration, not a homemade version — including
the MCP servers your agent uses to talk to them, declared once in `.mcp.json` for every
tool (Claude Code, Cursor, Codex alike). `pnpm onboard` walks you through them one at a
time and tells you which step needs you.

**Tested, not hoped:** the kit ships its own test gates — unit tests, and a browser
suite that checks every page it ships, every security header, and the SEO surface on a
real production build. CI runs health, lint, unit tests and the build on macOS, Linux
and Windows; the browser suite runs on Linux. And before you launch,
`pnpm preflight --prod` refuses to pass while production still has test payment keys, a
dead email setup, or a test-data backdoor.

The build needs no network — fonts are committed, not fetched — so all of this also
runs on a locked-down server.

---

## Why your site won't look AI-generated

Nearly every AI-built site shares the same four defaults. This one changes all four
before you start:

1. The default grey palette → replaced with a deliberate one
2. Inter, Geist, Space Grotesk, Poppins → banned. Ships with IBM Plex
3. `rounded-lg` on everything → one chosen radius
4. The purple-to-blue gradient → not here

Want a different look? Grab a theme from [tweakcn](https://tweakcn.com), paste it into
`src/app/globals.css`, done. Every component follows automatically.

---

## The part that makes it work

Your agent doesn't guess how this project works. It's written down.

- **`AGENTS.md`** — every rule, in one file. Claude Code, Cursor, Codex, Windsurf,
  Copilot and Gemini CLI all read it.
- **`.agents/skills/`** — step-by-step guides for specific jobs: setting up, picking
  components, writing backend code, security, SEO.
- **One source of truth** — a rule is written in exactly one place. Never two.

So when you say *"add a pricing page"*, your agent already knows which component library
to use, what your colors are, where the file goes, and what not to touch.

---

## Your secrets stay safe

`pnpm health` refuses to pass if a password or API key ends up somewhere it could get
committed to GitHub. That's a hard stop, not a warning.

Security headers are on from the first minute. Payments go through Stripe's own page —
card details never touch your site. Analytics runs through your own domain, so you're
not handing a third party a script tag on every page.

---

## Works with any agent

| Tool | Just works? |
| --- | --- |
| Claude Code | yes — installable plugin, plus an automatic build check |
| Codex | yes — installable plugin |
| Cursor | yes — committed MCP mirror |
| Windsurf, Cline, Copilot, Gemini CLI | yes — AGENTS.md + plain-markdown skills |

Same repo, same rules, one copy of every skill.

---

## How far it gets on its own

Worth being exact about, because "autonomous" gets thrown around loosely.

**Your agent can do all of this with nobody watching** — on your machine, over SSH, on a
server, from your phone: clone, install, self-check, self-repair, build the entire
frontend, write tests, run the production build, run the browser suite, commit. No
account, no key, no network beyond your agent's own. A fresh clone builds green with
nothing connected, and every unconnected service reports "not connected yet" instead of
crashing.

**Five things only you can do**, because each one ends in a browser login: connecting
Convex (`npx convex dev`), creating the Resend account, creating the PostHog project,
connecting Render, and the first OAuth for the vendor MCP servers. `pnpm onboard` marks
these `needs you`, tells you the exact command, and never pretends to have done them.

That line — knowing precisely where its own reach ends — is the point. An agent that
stops and tells you is worth more than one that spins on a login screen for an hour.

---

## Keeping it fresh

```bash
# in your agent
run the upstream-sync skill
```

Checks every tool for new versions, flags anything that would break, and re-runs the
health check to prove nothing broke.

A template is out of date the day you download it. This one knows how to update itself —
you still decide when. Nothing runs on a schedule behind your back.

---

## FAQ

**Do I need to know Next.js?**
No. Your agent does. It's useful when things go wrong, but you don't need it on day one.

**What does it cost to run?**
Nothing until you have users. Convex, Resend, PostHog and Render all have free tiers.
Stripe takes a cut of sales only.

**Can I use my own design?**
Yes. Change `src/app/globals.css` and everything follows.

**Do I have to connect all of it?**
No. Connect what you need, when you need it. Nothing breaks while it's disconnected —
things say "not connected yet" instead of crashing.

**Windows?**
Yes. Every command is Node, tested on Windows, macOS and Linux in CI.

---

MIT. Built by [@moasq](https://github.com/moasq).
