import type {
  TerminalMasterKey,
  TerminalRemoteCodexProfile,
} from "@xupon/tuiminal-core/settings/theme"
import type { FreeTerminalCommand } from "../model/sessions"
import { createCodexAgentCommand, createRemoteCodexAgentCommand } from "../services/terminal"
import { AgentDirectoryDialog } from "./AgentDirectoryDialog"
import { TerminalLocationDialog } from "./TerminalLocationDialog"

export type AgentLaunchStep =
  | { kind: "location"; profile: TerminalRemoteCodexProfile }
  | { kind: "directory"; target: { kind: "local" } }
  | {
      kind: "directory"
      target: { kind: "remote"; profile: TerminalRemoteCodexProfile }
    }

export function AgentLaunchDialog({
  step,
  masterKey,
  onStepChange,
  onLaunch,
  onClose,
}: {
  step: AgentLaunchStep
  masterKey: TerminalMasterKey
  onStepChange: (step: AgentLaunchStep | null) => void
  onLaunch: (command: FreeTerminalCommand) => void
  onClose: () => void
}) {
  const close = () => {
    onStepChange(null)
    onClose()
  }
  if (step.kind === "location")
    return (
      <TerminalLocationDialog
        profile={step.profile}
        onLocal={() => onStepChange({ kind: "directory", target: { kind: "local" } })}
        onRemote={() =>
          onStepChange({
            kind: "directory",
            target: { kind: "remote", profile: step.profile },
          })
        }
        onClose={close}
      />
    )

  return (
    <AgentDirectoryDialog
      {...(step.target.kind === "remote" ? { profile: step.target.profile } : {})}
      masterKey={masterKey}
      onConfirm={(workingDirectory) => {
        onStepChange(null)
        onLaunch(
          step.target.kind === "remote"
            ? createRemoteCodexAgentCommand({
                profile: step.target.profile,
                workingDirectory,
              })
            : createCodexAgentCommand(undefined, workingDirectory),
        )
      }}
      onClose={close}
    />
  )
}
