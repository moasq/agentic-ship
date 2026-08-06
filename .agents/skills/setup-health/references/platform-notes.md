# Platform notes — macOS, Linux, Windows

Reference for the setup-health skill. Read this before writing any command into a skill,
a README, or a chat reply.

## The rule

**Node is the only runtime ShipKit assumes.** Every ShipKit operation is a Node script
behind a `pnpm` name. No shell builtins, no Unix binaries, no `$(...)`, in any script,
skill or doc.

A buyer on Windows must be able to run every published command without WSL, Git Bash,
or admin rights. A bundle that half-works on a third of machines is not a bundle.

| Do not write | Write | Why |
| --- | --- | --- |
| `cp .env.example .env.local` | `pnpm setup:env` | no `cp` in cmd/PowerShell |
| `cp .mcp.json .cursor/mcp.json` | `pnpm sync:mcp` | same, and this one must stay byte-identical |
| `ln -s ../.agents/skills .claude/skills` | `pnpm link:skills` | Windows symlinks need elevation; junctions do not |
| `readlink .claude/skills` | `pnpm link:skills --check` | no `readlink` on Windows |
| `openssl rand -base64 32` | `pnpm secret` | no OpenSSL on a stock Windows box |
| `X=$(cmd)` | print, then paste | no command substitution in cmd/PowerShell |
| `grep -r "process.env" src/` | `pnpm health` | no `grep`; also `findstr` has different syntax and regex |
| `rm -rf`, `mkdir -p`, `chmod` | a Node script in `scripts/` | none of them exist in cmd |

`node`, `npx`, `pnpm`, `git` and the Convex CLI are the same everywhere. Those are safe
to write literally.

`&&` between commands is safe in a `package.json` script — both `sh` and `cmd.exe`
accept it. `||`, `$(...)`, single quotes, and `2>/dev/null` are not — cmd.exe treats
single quotes as literal characters. Scope of this rule: commands that must run on the
**buyer's own shell** (package.json scripts, commands you print for them to run).
A command executed inside a known Linux container is exempt — `render.yaml`'s
`npx convex deploy --cmd 'pnpm build'` is the sanctioned example: Render builds run in
bash, so the quotes are correct there and AGENTS.md mandates that exact line.

## Why `.claude/skills` is generated, not just committed

It is committed as a symlink (git mode `120000`), which is correct on macOS and Linux.
On Windows, git falls back to `core.symlinks=false` when it cannot create links, and then
**writes a plain text file whose contents are the path** — `../.agents/skills`. No error,
no warning. Claude Code finds a file where a directory should be and the skills silently
vanish, while `AGENTS.md` still claims they exist.

`scripts/link-skills.mjs` detects exactly that stub and repairs it. It runs on
`postinstall`, so `pnpm install` fixes it before anyone notices, and `pnpm health` fails
loudly if it is ever wrong again.

Repair order:

1. **Windows → directory junction** (`fs.symlink(target, path, "junction")`). Junctions
   need an absolute target and, unlike POSIX symlinks, **no Developer Mode and no admin**.
2. **macOS / Linux → relative symlink.**
3. **Neither possible → a copy**, plus a `.claude/.skills-is-a-copy` marker. This breaks
   the single source of truth, so it is reported as WARN every run until fixed. Edit
   `.agents/skills` and re-run `pnpm link:skills`.

## Windows: MCP servers that never start

Some MCP clients on Windows cannot execute `npx` directly — it is `npx.cmd`, and a bare
`CreateProcess` call misses it. The server appears in the config and simply never
connects.

If that happens, wrap the launcher in `.mcp.json`:

```jsonc
"shadcn": {
  "command": "cmd",
  "args": ["/c", "npx", "-y", "shadcn@latest", "mcp"]
}
```

Then run `pnpm sync:mcp` so `.cursor/mcp.json` stays identical. Do **not** commit the
Windows form to the shared repo — the `cmd` launcher does not exist on macOS or Linux.
Keep it local, or gate it behind your own fork. `pnpm health` prints this reminder on
`win32` automatically.

## Case sensitivity

macOS and Windows filesystems are case-insensitive; Linux is not. `import Button from
"./button"` against a file named `Button.tsx` builds fine on a laptop and fails on a
Linux build host. Match the case of the file exactly, always.

## Line endings

`.gitattributes` sets `eol=lf` for text files. Without it, Windows checkouts get CRLF,
which changes file bytes and would make the `.cursor/mcp.json` byte-comparison fail for
no real reason.

## WSL

WSL works, with one trap: run the repo from the **Linux** filesystem (`~/code/...`), not
from `/mnt/c/...`. Cross-filesystem file watching is slow and unreliable, which shows up
as a dev server that does not hot-reload rather than as an obvious error.

## What still needs a human

Same on every platform: `npx convex login` and `npx convex dev` open a browser. Say so
and wait. Do not retry silently.
