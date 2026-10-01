import type { AgentProfile } from "./agent-state"

export type AgentProviderId = "codex" | "claude" | "opencode"

export type AgentProviderCapability =
  | "local-launch"
  | "remote-launch"
  | "resume"
  | "structured-activity"
  | "message-history"
  | "project-sync"

export type AgentProviderDefinition = {
  id: AgentProviderId
  label: string
  profile: AgentProfile
  availability: "available" | "coming-soon"
  capabilities: readonly AgentProviderCapability[]
}

export const AGENT_PROVIDERS = [
  {
    id: "codex",
    label: "Codex",
    profile: "codex",
    availability: "available",
    capabilities: [
      "local-launch",
      "remote-launch",
      "resume",
      "structured-activity",
      "message-history",
      "project-sync",
    ],
  },
  {
    id: "claude",
    label: "Claude Code",
    profile: "claude",
    availability: "available",
    capabilities: [
      "local-launch",
      "remote-launch",
      "resume",
      "structured-activity",
      "message-history",
      "project-sync",
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    profile: "opencode",
    availability: "available",
    capabilities: [
      "local-launch",
      "remote-launch",
      "resume",
      "structured-activity",
      "message-history",
      "project-sync",
    ],
  },
] as const satisfies readonly AgentProviderDefinition[]

const providers = new Map<AgentProviderId, AgentProviderDefinition>(
  AGENT_PROVIDERS.map((provider) => [provider.id, provider]),
)

export function agentProvider(id: AgentProviderId) {
  return providers.get(id)!
}

export function isAgentProviderId(value: unknown): value is AgentProviderId {
  return typeof value === "string" && providers.has(value as AgentProviderId)
}

export function agentProviderHasCapability(
  id: AgentProviderId,
  capability: AgentProviderCapability,
) {
  return agentProvider(id).capabilities.includes(capability)
}
