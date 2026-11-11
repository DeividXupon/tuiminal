import type { RefObject } from "react"
import type { HttpWorkspaceState } from "../model/types"
import { httpSourceSwitchBlocker } from "../model/source-mode"
import type { HttpCollectionSettings } from "./use-http-collection-settings"
import type { HttpEnvironmentTabs } from "./use-http-environment-tabs"

export function httpWorkspaceTabActions({
  stateRef,
  settings,
  environments,
  selectDocument,
  requestCloseDocument,
  blur,
  notice,
  onChooseSource,
}: {
  stateRef: RefObject<HttpWorkspaceState>
  settings: HttpCollectionSettings
  environments: HttpEnvironmentTabs
  selectDocument: (id: string, focusUrl?: boolean) => void
  requestCloseDocument: (id: string) => void
  blur: () => void
  notice: (message: string) => void
  onChooseSource: () => void
}) {
  const selectTab = (id: string, focusUrl = true) => {
    if (stateRef.current.collectionDocuments.some((doc) => doc.id === id)) settings.select(id)
    else if (stateRef.current.environmentDocuments.some((doc) => doc.id === id))
      environments.selectTab(id)
    else selectDocument(id, focusUrl)
  }
  const closeTab = (id: string) => {
    if (!settings.close(id) && !environments.close(id)) requestCloseDocument(id)
  }
  const chooseSource = () => {
    const blocker = settings.blocked
      ? "Salve ou feche as configurações alteradas antes de mudar de workspace."
      : environments.blocked
        ? "Salve ou feche os ambientes alterados antes de mudar de workspace."
        : httpSourceSwitchBlocker(stateRef.current.documents)
    if (blocker) notice(blocker)
    else {
      blur()
      onChooseSource()
    }
  }
  return { selectTab, closeTab, chooseSource }
}
