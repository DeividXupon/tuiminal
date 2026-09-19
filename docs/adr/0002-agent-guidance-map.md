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

The original 13 sections were preserved verbatim during the mechanical split,
apart from updating two maintenance instructions to point to the new ownership.
`bun run check:ai-docs` guards root size, guide size, and local links in CI.

## Consequences

- The root file loads cheaply and directs work to relevant guidance.
- Domain notes are not automatically injected. Agents must follow the map; a task
  that crosses tools may need several notes.
- Current behavior still comes from code and maintained specifications. Agent notes
  are constraints and navigation, not an alternate product spec.
- When a durable rule is established, edit the narrowest owning document and update
  the index or root map only if navigation changes.
