import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { RemoteProjectSyncPreview } from "../model/remote-project-sync"
import type { TerminalSession } from "../model/sessions"
import { AgentFolderBrowser } from "./AgentFolderBrowser"
import { RemoteProjectSyncDialog } from "./RemoteProjectSyncDialog"
import { RemoteProjectSyncPreviewDialog } from "./RemoteProjectSyncPreviewDialog"

export type RemoteProjectSyncFlowState =
  | { kind: "browse"; sessionId: string }
  | { kind: "destination"; sessionId: string; localPath: string }
  | { kind: "preview"; sessionId: string; preview: RemoteProjectSyncPreview }

export function RemoteProjectSyncFlow({
  flow,
  sessions,
  onSelectParent,
  onSync,
  onClose,
}: {
  flow: RemoteProjectSyncFlowState | null
  sessions: readonly TerminalSession[]
  onSelectParent: (session: TerminalSession, parent: string) => void
  onSync: (session: TerminalSession, localPath?: string, preview?: RemoteProjectSyncPreview) => void
  onClose: () => void
}) {
  if (!flow) return null
  const owner = sessions.find((session) => session.id === flow.sessionId)
  if (!owner) return null
  if (flow.kind === "browse")
    return (
      <AgentFolderBrowser
        target={{ kind: "local" }}
        origin={translateUi("Destino da sincronização")}
        onSelect={(parent) => onSelectParent(owner, parent)}
        onClose={onClose}
      />
    )
  if (flow.kind === "destination")
    return (
      <RemoteProjectSyncDialog
        kind="destination"
        localPath={flow.localPath}
        onConfirm={() => onSync(owner, flow.localPath)}
        onClose={onClose}
      />
    )
  return (
    <RemoteProjectSyncPreviewDialog
      preview={flow.preview}
      onConfirm={() => onSync(owner, undefined, flow.preview)}
      onClose={onClose}
    />
  )
}
