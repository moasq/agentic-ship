# Stack mark credits

Brand marks used in `README.md` and `docs/stack.md` to identify the layers of the
agentic development stack. Same rule as `.github/assets/hosts/credits.md`: one line per
asset — file, source, licence — even where attribution is not required.

All seventeen come from one set, [Simple Icons](https://github.com/simple-icons/simple-icons)
(`simple-icons` on npm), so the tables read as a single system, and all are vendored
rather than hotlinked so the pages render with no third-party request.

| File | Mark | Slug | Licence |
| --- | --- | --- | --- |
| `nodedotjs-{light,dark}.svg` | Node.js | `nodedotjs` | CC0-1.0 |
| `pnpm-{light,dark}.svg` | pnpm | `pnpm` | CC0-1.0 |
| `typescript-{light,dark}.svg` | TypeScript | `typescript` | CC0-1.0 |
| `nextdotjs-{light,dark}.svg` | Next.js | `nextdotjs` | CC0-1.0 |
| `react-{light,dark}.svg` | React | `react` | CC0-1.0 |
| `tailwindcss-{light,dark}.svg` | Tailwind CSS | `tailwindcss` | CC0-1.0 |
| `shadcnui-{light,dark}.svg` | shadcn/ui | `shadcnui` | CC0-1.0 |
| `lucide-{light,dark}.svg` | Lucide | `lucide` | CC0-1.0 |
| `convex-{light,dark}.svg` | Convex | `convex` | CC0-1.0 |
| `betterauth-{light,dark}.svg` | Better Auth | `betterauth` | CC0-1.0 |
| `stripe-{light,dark}.svg` | Stripe | `stripe` | CC0-1.0 |
| `resend-{light,dark}.svg` | Resend | `resend` | CC0-1.0 |
| `posthog-{light,dark}.svg` | PostHog | `posthog` | CC0-1.0 |
| `netlify-{light,dark}.svg` | Netlify | `netlify` | CC0-1.0 |
| `github-{light,dark}.svg` | GitHub | `github` | CC0-1.0 |
| `linear-{light,dark}.svg` | Linear | `linear` | CC0-1.0 |
| `vitest-{light,dark}.svg` | Vitest | `vitest` | CC0-1.0 |

The set is CC0-licensed; each brand remains the trademark of its owner and appears here
only to identify a layer of the supported stack. Zustand and Playwright have no mark in
the set, so their rows stay text-only rather than borrowing a look-alike.

## The only edit made

Upstream ships one monochrome file per mark with no `fill` attribute, which resolves to
black wherever it renders. Each file here is byte-identical to upstream except for one
added attribute on the `<svg>` element: `fill="#1f2328"` in the `-light` variant and
`fill="#e6edf3"` in the `-dark` variant — the same pair the host marks use — and the
tables select between them with `<picture>`.

Refreshing a mark: re-fetch
`https://unpkg.com/simple-icons@latest/icons/<slug>.svg`, confirm it contains no
`<script>`, event handler, or external reference, then apply the same fill addition to
each variant.
