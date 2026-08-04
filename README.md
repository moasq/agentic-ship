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

**Honest version:** if you don't already pay for a coding agent, a hosted builder is
probably a better deal. This is for people who do.

---

## Start building

```bash
npx github:moasq/create-shipkit my-app
cd my-app
pnpm dev
```

Open the folder in your coding agent and tell it what you want to build. It reads
`AGENTS.md` on its own and follows the rules in there.

There is **no demo site to delete**. The home page is one paragraph. Nothing is
pre-built for you to tear out.

---

## Three commands worth remembering

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
| Sign in / sign up | Better Auth | paste one secret |
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
suite that checks every page, every security header, and the SEO surface on a real
production build. CI runs all of it on macOS, Linux and Windows. And before you launch,
`pnpm preflight --prod` refuses to pass while production still has test payment keys, a
dead email setup, or a test-data backdoor.

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
| Claude Code | yes — plus plugins and an automatic build check |
| Cursor | yes |
| Codex | yes |
| Windsurf, Cline, Copilot, Gemini CLI | yes |

Same repo, same rules, no per-tool setup.

---

## Keeping it fresh

```bash
# in your agent
run the upstream-sync skill
```

Checks every tool for new versions, flags anything that would break, and re-runs the
health check to prove nothing broke.

A template is out of date the day you download it. This one updates itself.

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
