import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { AgentProviderId } from "../model/agent-provider"

export function AgentProviderWordmark({
  providerId,
  label,
  fallbackColor = COLORS.text,
}: {
  providerId: AgentProviderId | null
  label: string
  fallbackColor?: string
}) {
  if (providerId === "opencode") {
    return (
      <>
        <span fg={COLORS.muted} bg={COLORS.panelAlt}>
          {label.slice(0, 4)}
        </span>
        <span fg={COLORS.text} bg={COLORS.panelAlt}>
          {label.slice(4)}
        </span>
      </>
    )
  }
  if (providerId === "codex")
    return (
      <span fg={COLORS.muted} bg={COLORS.panelAlt}>
        {label}
      </span>
    )
  if (providerId === "claude")
    return (
      <span fg={COLORS.http} bg={COLORS.databaseEditedBg}>
        {label}
      </span>
    )
  return <span fg={fallbackColor}>{label}</span>
}
