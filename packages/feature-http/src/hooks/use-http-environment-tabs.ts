import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { useRenderer } from "@opentui/react"
import type { HttpWorkspaceState } from "../model/types"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { HttpEnvironmentDocument } from "../model/environment-documents"
import { environmentDocumentsBusy } from "../model/environment-documents"
import {
  environmentData,
  httpEnvironmentEditor,
  type HttpEnvironmentEntry,
} from "../services/environment-editor"
import type { useHttpProject } from "./use-http-project"
import type { LivePostmanSession } from "../postman/live-session"

export function useHttpEnvironmentTabs({
  state,
  stateRef,
  dispatch,
  project,
  session,
  notice,
}: {
  state: HttpWorkspaceState
  stateRef: RefObject<HttpWorkspaceState>
  dispatch: (action: HttpWorkspaceAction) => void
  project: ReturnType<typeof useHttpProject>
  session: LivePostmanSession | null
  notice: (message: string) => void
}) {
  const renderer = useRenderer()
  const scope = session ? `postman:${session.workspaceId}` : "local"
  const editor = httpEnvironmentEditor(project, session)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const owner = useRef(session)
  const alive = useRef(true)
  const reads = useRef(new Map<string, number>())
  const epoch = useRef(0)
  const [entries, setEntries] = useState<HttpEnvironmentEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  type Pending = { id: string; action: "close" | "delete"; detached?: HttpEnvironmentDocument }
  const [pending, setPendingState] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const isPending = (id: string) => pendingRef.current?.id === id
  function setPending(value: Pending | null) {
    pendingRef.current = value
    setPendingState(value)
  }
  const refresh = useCallback(async () => {
    const token = ++epoch.current
    setLoading(true)
    setError("")
    try {
      const next = await editorRef.current.list()
      if (token === epoch.current) setEntries(next)
    } catch (failure) {
      if (token === epoch.current)
        setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (token === epoch.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    owner.current = session
    alive.current = true
    setEntries([])
    pendingRef.current = null
    setPendingState(null)
    dispatch({ type: "clear-environment-documents" })
    void refresh()
    return () => {
      epoch.current++
      alive.current = false
      reads.current.clear()
    }
  }, [session, dispatch, refresh])
  useEffect(() => {
    if (!session)
      setEntries(project.environments.map((item) => ({ key: item.name, name: item.name })))
  }, [project.environments, session])

  const ownsSession = () => alive.current && owner.current === session
  const current = (id: string) =>
    ownsSession()
      ? stateRef.current.environmentDocuments.find((doc) => doc.id === id && doc.scope === scope)
      : undefined
  const update = (id: string, patch: Partial<HttpEnvironmentDocument>) =>
    dispatch({ type: "update-environment-document", id, patch })
  const focus = () => renderer.currentFocusedRenderable?.blur()
  const selectTab = (id: string) => {
    focus()
    dispatch({ type: "select-document", documentId: id })
    dispatch({ type: "select-pane", pane: "request" })
  }
  async function load(id: string) {
    const doc = current(id)
    if (!doc || doc.busy || doc.revision !== doc.savedRevision) return
    const owner = doc
    const token = (reads.current.get(id) ?? 0) + 1
    reads.current.set(id, token)
    update(id, { loading: true, error: "" })
    try {
      const data = await editor.read(doc.key)
      if (reads.current.get(id) === token && current(id)?.baseline === owner.baseline)
        update(id, { ...data, loading: false })
    } catch (failure) {
      if (reads.current.get(id) === token && current(id))
        update(id, {
          loading: false,
          error: failure instanceof Error ? failure.message : String(failure),
        })
    }
  }
  function open(entry: HttpEnvironmentEntry, fresh = false) {
    const existing = stateRef.current.environmentDocuments.find((doc) => doc.key === entry.key)
    if (existing) return selectTab(existing.id)
    if (stateRef.current.environmentDocuments.length >= 6)
      return notice("Feche uma aba de ambiente antes de abrir outra.")
    const id = `http-env-${crypto.randomUUID()}`
    focus()
    dispatch({
      type: "open-environment-document",
      document: {
        id,
        scope,
        key: entry.key,
        name: entry.name,
        rows: [],
        baseline: "",
        fresh,
        revision: fresh ? 1 : 0,
        savedRevision: 0,
        loading: !fresh,
      },
    })
    if (!fresh) void load(id)
  }
  function edit(id: string, patch: Pick<Partial<HttpEnvironmentDocument>, "name" | "rows">) {
    const doc = current(id)
    if (!doc || doc.loading || (!doc.baseline && !doc.fresh)) return
    update(id, { ...patch, revision: doc.revision + 1, error: "" })
  }
  async function save(id: string) {
    const doc = current(id)
    if (!doc || doc.busy || doc.loading || (!doc.baseline && !doc.fresh)) return
    update(id, { busy: true, error: "" })
    try {
      const key = await editor.save(doc)
      if (!current(id)) return
      const data = environmentData(
        doc.name.trim(),
        doc.rows
          .filter((row) => row.name.trim() || row.value)
          .map((row) => ({
            ...row,
            name: row.name.trim(),
            ...(session
              ? {
                  metadata: {
                    ...row.metadata,
                    key: row.name.trim(),
                    value: row.value,
                    enabled: row.metadata?.enabled !== false,
                  },
                }
              : {}),
          })),
      )
      update(id, {
        ...(current(id)?.revision === doc.revision ? data : { baseline: data.baseline }),
        key,
        fresh: false,
        busy: false,
        savedRevision: doc.revision,
      })
      void refresh()
      notice("Ambiente salvo.")
    } catch (failure) {
      if (current(id))
        update(id, {
          busy: false,
          error: failure instanceof Error ? failure.message : String(failure),
        })
    }
  }
  function close(id: string) {
    const doc = current(id)
    if (!doc) return false
    if (doc.busy) {
      notice("Aguarde a operação de ambiente em andamento.")
      return true
    }
    if (doc.revision !== doc.savedRevision) setPending({ id, action: "close" })
    else dispatch({ type: "close-environment-document", id })
    return true
  }
  const pendingDocument = () => {
    const value = pendingRef.current
    return value ? (value.detached ?? current(value.id)) : undefined
  }
  function remove(id: string) {
    const doc = current(id)
    if (!doc || doc.key === "@globals" || doc.busy || doc.loading) return
    setPending({ id, action: "delete" })
  }
  async function removeEntry(entry: HttpEnvironmentEntry) {
    if (entry.key === "@globals" || pendingRef.current) return
    const existing = stateRef.current.environmentDocuments.find((doc) => doc.key === entry.key)
    if (existing?.busy || existing?.loading)
      return notice("Aguarde a operação de ambiente em andamento.")
    if (existing?.baseline) return remove(existing.id)
    const id = existing?.id ?? `http-env-delete-${crypto.randomUUID()}`
    await prepareDeletion(entry, id)
  }
  async function prepareDeletion(entry: HttpEnvironmentEntry, id: string) {
    const detached: HttpEnvironmentDocument = {
      id,
      scope,
      key: entry.key,
      name: entry.name,
      rows: [],
      baseline: "",
      revision: 0,
      savedRevision: 0,
      loading: true,
    }
    setPending({ id, action: "delete", detached })
    try {
      const data = await editor.read(entry.key)
      if (ownsSession() && isPending(id))
        setPending({ id, action: "delete", detached: { ...detached, ...data, loading: false } })
    } catch (failure) {
      if (ownsSession() && isPending(id)) {
        notice(failure instanceof Error ? failure.message : String(failure))
        setPending(null)
      }
    }
  }
  async function confirm() {
    const value = pendingRef.current
    const doc = pendingDocument()
    if (!value || !doc || doc.busy || doc.loading) return
    if (value.action === "close") {
      dispatch({ type: "close-environment-document", id: doc.id })
      setPending(null)
      return
    }
    if (doc.key === "@globals") return
    update(doc.id, { busy: true, error: "" })
    setPending({ ...value, detached: { ...doc, busy: true } })
    try {
      await editor.remove(doc)
      if (!ownsSession() || !isPending(doc.id)) return
      if (current(doc.id)) dispatch({ type: "close-environment-document", id: doc.id })
      setPending(null)
      void refresh()
    } catch (failure) {
      if (!ownsSession()) return
      const error = failure instanceof Error ? failure.message : String(failure)
      update(doc.id, { busy: false, error })
      notice(error)
      setPending(null)
    }
  }
  const selecting = useRef(false)
  async function activate(key: string | null) {
    if (selecting.current) return
    selecting.current = true
    try {
      await editor.select(key)
    } catch (failure) {
      notice(failure instanceof Error ? failure.message : String(failure))
    } finally {
      selecting.current = false
    }
  }
  return {
    entries,
    loading,
    error,
    refresh,
    open,
    edit,
    save,
    close,
    load,
    selectTab,
    active: state.environmentDocuments.find((doc) => doc.id === state.activeDocumentId),
    blocked: environmentDocumentsBusy(state) || Boolean(pending),
    selectedKey: session ? (session.environmentId ?? null) : project.activeEnvironmentName,
    remote: Boolean(session),
    activate,
    create: () => open({ key: `new:${crypto.randomUUID()}`, name: "" }, true),
    remove,
    removeEntry,
    pending: pending ? { ...pending, document: pending.detached ?? current(pending.id) } : null,
    confirm,
    cancel: () => {
      if (!pendingDocument()?.busy) setPending(null)
    },
  }
}
export type HttpEnvironmentTabs = ReturnType<typeof useHttpEnvironmentTabs>
