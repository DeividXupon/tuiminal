import { useCallback, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { useHttpProject } from "./use-http-project"
import type { PostmanWorkspace } from "../postman/api"
import type { WorkspaceSyncResult } from "../postman/workspace-sync"
import type { HttpDocumentState } from "../model/types"
import { loadPostmanAccount } from "../postman/account"
import { PostmanApi } from "../postman/api"
import { pushPostmanRequest } from "../postman/sync"

export function useHttpPostman(
  project: ReturnType<typeof useHttpProject>,
  dispatch: (action: HttpWorkspaceAction) => void,
  blurDocumentControls: () => void,
  setNotice: (message: string) => void,
) {
  const pushing = useRef(false)
  const [workspace, setWorkspace] = useState<PostmanWorkspace | null>(null)
  const open = useCallback(() => {
    blurDocumentControls()
    dispatch({ type: "open-overlay", overlay: "postman-browser" })
  }, [blurDocumentControls, dispatch])
  const onWorkspaceSelected = useCallback(
    async (selected: PostmanWorkspace, result: WorkspaceSyncResult) => {
      setWorkspace(selected)
      await project.refresh()
      if (result.environmentName) project.selectEnvironment(result.environmentName)
      setNotice(
        `POSTMAN · ${selected.name} · ${result.collections} ${translateUi("coleções")} · ${result.imported} ${translateUi("novas")}${result.errors.length ? ` · ${result.errors.length} ${translateUi("falhas")}` : ""}`,
      )
    },
    [project, setNotice],
  )
  const push = useCallback(
    async (document: HttpDocumentState) => {
      if (pushing.current) return
      if (document.revision !== document.savedRevision) {
        setNotice("Salve a request localmente antes de enviar ao Postman.")
        return
      }
      pushing.current = true
      try {
        const account = await loadPostmanAccount()
        if (!account) throw new Error("Postman desconectado. Execute: tuiminal postman login")
        setNotice("ENVIANDO REQUEST AO POSTMAN…")
        const result = await pushPostmanRequest(
          HTTP_WORKING_DIRECTORY,
          new PostmanApi(account),
          document.request,
        )
        setNotice(result === "pushed" ? "REQUEST ENVIADA AO POSTMAN" : "SEM ALTERAÇÕES PARA ENVIAR")
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error))
      } finally {
        pushing.current = false
      }
    },
    [setNotice],
  )
  return {
    root: HTTP_WORKING_DIRECTORY,
    workspace,
    selectWorkspace: setWorkspace,
    open,
    onWorkspaceSelected,
    push,
  }
}
