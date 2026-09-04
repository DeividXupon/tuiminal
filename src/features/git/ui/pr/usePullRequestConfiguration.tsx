import { useEffect, useState } from "react"
import { translateUi } from "../../../../shared/i18n"
import type { PullRequestPreviewConfig, PullRequestProfile } from "../../model/pr/config"
import { nextPullRequestPreviewPosition } from "../../model/pr/navigation"
import {
  duplicatePullRequestSection,
  makePullRequestSection,
  movePullRequestSection,
  removePullRequestSection,
  updatePullRequestSection,
} from "../../model/pr/sections"
import type { PullRequestSection } from "../../model/pr/types"
import {
  removePullRequestProfileRepository,
  updatePullRequestProfile,
} from "../../storage/pr/config"
import { RepositorySetupModal } from "./RepositorySetupModal"
import {
  SectionEditorModal,
  type SectionEditorMode,
  type SectionEditorValues,
} from "./SectionEditorModal"
import { SectionManagerModal } from "./SectionManagerModal"

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
  selectCreated,
  selectFallback,
  setNotice,
}: {
  target: PullRequestProfileTarget | null
  currentSection: PullRequestSection
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
  const [previewPosition, setPreviewPositionState] =
    useState<PullRequestPreviewConfig["position"]>("auto")

  useEffect(() => {
    setPreviewPositionState(target?.profile.previewPosition ?? "auto")
  }, [target?.profile.previewPosition])

  const persist = (update: Parameters<typeof updatePullRequestProfile>[0]["update"]) => {
    if (!target) return false
    try {
      updatePullRequestProfile({ root: target.root, update })
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
    if (editor.mode === "create") {
      const created = makePullRequestSection({ ...values, sections: target.profile.sections })
      if (persist((profile) => ({ ...profile, sections: [...profile.sections, created] }))) {
        selectCreated(created.id, target.profile.sections.length)
      }
    } else if (editor.id) {
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

  const editSection = (section: PullRequestSection) => {
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

  const openCreateSection = () => {
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

  const removeRepository = (repository: string) => {
    if (!target) return
    try {
      removePullRequestProfileRepository({ root: target.root, repository })
      setNotice("")
      refresh()
    } catch (error) {
      setNotice(mutationError(error))
    }
    setManagerOpen(false)
  }

  const savePreviewPosition = (position: PullRequestPreviewConfig["position"]) => {
    if (!target) {
      setPreviewPositionState(position)
      return true
    }
    try {
      updatePullRequestProfile({
        root: target.root,
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
    <>
      <RepositorySetupModal
        open={repositoryOpen}
        root={target.root}
        host={target.profile.host}
        onClose={() => setRepositoryOpen(false)}
        onSaved={() => {
          setRepositoryOpen(false)
          refresh()
        }}
      />
      <SectionManagerModal
        open={managerOpen}
        sections={target.profile.sections}
        repositories={target.profile.repositories}
        onClose={() => setManagerOpen(false)}
        onCreate={openCreateSection}
        onEdit={editSection}
        onDuplicate={(section) => {
          persist((profile) => ({
            ...profile,
            sections: duplicatePullRequestSection(profile.sections, section.id),
          }))
          setManagerOpen(false)
        }}
        onMove={(section, delta) => {
          persist((profile) => ({
            ...profile,
            sections: movePullRequestSection(profile.sections, section.id, delta),
          }))
          setManagerOpen(false)
        }}
        onDelete={(section) => {
          persist((profile) => ({
            ...profile,
            sections: removePullRequestSection(profile.sections, section.id),
          }))
          setManagerOpen(false)
          selectFallback(
            target.profile.sections.find((item) => item.id !== section.id)?.id ?? "mine",
          )
        }}
        onAddRepository={() => {
          setManagerOpen(false)
          setRepositoryOpen(true)
        }}
        onRemoveRepository={removeRepository}
      />
      {editor ? (
        <SectionEditorModal
          open
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
    openQuery,
    openManager: () => setManagerOpen(true),
    openCreateSection,
    openRepository: () => setRepositoryOpen(true),
    previewPosition,
    cyclePreviewPosition: () =>
      savePreviewPosition(nextPullRequestPreviewPosition(previewPosition)),
    modals,
  }
}
