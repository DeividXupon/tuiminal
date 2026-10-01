import type { useRemoteCodexCompatibilityFlow } from "../hooks/use-remote-codex-compatibility-flow"
import { RemoteCodexCompatibilityModal } from "./RemoteCodexCompatibilityModal"

type CompatibilityFlow = ReturnType<typeof useRemoteCodexCompatibilityFlow>

export function RemoteCodexCompatibilityPrompt({ flow }: { flow: CompatibilityFlow }) {
  const remote = flow.prompt?.command.agentLaunch?.remote
  if (!flow.prompt) return null
  return (
    <RemoteCodexCompatibilityModal
      report={flow.prompt.report}
      {...(remote ? { profileName: remote.profile.name } : {})}
      onCancel={flow.cancelPrompt}
      onOpenGuide={flow.openGuide}
    />
  )
}
