import { useEffect, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { PullRequestPreviewConfig, PullRequestProfile } from "../../model/pr/config"
import { nextPullRequestPreviewPosition } from "../../model/pr/navigation"
import { updatePullRequestSection } from "../../model/pr/sections"
import type { PullRequestSection } from "../../model/pr/types"
import { updatePullRequestProfile } from "../../storage/pr/config"
import {
  SectionEditorModal,
  type SectionEditorMode,
  type SectionEditorValues,
} from "./SectionEditorModal"

type EditorState = {
  mode: SectionEditorMode
  id: string | null
  title: string
  query: string
  columns: PullRequestSection["columns"]
  sort: PullRequestSection["sort"]
  limit: PullRequestSection["limit"]
}

export type PullRequestProfileTarget = { root: string; profile: PullRequestProfile }

function mutationError(error: unknown) {
  return error instanceof Error
    ? error.message
    : translateUi("Não foi possível salvar a configuração.")
}

export function usePullRequestConfiguration({
  target,
  currentSection,
  refresh,
  applyQuery,
  clearQuery,
  setNotice,
}: {
  target: PullRequestProfileTarget | null
  currentSection: PullRequestSection
  refresh: () => void
  applyQuery: (query: string) => void
  clearQuery: () => void
  setNotice: (notice: string) => void
}) {
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [previewPosition, setPreviewPositionState] =
    useState<PullRequestPreviewConfig["position"]>("auto")

  useEffect(() => {
    setPreviewPositionState(target?.profile.previewPosition ?? "auto")
  }, [target?.profile.previewPosition])

  const persist = (update: Parameters<typeof updatePullRequestProfile>[0]["update"]) => {
    if (!target) return false
    try {
      updatePullRequestProfile({ root: target.root, update, fallbackProfile: target.profile })
      setNotice("")
      refresh()
      return true
    } catch (error) {
      setNotice(mutationError(error))
      return false
    }
  }

  const saveEditor = (values: SectionEditorValues) => {
    if (!editor || !target) return
    if (editor.id) {
      const editorId = editor.id
      persist((profile) => ({
        ...profile,
        sections: updatePullRequestSection(profile.sections, editorId, values),
      }))
      clearQuery()
    }
    setEditor(null)
  }

  const openQuery = () => {
    setEditor({
      mode: "query",
      id: currentSection.id,
      title: currentSection.title,
      query: currentSection.query,
      columns: currentSection.columns,
      sort: currentSection.sort,
      limit: currentSection.limit,
    })
  }

  const savePreviewPosition = (position: PullRequestPreviewConfig["position"]) => {
    if (!target) {
      setPreviewPositionState(position)
      return true
    }
    try {
      updatePullRequestProfile({
        root: target.root,
        fallbackProfile: target.profile,
        update: (profile) => ({ ...profile, previewPosition: position }),
      })
      setPreviewPositionState(position)
      setNotice(translateUi("Posição da prévia salva para este projeto."))
      return true
    } catch (error) {
      setNotice(mutationError(error))
      return false
    }
  }

  const modals = target ? (
    editor ? (
      <SectionEditorModal
        open
        mode={editor.mode}
        initialTitle={editor.title}
        initialQuery={editor.query}
        repositories={target.profile.repositories}
        {...(editor.columns ? { initialColumns: editor.columns } : {})}
        {...(editor.sort ? { initialSort: editor.sort } : {})}
        {...(editor.limit ? { initialLimit: editor.limit } : {})}
        onClose={() => setEditor(null)}
        onApply={(query) => {
          applyQuery(query)
          setEditor(null)
        }}
        onSave={saveEditor}
      />
    ) : null
  ) : null

  return {
    modalOpen: Boolean(editor),
    openQuery,
    previewPosition,
    cyclePreviewPosition: () =>
      savePreviewPosition(nextPullRequestPreviewPosition(previewPosition)),
    modals,
  }
}
