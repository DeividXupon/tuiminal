# ADR 0002 — A small agent entry point with domain-owned guidance

Status: accepted on 2026-09-17.

## Context

The former root `AGENTS.md` was 105,768 bytes. It mixed repository-wide rules,
tool-specific contracts, release procedures, and future priorities. Codex's
[documented default project-instruction limit](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
is 32 KiB for the discovered chain, so late sections were not reliably available
as automatically loaded guidance. A single long file also made ownership and
maintenance difficult. The open [AGENTS.md format](https://agents.md/) permits
project-specific guidance, while [GitHub's instructions documentation](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)
distinguishes repository-wide from path-specific instructions.

## Decision

Keep the root `AGENTS.md` as a concise repository map and non-negotiable working
contract. Store task-specific engineering notes under `docs/ai/`, indexed by
`docs/ai/index.md`, and point to maintained design specifications instead of copying
them. Agents read the notes for the areas they touch. We do not create tool-specific
`AGENTS.md` files inside every workspace: many changes cross CLI, core, and feature
boundaries, and guidance in an unrelated directory would not be automatically
discovered for a root-started session.

The initial mechanical split preserved the original 13 sections. On 2026-09-28,
the root and notes had grown to 165,191 bytes, largely through repeated product
contracts and regression narratives. The follow-up revision condenses all agent
notes into task scope, entry points, essential constraints and verification links.
Existing specifications and tests retain detailed behavior; no duplicate archive
is added to the reading path.

Reading is conditional on the task: use the map to choose an area and the relevant
specification section when changing its contract. A prose-only edit does not
require unrelated feature notes. This follows OpenAI's guidance on
[scoped instructions and progressive disclosure](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra).
These are authoring practices, not a universal Markdown size standard.

`bun run check:ai-docs` discovers every Markdown note under `docs/ai/`, checks
required entry points and local link targets, and enforces repository budgets:
3 KiB for the root/map, 8 KiB per note and 48 KiB total. Budgets are ceilings, not
targets; splitting a long note cannot bypass the aggregate limit. File bytes are
a reproducible size measure, not an exact token count or actual context usage.

## Consequences

- The root file loads cheaply and directs work to relevant guidance.
- Domain notes are not automatically injected. Agents must follow the map; a task
  that crosses tools may need several notes.
- Current behavior still comes from code and maintained specifications. Agent notes
  are constraints and navigation, not an alternate product spec.
- When a durable rule is established, edit the narrowest owning document and update
  the index or root map only if navigation changes.
