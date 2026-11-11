import { environmentDocumentsBusy } from "../model/environment-documents"
import { useRenderer } from "@opentui/react"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi } from "../postman/api"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { PostmanWorkspace } from "../postman/api"
import type { HttpDocumentState, HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"
import { LivePostmanSession, type LivePostmanView } from "../postman/live-session"
import type { HttpRestoredPostmanWorkspace } from "../services/startup-workspace"
import { saveHttpLastWorkspace } from "../storage/last-workspace"

const subscribeEmpty = () => () => {}
const emptyView: LivePostmanView = {
  variablesForRequest: () => new Map(),
  projectRequests: [],
  sourceFiles: [],
  sourceDirectories: [],
  sourcePostmanFolders: [],
}
const emptySnapshot = () => emptyView
export function useHttpPostman(
  dispatch: (action: HttpWorkspaceAction) => void,
  blurDocumentControls: () => void,
  setNotice: (message: string) => void,
  state: RefObject<HttpWorkspaceState>,
  restored?: HttpRestoredPostmanWorkspace,
) {
  const getDocuments = useCallback(() => state.current.documents, [state])
  const renderer = useRenderer()
  const [workspace, setWorkspace] = useState<PostmanWorkspace | null>(restored?.workspace ?? null)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [session, setSession] = useState<LivePostmanSession | null>(restored?.session ?? null)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const opening = useRef(0)
  const view = useSyncExternalStore(
    session?.subscribe ?? subscribeEmpty,
    session?.snapshot ?? emptySnapshot,
  )
  useEffect(
    () => () => {
      session?.dispose()
      if (sessionRef.current === session) {
        sessionRef.current = null
        opening.current++
      }
    },
    [session],
  )
  const open = useCallback(
    (action?: "create-workspace") => {
      if (
        state.current.collectionDocuments.some(
          (doc) => doc.busy || doc.revision !== doc.savedRevision,
        )
      ) {
        setNotice("Salve ou feche as configurações alteradas antes de mudar de workspace.")
        return
      }
      if (environmentDocumentsBusy(state.current)) {
        setNotice("Salve ou feche os ambientes alterados antes de mudar de workspace.")
        return
      }
      if (
        getDocuments().some(
          (document) =>
            document.revision !== document.savedRevision || document.execution.status === "running",
        )
      ) {
        setNotice("Salve ou feche os requests alterados antes de mudar a coleção.")
        return
      }
      setCreatingWorkspace(action === "create-workspace")
      blurDocumentControls()
      dispatch({ type: "open-overlay", overlay: "postman-browser" })
    },
    [blurDocumentControls, dispatch, getDocuments, setNotice, state],
  )
  const onWorkspaceSelected = useCallback(
    async (selected: PostmanWorkspace, loaded: LivePostmanSession) => {
      sessionRef.current = loaded
      setSession(loaded)
      setWorkspace(selected)
      saveHttpLastWorkspace({
        source: "postman",
        workspaceId: selected.id,
        ...(loaded.environmentId ? { environmentId: loaded.environmentId } : {}),
      })
      const documents = getDocuments()
      for (const document of documents) {
        const source = document.request.source
        if (source.kind === "file")
          dispatch({ type: "close-document", documentId: document.request.id })
      }
      setNotice(
        `POSTMAN · ${selected.name} · ${loaded.view.sourceFiles.length} ${translateUi("coleções")}`,
      )
    },
    [dispatch, getDocuments, setNotice],
  )
  const ensureSession = useCallback(
    async (workspaceId?: string) => {
      const current = sessionRef.current
      if (current && (!workspaceId || current.workspaceId === workspaceId)) return current
      if (!workspaceId) throw new Error("Selecione um workspace Postman.")
      const account = await loadPostmanAccount()
      if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
      const token = opening.current
      const next = new LivePostmanSession(new PostmanApi(account), workspaceId)
      try {
        await next.load()
        if (token !== opening.current) throw new Error("Conexão Postman cancelada.")
        await onWorkspaceSelected({ id: workspaceId, name: workspaceId }, next)
        return next
      } catch (error) {
        next.dispose()
        throw error
      }
    },
    [onWorkspaceSelected],
  )
  const openRequest = useCallback(
    async (item: HttpProjectRequestItem, openDocument: (item: HttpProjectRequestItem) => void) => {
      const current = sessionRef.current
      if (!current) return
      const existing = getDocuments().find((document) => document.request.id === item.request.id)
      if (documentIsBusy(existing)) {
        openDocument({ ...item, request: existing.request })
        return
      }
      const token = ++opening.current
      try {
        const request = await current.openRequest(item.request)
        if (sessionRef.current !== current || opening.current !== token) return
        const active = getDocuments().find((document) => document.request.id === request.id)
        if (active && !documentIsBusy(active))
          dispatch({ type: "commit-saved-document", documentId: request.id, request })
        openDocument({ ...item, request })
      } catch (error) {
        if (sessionRef.current === current)
          setNotice(error instanceof Error ? error.message : String(error))
      }
    },
    [dispatch, getDocuments, setNotice],
  )
  const refresh = useCallback(async () => {
    const current = sessionRef.current
    if (!current) return
    const requests = new Map(
      current.view.projectRequests.map((item) => [item.request.id, item.request]),
    )
    const documents = getDocuments()
    for (const document of documents) {
      if (document.request.source.kind !== "file" || !document.request.source.postman) continue
      if (document.revision !== document.savedRevision || document.execution.status === "running")
        continue
      const request = requests.get(document.request.id)
      if (request) dispatch({ type: "commit-saved-document", documentId: request.id, request })
    }
  }, [dispatch, getDocuments])
  const openLocalEnvironments = useCallback(() => {
    blurDocumentControls()
    renderer.currentFocusedRenderable?.blur()
    dispatch({ type: "open-overlay", overlay: "environment-manager" })
  }, [blurDocumentControls, dispatch, renderer])
  return {
    workspace,
    creatingWorkspace,
    openLocalEnvironments,
    session,
    ensureSession,
    view,
    selectWorkspace: setWorkspace,
    open,
    onWorkspaceSelected,
    openRequest,
    refresh,
  }
}

function documentIsBusy(document: HttpDocumentState | undefined): document is HttpDocumentState {
  return Boolean(
    document &&
      (document.revision !== document.savedRevision || document.execution.status === "running"),
  )
}

export function useHttpProjectRequestOpener(
  mode: import("../model/source-mode").HttpSourceMode,
  remote: (
    item: HttpProjectRequestItem,
    open: (item: HttpProjectRequestItem) => void,
  ) => Promise<void>,
  local: (item: HttpProjectRequestItem) => void,
) {
  return useCallback(
    (item: HttpProjectRequestItem) => {
      if (mode === "postman") void remote(item, local)
      else local(item)
    },
    [mode, remote, local],
  )
}
