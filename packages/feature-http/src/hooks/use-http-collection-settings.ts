import { useEffect, useRef, useState, type RefObject } from "react"
import { useRenderer } from "@opentui/react"
import type { HttpWorkspaceState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import {
  emptyCollectionSettings,
  type HttpCollectionSettingsData,
  type HttpCollectionSettingsTarget,
  type HttpCollectionSettingsDocument,
} from "../model/collection-settings"
import type { LivePostmanSession } from "../postman/live-session"
import { postmanCollectionSettings } from "../postman/collection-settings"

export function useHttpCollectionSettings({
  state,
  stateRef,
  dispatch,
  session,
}: {
  state: HttpWorkspaceState
  stateRef: RefObject<HttpWorkspaceState>
  dispatch: (action: HttpWorkspaceAction) => void
  session: LivePostmanSession | null
}) {
  const renderer = useRenderer()
  const owner = useRef(session)
  const alive = useRef(true)
  const reads = useRef(new Map<string, number>())
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    owner.current = session
    alive.current = true
    dispatch({ type: "clear-collection-settings" })
    setPending(null)
    return () => {
      alive.current = false
      reads.current.clear()
    }
  }, [session, dispatch])
  const current = (id: string) =>
    alive.current && owner.current === session
      ? stateRef.current.collectionDocuments.find((doc) => doc.id === id)
      : undefined
  const update = (id: string, patch: Partial<HttpCollectionSettingsDocument>) =>
    dispatch({ type: "update-collection-settings", id, patch })
  const select = (id: string) => {
    renderer.currentFocusedRenderable?.blur()
    dispatch({ type: "select-document", documentId: id })
    dispatch({ type: "select-pane", pane: "request" })
    dispatch({ type: "close-navigation" })
  }
  async function load(id: string) {
    const doc = current(id)
    if (!session || !doc || doc.busy || doc.revision !== doc.savedRevision) return
    const token = (reads.current.get(id) ?? 0) + 1
    reads.current.set(id, token)
    update(id, { loading: true, error: "" })
    try {
      const result = await postmanCollectionSettings(session).read(doc.target)
      if (current(id) && reads.current.get(id) === token) update(id, { ...result, loading: false })
    } catch (error) {
      if (current(id) && reads.current.get(id) === token)
        update(id, {
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }
  function open(target: HttpCollectionSettingsTarget) {
    if (!session) return
    const id = `collection-settings:${session.workspaceId}:${target.id}`
    if (current(id)) return select(id)
    renderer.currentFocusedRenderable?.blur()
    dispatch({
      type: "open-collection-settings",
      document: {
        ...emptyCollectionSettings(Boolean(target.folderId)),
        id,
        target,
        tab: "authorization",
        baseline: "",
        revision: 0,
        savedRevision: 0,
        loading: true,
      },
    })
    void load(id)
  }
  function edit(id: string, patch: Partial<HttpCollectionSettingsData>) {
    const doc = current(id)
    if (!doc || doc.loading || !doc.baseline) return
    if (
      Object.entries(patch).every(
        ([key, value]) =>
          JSON.stringify(doc[key as keyof HttpCollectionSettingsData]) === JSON.stringify(value),
      )
    )
      return
    update(id, { ...patch, revision: doc.revision + 1 })
  }
  async function save(id: string) {
    const doc = current(id)
    if (
      !session ||
      !doc ||
      doc.busy ||
      doc.loading ||
      !doc.baseline ||
      doc.revision === doc.savedRevision
    )
      return
    update(id, { busy: true, error: "" })
    try {
      const result = await postmanCollectionSettings(session).save(doc)
      const latest = current(id)
      if (!latest) return
      update(id, {
        ...(latest.revision === doc.revision ? result : { baseline: result.baseline }),
        savedRevision: doc.revision,
        busy: false,
      })
    } catch (error) {
      if (current(id))
        update(id, { busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  function close(id: string, discard = false) {
    const doc = current(id)
    if (!doc) return false
    if (doc.busy) return true
    if (!discard && doc.revision !== doc.savedRevision) {
      setPending(id)
      return true
    }
    reads.current.set(id, (reads.current.get(id) ?? 0) + 1)
    renderer.currentFocusedRenderable?.blur()
    dispatch({ type: "close-collection-settings", id })
    return true
  }
  return {
    active: state.collectionDocuments.find((doc) => doc.id === state.activeDocumentId),
    isBlocked: () =>
      stateRef.current.collectionDocuments.some(
        (doc) => doc.busy || doc.revision !== doc.savedRevision,
      ),
    blocked: state.collectionDocuments.some(
      (doc) => doc.busy || doc.revision !== doc.savedRevision,
    ),
    pending: state.collectionDocuments.find((doc) => doc.id === pending),
    open,
    select,
    load,
    edit,
    save,
    close,
    selectTab: (id: string, tab: HttpCollectionSettingsDocument["tab"]) => update(id, { tab }),
    cancel: () => setPending(null),
    confirm: () => {
      if (pending) close(pending, true)
      setPending(null)
    },
  }
}
export type HttpCollectionSettings = ReturnType<typeof useHttpCollectionSettings>
