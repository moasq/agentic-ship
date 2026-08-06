# Host mark credits

Brand marks used in `README.md` to show which AI coding hosts this repository supports.
Same rule as `public/images/credits.md`: one line per asset — file, source, licence —
even where attribution is not required.

All five come from one set so the row reads as a single system, and all are vendored
rather than hotlinked so the README renders with no third-party request.

| File | Mark | Source | Licence |
| --- | --- | --- | --- |
| `claude-code-{light,dark}.svg` | Claude Code | [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons) `claudecode` | MIT |
| `codex-{light,dark}.svg` | Codex | same set, `codex` | MIT |
| `cursor-{light,dark}.svg` | Cursor | same set, `cursor` | MIT |
| `hermes-{light,dark}.svg` | Hermes Agent — vendor mark, [Nous Research](https://github.com/NousResearch/hermes-agent) | same set, `nousresearch` | MIT |
| `openclaw-{light,dark}.svg` | OpenClaw | same set, `openclaw` | MIT |

The set is MIT-licensed; each brand remains the trademark of its owner and appears here
only to identify a supported host.

## The only edit made

Upstream ships one file per mark filled with `currentColor`. GitHub renders a README
image with nothing to inherit from, so `currentColor` resolves to black and the mark
disappears in dark mode. Each file is therefore byte-identical to upstream except
`currentColor`, replaced with `#1f2328` in the `-light` variant and `#e6edf3` in the
`-dark` variant, and the README selects between them with `<picture>`.

There is no `hermes` mark in the set, and the `hermes` slug in other icon sets belongs
to Meta's JavaScript engine, which is a different product. The Nous Research mark
identifies the vendor of Hermes Agent instead.

Refreshing a mark: re-fetch
`https://unpkg.com/@lobehub/icons-static-svg@latest/icons/<slug>.svg`, confirm it
contains no `<script>`, event handler, or external reference, then apply the same two
fill substitutions.
