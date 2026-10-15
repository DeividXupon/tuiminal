import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { RemoteProjectSyncReview, RemoteProjectSyncStatus } from "../model/remote-project-sync"
import type { TerminalSession } from "../model/sessions"
import { AgentFolderBrowser } from "./AgentFolderBrowser"
import { RemoteProjectSyncDialog } from "./RemoteProjectSyncDialog"
import { RemoteProjectSyncPreviewDialog } from "./RemoteProjectSyncPreviewDialog"
import { RemoteProjectSyncProgressDialog } from "./RemoteProjectSyncProgressDialog"

export type RemoteProjectSyncFlowState =
  | { kind: "browse"; sessionId: string }
  | { kind: "destination"; sessionId: string; localPath: string }
  | { kind: "progress"; sessionId: string; localPath: string }
  | { kind: "preview"; sessionId: string; review: RemoteProjectSyncReview }

export function RemoteProjectSyncFlow({
  flow,
  sessions,
  onSelectParent,
  onSync,
  onPage,
  onClose,
  statuses,
  automaticFor,
  onToggleAutomatic,
}: {
  flow: RemoteProjectSyncFlowState | null
  sessions: readonly TerminalSession[]
  onSelectParent: (session: TerminalSession, parent: string) => void
  onSync: (session: TerminalSession, localPath?: string, review?: RemoteProjectSyncReview) => void
  onPage: (session: TerminalSession, offset: number) => void
  onClose: () => void
  statuses: ReadonlyMap<string, RemoteProjectSyncStatus>
  automaticFor: (session: TerminalSession) => boolean
  onToggleAutomatic: (session: TerminalSession) => void
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
  if (flow.kind === "progress")
    return (
      <RemoteProjectSyncProgressDialog
        localPath={flow.localPath}
        status={statuses.get(owner.id)}
        automatic={automaticFor(owner)}
        onToggleAutomatic={() => onToggleAutomatic(owner)}
        onCancel={onClose}
      />
    )
  return (
    <RemoteProjectSyncPreviewDialog
      review={flow.review}
      automatic={automaticFor(owner)}
      onToggleAutomatic={() => onToggleAutomatic(owner)}
      onPage={(offset) => onPage(owner, offset)}
      onConfirm={() => onSync(owner, undefined, flow.review)}
      onClose={onClose}
    />
  )
}
