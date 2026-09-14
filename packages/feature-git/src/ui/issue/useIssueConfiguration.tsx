import { useEffect, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import type { IssuePreviewConfig, IssueProfile } from "../../model/issue/config"
import { nextIssuePreviewPosition } from "../../model/issue/navigation"
import { updateIssueSection } from "../../model/issue/sections"
import type { IssueSection } from "../../model/issue/types"
import { updateIssueProfile } from "../../storage/issue/config"
import {
  IssueSectionEditorModal,
  type IssueSectionEditorMode,
  type IssueSectionEditorValues,
} from "./IssueSectionEditorModal"

type EditorState = {
  mode: IssueSectionEditorMode
  id: string | null
  title: string
  query: string
  columns: IssueSection["columns"]
  sort: IssueSection["sort"]
  limit: IssueSection["limit"]
}

export type IssueProfileTarget = { root: string; profile: IssueProfile }

export function useIssueConfiguration({
  target,
  currentSection,
  refresh,
  applyQuery,
  clearQuery,
  setNotice,
}: {
  target: IssueProfileTarget | null
  currentSection: IssueSection
  refresh: () => void
  applyQuery: (query: string) => void
  clearQuery: () => void
  setNotice: (notice: string) => void
}) {
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [previewPosition, setPreviewPosition] = useState<IssuePreviewConfig["position"]>("auto")

  useEffect(
    () => setPreviewPosition(target?.profile.previewPosition ?? "auto"),
    [target?.profile.previewPosition],
  )

  const persist = (update: Parameters<typeof updateIssueProfile>[0]["update"]) => {
    if (!target) return false
    try {
      updateIssueProfile({ root: target.root, update, fallbackProfile: target.profile })
      setNotice("")
      refresh()
      return true
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : translateUi("Não foi possível salvar a configuração."),
      )
      return false
    }
  }

  const saveEditor = (values: IssueSectionEditorValues) => {
    if (!editor || !target) return
    if (editor.id) {
      const id = editor.id
      persist((profile) => ({
        ...profile,
        sections: updateIssueSection(profile.sections, id, values),
      }))
      clearQuery()
    }
    setEditor(null)
  }

  const openQuery = () =>
    setEditor({
      mode: "query",
      id: currentSection.id,
      title: currentSection.title,
      query: currentSection.query,
      columns: currentSection.columns,
      sort: currentSection.sort,
      limit: currentSection.limit,
    })
  const cyclePosition = () => {
    const next = nextIssuePreviewPosition(previewPosition)
    if (!target) return setPreviewPosition(next)
    if (persist((profile) => ({ ...profile, previewPosition: next }))) {
      setPreviewPosition(next)
      setNotice(translateUi("Posição da prévia salva para este projeto."))
    }
  }

  const modals = target ? (
    editor ? (
      <IssueSectionEditorModal
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
    previewPosition,
    cyclePreviewPosition: cyclePosition,
    openQuery,
    modals,
  }
}
