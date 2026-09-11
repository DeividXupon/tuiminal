import { useMemo } from "react"
import { translateUi } from "../../../../shared/i18n"
import {
  detectGhCapabilities,
  type GhCapabilities,
  loadGhAuthContext,
} from "../../services/github/auth"
import {
  detectGitHubCliInstallPlan,
  type GitHubCliInstallMode,
  type GitHubCliInstallPlan,
} from "../../services/github/installer"
import { GitHubTransportError } from "../../services/github/transport"
import {
  GitHubGuidedTerminalPanel,
  type GitHubGuidedTerminalStarter,
} from "./GitHubGuidedTerminalPanel"

function executableOptions() {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

async function installedGhIsReady() {
  return (await detectGhCapabilities(executableOptions())).supported
}

async function authenticatedGhIsReady(host: string) {
  try {
    await loadGhAuthContext({ host, generation: 0, options: executableOptions() })
    return true
  } catch (error) {
    if (error instanceof GitHubTransportError && error.kind === "not-authenticated") return false
    throw error
  }
}

function installMode(capabilities: GhCapabilities): GitHubCliInstallMode {
  return capabilities.reason === "missing" ? "install" : "upgrade"
}

export function GitHubCliRequirementPanel({
  active,
  capabilities,
  onRetry,
  installPlan,
  startTerminal,
  verifyInstallation = installedGhIsReady,
  pollIntervalMs,
}: {
  active: boolean
  capabilities: GhCapabilities
  onRetry: () => void
  installPlan?: GitHubCliInstallPlan
  startTerminal?: GitHubGuidedTerminalStarter
  verifyInstallation?: () => Promise<boolean>
  pollIntervalMs?: number
}) {
  const mode = installMode(capabilities)
  const plan = useMemo(() => installPlan ?? detectGitHubCliInstallPlan(mode), [installPlan, mode])
  return (
    <GitHubGuidedTerminalPanel
      active={active}
      mode={mode}
      command={plan.displayCommand}
      commandAvailable={plan.available}
      metadata={`${translateUi("Método detectado")}: ${translateUi(plan.manager)}`}
      guideUrl={plan.guideUrl}
      onRetry={onRetry}
      verifyReady={verifyInstallation}
      startTerminal={startTerminal}
      pollIntervalMs={pollIntervalMs}
    />
  )
}

export function GitHubAuthenticationPanel({
  active,
  host,
  onRetry,
  startTerminal,
  verifyAuthentication,
  pollIntervalMs,
}: {
  active: boolean
  host: string
  onRetry: () => void
  startTerminal?: GitHubGuidedTerminalStarter
  verifyAuthentication?: () => Promise<boolean>
  pollIntervalMs?: number
}) {
  return (
    <GitHubGuidedTerminalPanel
      active={active}
      mode="authenticate"
      command={`gh auth login --hostname ${host} --web`}
      commandAvailable
      metadata={`${translateUi("Host do GitHub")}: ${host}`}
      guideUrl="https://cli.github.com/manual/gh_auth_login"
      onRetry={onRetry}
      verifyReady={verifyAuthentication ?? (() => authenticatedGhIsReady(host))}
      startTerminal={startTerminal}
      pollIntervalMs={pollIntervalMs}
    />
  )
}
