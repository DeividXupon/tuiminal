import { useEffect, useState } from "react"
import { translateUi } from "../../../../shared/i18n"
import { MountWhen } from "../../../../shared/ui/MountWhen"
import type { IssuePreviewConfig, IssueProfile } from "../../model/issue/config"
import { nextIssuePreviewPosition } from "../../model/issue/navigation"
import {
  duplicateIssueSection,
  makeIssueSection,
  moveIssueSection,
  removeIssueSection,
  updateIssueSection,
} from "../../model/issue/sections"
import type { IssueSection } from "../../model/issue/types"
import { removeIssueProfileRepository, updateIssueProfile } from "../../storage/issue/config"
import { IssueRepositorySetupModal } from "./IssueRepositorySetupModal"
import {
  IssueSectionEditorModal,
  type IssueSectionEditorMode,
  type IssueSectionEditorValues,
} from "./IssueSectionEditorModal"
import { IssueSectionManagerModal } from "./IssueSectionManagerModal"

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
  selectCreated,
  selectFallback,
  setNotice,
}: {
  target: IssueProfileTarget | null
  currentSection: IssueSection
  refresh: () => void
  applyQuery: (query: string) => void
  clearQuery: () => void
  selectCreated: (id: string, index: number) => void
  selectFallback: (id: string) => void
  setNotice: (notice: string) => void
}) {
  const [repositoryOpen, setRepositoryOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [previewPosition, setPreviewPosition] = useState<IssuePreviewConfig["position"]>("auto")

  useEffect(
    () => setPreviewPosition(target?.profile.previewPosition ?? "auto"),
    [target?.profile.previewPosition],
  )

  const persist = (update: Parameters<typeof updateIssueProfile>[0]["update"]) => {
    if (!target) return false
    try {
      updateIssueProfile({ root: target.root, update })
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
    if (editor.mode === "create") {
      const created = makeIssueSection({ ...values, sections: target.profile.sections })
      if (persist((profile) => ({ ...profile, sections: [...profile.sections, created] }))) {
        selectCreated(created.id, target.profile.sections.length)
      }
    } else if (editor.id) {
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
  const editSection = (section: IssueSection) => {
    setManagerOpen(false)
    setEditor({
      mode: "edit",
      id: section.id,
      title: section.title,
      query: section.query,
      columns: section.columns,
      sort: section.sort,
      limit: section.limit,
    })
  }
  const openCreate = () => {
    if (!target) return
    setManagerOpen(false)
    setEditor({
      mode: "create",
      id: null,
      title: "",
      query: "is:open",
      columns: undefined,
      sort: undefined,
      limit: undefined,
    })
  }
  const cyclePosition = () => {
    const next = nextIssuePreviewPosition(previewPosition)
    if (!target) return setPreviewPosition(next)
    if (persist((profile) => ({ ...profile, previewPosition: next }))) {
      setPreviewPosition(next)
      setNotice(translateUi("Posição da prévia salva para este projeto."))
    }
  }

  const modals = target ? (
    <>
      <MountWhen when={repositoryOpen}>
        <IssueRepositorySetupModal
          root={target.root}
          host={target.profile.host}
          onClose={() => setRepositoryOpen(false)}
          onSaved={() => {
            setRepositoryOpen(false)
            refresh()
          }}
        />
      </MountWhen>
      <MountWhen when={managerOpen}>
        <IssueSectionManagerModal
          sections={target.profile.sections}
          repositories={target.profile.repositories}
          onClose={() => setManagerOpen(false)}
          onCreate={openCreate}
          onEdit={editSection}
          onDuplicate={(section) => {
            persist((profile) => ({
              ...profile,
              sections: duplicateIssueSection(profile.sections, section.id),
            }))
            setManagerOpen(false)
          }}
          onMove={(section, delta) => {
            persist((profile) => ({
              ...profile,
              sections: moveIssueSection(profile.sections, section.id, delta),
            }))
            setManagerOpen(false)
          }}
          onDelete={(section) => {
            persist((profile) => ({
              ...profile,
              sections: removeIssueSection(profile.sections, section.id),
            }))
            setManagerOpen(false)
            selectFallback(
              target.profile.sections.find((item) => item.id !== section.id)?.id ?? "created",
            )
          }}
          onAddRepository={() => {
            setManagerOpen(false)
            setRepositoryOpen(true)
          }}
          onRemoveRepository={(repository) => {
            try {
              removeIssueProfileRepository({ root: target.root, repository })
              refresh()
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : translateUi("Não foi possível salvar a configuração."),
              )
            }
            setManagerOpen(false)
          }}
        />
      </MountWhen>
      {editor ? (
        <IssueSectionEditorModal
          mode={editor.mode}
          initialTitle={editor.title}
          initialQuery={editor.query}
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
      ) : null}
    </>
  ) : null

  return {
    modalOpen: repositoryOpen || managerOpen || Boolean(editor),
    previewPosition,
    cyclePreviewPosition: cyclePosition,
    openQuery,
    openManager: () => setManagerOpen(true),
    openCreateSection: openCreate,
    modals,
  }
}
