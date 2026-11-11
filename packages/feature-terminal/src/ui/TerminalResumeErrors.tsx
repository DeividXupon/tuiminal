import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { AgentResumeSource, AgentResumeTab } from "../model/agent-resume-thread"

const PROVIDERS = { codex: "Codex", claude: "Claude", opencode: "OpenCode" } as const

export function TerminalResumeErrors({
  sources,
  activeTab,
}: {
  sources: readonly AgentResumeSource[]
  activeTab: AgentResumeTab
}) {
  const visible = sources.filter(
    (source) => activeTab === "global" || source.startsWith(`${activeTab}:`),
  )
  if (!visible.length) return null
  const labels = visible.map((source) => {
    const [provider, origin] = source.split(":") as [keyof typeof PROVIDERS, "local" | "remote"]
    return `${PROVIDERS[provider]} · ${translateUi(origin === "local" ? "Local" : "Remoto")}`
  })
  return (
    <text
      id="terminal-resume-errors"
      content={`${translateUi("Falha ao carregar agentes. Pesquise novamente.")} ${labels.join(", ")}`}
      style={{ flexShrink: 0, fg: COLORS.warning }}
    />
  )
}
