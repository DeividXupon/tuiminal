import type {
  RemoteProjectSyncChange,
  RemoteProjectSyncMapping,
  RemoteProjectSyncPhase,
  RemoteProjectSyncReview,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"

export const REMOTE_PROJECT_SYNC_PAGE_SIZE = 200

export type RemoteProjectSyncWorkerRequest =
  | {
      id: string
      kind: "inspect" | "synchronize"
      remote: RemoteCodexTarget
      destination: string
      mapping?: RemoteProjectSyncMapping | undefined
    }
  | { id: string; kind: "page"; offset: number }
  | { id: string; kind: "apply" }
  | { id: string; kind: "cancel" }

export type RemoteProjectSyncWorkerResponse =
  | {
      id: string
      kind: "progress"
      state: "checking" | "syncing" | "cancelling"
      phase?: RemoteProjectSyncPhase | undefined
      progress?: number | undefined
    }
  | { id: string; kind: "review"; review: RemoteProjectSyncReview }
  | { id: string; kind: "page"; offset: number; changes: RemoteProjectSyncChange[] }
  | { id: string; kind: "complete"; mapping: RemoteProjectSyncMapping }
  | { id: string; kind: "cancelled" }
  | {
      id: string
      kind: "error"
      code: "collision" | "local-changes" | "local-race" | "general"
      message: string
    }
