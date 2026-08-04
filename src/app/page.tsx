import { CostTable } from "@/components/blocks/cost-table";
import { Hero } from "@/components/blocks/hero";
import { SkillGrid } from "@/components/blocks/skill-grid";

// Routes stay thin: data lives here, blocks take props.
const skills = [
  {
    name: "setup-health",
    useWhen:
      "After install, after changing .mcp.json, or when generation starts misbehaving. Every failure comes with a fallback.",
  },
  {
    name: "ui-system",
    useWhen:
      "Starting a project, changing the theme, or when the UI starts looking like every other AI-built site.",
  },
  {
    name: "component-picker",
    useWhen:
      "Before adding any interface. shadcn for structure, MagicUI for motion, 21st.dev for marketing sections.",
  },
  {
    name: "asset-pipeline",
    useWhen:
      "Adding images, illustrations, icons or 3D. One treatment across every asset is what reads as a brand.",
  },
  {
    name: "frontend-security",
    useWhen:
      "Before shipping, after adding dependencies, after pasting code from a registry or the web.",
  },
  {
    name: "seo-blog",
    useWhen:
      "Writing an article or auditing a page's search surface. Native MDX, no CMS to keep alive.",
  },
  {
    name: "upstream-sync",
    useWhen:
      "Monthly, or when a tool ships a major version. This is what keeps the bundle from going stale.",
  },
];

const costRows = [
  { tool: "Project scaffold", replacedBy: "this repo + setup-health" },
  { tool: "Design harness", replacedBy: "ui-system + tokens in globals.css" },
  {
    tool: "Component generation",
    replacedBy: "component-picker + shadcn/MagicUI MCP",
  },
  { tool: "Deploy button", replacedBy: "your own host, your own repo" },
  {
    tool: "Credit meter",
    replacedBy: "the coding subscription you already pay for",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <Hero
        eyebrow="Frontend bundle · v0.1"
        title="The foundation your coding agent already knows how to use."
        description="An agent-ready Next.js repo: design tokens that stop the generated look, component rules, security headers on by default, and seven skills that keep themselves up to date."
        primaryCta={{ label: "Read the setup", href: "#skills" }}
        secondaryCta={{
          label: "View on GitHub",
          href: "https://github.com/moasq/shipkit",
        }}
      />
      <div id="skills">
        <SkillGrid
          title="Seven skills, one source of truth"
          description="Instructions live in AGENTS.md. Procedures live in .agents/skills/. Tool wiring lives in .mcp.json. Three kinds of file, three jobs, no overlap."
          skills={skills}
        />
      </div>
      <CostTable
        title="What the hosted builders actually sell"
        description="Not the model — the harness around it. Scaffold, design system, component library, deploy. Build that harness once and the monthly credit meter goes away."
        rows={costRows}
        footnote="Honest version: if you do not already pay for a coding agent, a hosted builder is probably the better deal. This bundle is for people who do."
      />
    </main>
  );
}
