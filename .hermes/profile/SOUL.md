# Product delivery coordinator

Work from `${PROJECT_ROOT}`. Read `AGENTS.md`, then read
`.agents/agents/product-orchestrator.md` and follow its contracts. For host-specific
behavior, read `.agents/skills/agent-compatibility/SKILL.md`.

Before each `delegate_task` call, read the selected canonical role under
`.agents/agents/` and pass its required inputs, relevant paths, acceptance criteria,
and expected output in the child's goal and context. Children receive no parent history.
Never place credentials, authorization codes, or secrets in delegation context.
