import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  gitConfigurationAction,
  type GitConfigurationAction,
  type GitConfigurationMutation,
  type GitConfigurationTab,
  toggleRepositorySelection,
} from "../../model/git-configuration"
import {
  duplicateIssueSection,
  makeIssueSection,
  moveIssueSection,
  removeIssueSection,
  updateIssueSection,
} from "../../model/issue/sections"
import type { IssueSection } from "../../model/issue/types"
import {
  duplicatePullRequestSection,
  makePullRequestSection,
  movePullRequestSection,
  removePullRequestSection,
  updatePullRequestSection,
} from "../../model/pr/sections"
import type { PullRequestSection } from "../../model/pr/types"
import type { IssueSectionEditorValues } from "../issue/IssueSectionEditorModal"
import type { SectionEditorValues } from "../pr/SectionEditorModal"
import { GitConfigurationEditor, type GitConfigurationEditorState } from "./GitConfigurationEditor"
import { GitLocalTargetPicker, type GitLocalTargetPickerKind } from "./GitLocalTargetPicker"
import { GitConfigurationPanel } from "./GitConfigurationPanel"
import { useGitConfiguration } from "./useGitConfiguration"
import { GIT_BROWSER_OPTIONS, type GitBrowser } from "../../model/browser"

function mutatePullRequestSections(
  sections: readonly PullRequestSection[],
  id: string,
  action: GitConfigurationMutation,
) {
  if (action === "duplicate") return duplicatePullRequestSection(sections, id)
  if (action === "delete") return removePullRequestSection(sections, id)
  return movePullRequestSection(sections, id, action === "up" ? -1 : 1)
}

function mutateIssueSections(
  sections: readonly IssueSection[],
  id: string,
  action: GitConfigurationMutation,
) {
  if (action === "duplicate") return duplicateIssueSection(sections, id)
  if (action === "delete") return removeIssueSection(sections, id)
  return moveIssueSection(sections, id, action === "up" ? -1 : 1)
}

function executeConfigurationAction(
  action: GitConfigurationAction,
  handlers: {
    close: () => void
    selectTab: (tab: GitConfigurationTab) => void
    mutate: (mutation: GitConfigurationMutation) => void
    create: () => void
    edit: () => void
    configureLocal: (target: "project" | "branch") => void
    toggleRepository: () => void
    selectBrowser: () => void
    moveSelection: (delta: -1 | 1) => void
  },
) {
  if (action.type === "close") return handlers.close()
  if (action.type === "select-tab") return handlers.selectTab(action.tab)
  if (action.type === "mutate") return handlers.mutate(action.mutation)
  if (action.type === "create") return handlers.create()
  if (action.type === "edit") return handlers.edit()
  if (action.type === "configure-local") return handlers.configureLocal(action.target)
  if (action.type === "toggle-repository") return handlers.toggleRepository()
  if (action.type === "select-browser") return handlers.selectBrowser()
  handlers.moveSelection(action.delta)
}

function configurationRowId(tab: GitConfigurationTab, index: number) {
  if (tab === "diffs") return `git-configuration-local-${index === 1 ? "branch" : "project"}`
  if (tab === "browser") return `git-configuration-browser-${GIT_BROWSER_OPTIONS[index]}`
  if (tab === "repositories") return `git-configuration-repository-${index}`
  if (tab === "issues") return `git-configuration-issue-selector-${index}`
  return `git-configuration-pr-selector-${index}`
}

export function GitConfigurationModal({
  open,
  initialTab = "diffs",
  onClose,
  onChanged,
}: {
  open: boolean
  initialTab?: GitConfigurationTab
  onClose: () => void
  onChanged: (change: "local" | "remote") => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const listRef = useRef<ScrollBoxRenderable | null>(null)
  const [tab, setTab] = useState<GitConfigurationTab>(initialTab)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [editor, setEditor] = useState<GitConfigurationEditorState | null>(null)
  const [localPicker, setLocalPicker] = useState<GitLocalTargetPickerKind | null>(null)
  const configuration = useGitConfiguration(open, onChanged)
  const ready = configuration.state.status === "ready" ? configuration.state : null
  const sections =
    tab === "pull-requests"
      ? (ready?.pullRequestProfile.sections ?? [])
      : tab === "issues"
        ? (ready?.issueProfile.sections ?? [])
        : []
  const repositoryEntries = ready ? [null, ...ready.availableRepositories] : []
  const itemCount =
    tab === "diffs"
      ? 2
      : tab === "repositories"
        ? repositoryEntries.length
        : tab === "browser"
          ? GIT_BROWSER_OPTIONS.length
          : sections.length
  const selectedSection = sections[selectedIndex]
  const selectedRepository = tab === "repositories" ? repositoryEntries[selectedIndex] : undefined

  useEffect(() => {
    if (!open || editor || localPicker) return
    renderer.currentFocusedRenderable?.blur()
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [editor, localPicker, open, renderer])

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(0, itemCount - 1)))
  }, [itemCount])

  useEffect(() => {
    if (!open || editor || localPicker) return
    listRef.current?.scrollChildIntoView(configurationRowId(tab, selectedIndex))
  }, [editor, localPicker, open, selectedIndex, tab])

  const selectTab = (next: GitConfigurationTab) => {
    setTab(next)
    setPendingDelete(null)
    if (next === "repositories" && ready?.context.remote) {
      const index = ready.availableRepositories.indexOf(ready.context.remote.repository)
      setSelectedIndex(index < 0 ? 0 : index + 1)
    } else if (next === "browser")
      setSelectedIndex(Math.max(0, GIT_BROWSER_OPTIONS.indexOf(ready?.browser ?? "system")))
    else setSelectedIndex(0)
  }

  const savePrEditor = (values: SectionEditorValues) => {
    if (!ready || editor?.kind !== "pr") return
    const sections = editor.section
      ? updatePullRequestSection(ready.pullRequestProfile.sections, editor.section.id, values)
      : [
          ...ready.pullRequestProfile.sections,
          makePullRequestSection({ ...values, sections: ready.pullRequestProfile.sections }),
        ]
    if (configuration.savePullRequestSections(sections)) setEditor(null)
  }

  const saveIssueEditor = (values: IssueSectionEditorValues) => {
    if (!ready || editor?.kind !== "issue") return
    const sections = editor.section
      ? updateIssueSection(ready.issueProfile.sections, editor.section.id, values)
      : [
          ...ready.issueProfile.sections,
          makeIssueSection({ ...values, sections: ready.issueProfile.sections }),
        ]
    if (configuration.saveIssueSections(sections)) setEditor(null)
  }

  const openCreate = () => {
    if (tab === "issues") setEditor({ kind: "issue", mode: "create", section: null })
    else setEditor({ kind: "pr", mode: "create", section: null })
  }

  const openEdit = () => {
    if (!selectedSection) return
    if (tab === "issues") {
      setEditor({ kind: "issue", mode: "edit", section: selectedSection as IssueSection })
    } else {
      setEditor({ kind: "pr", mode: "edit", section: selectedSection as PullRequestSection })
    }
  }

  const mutateSelectedSection = (action: GitConfigurationMutation) => {
    if (!ready || !selectedSection) return
    if (action === "delete" && sections.length <= 1) return
    if (action === "delete" && pendingDelete !== selectedSection.id) {
      setPendingDelete(selectedSection.id)
      return
    }
    if (tab === "pull-requests") {
      const current = ready.pullRequestProfile.sections
      const next = mutatePullRequestSections(current, selectedSection.id, action)
      configuration.savePullRequestSections(next)
    } else if (tab === "issues") {
      const current = ready.issueProfile.sections
      const next = mutateIssueSections(current, selectedSection.id, action)
      configuration.saveIssueSections(next)
    }
    setPendingDelete(null)
  }

  const toggleRepository = (repository: string | null) => {
    if (!ready) return
    configuration.saveRepositories(toggleRepositorySelection(ready.repositories, repository))
  }

  const selectBrowser = (browser: GitBrowser) => configuration.saveBrowser(browser)

  useKeyboard((key) => {
    if (!open || editor || localPicker) return
    const action = gitConfigurationAction({
      key,
      tab,
      hasSelection: Boolean(selectedSection),
      selectedIndex,
    })
    if (!action) return
    key.preventDefault()
    if (action.type === "close") key.stopPropagation()
    executeConfigurationAction(action, {
      close: onClose,
      selectTab,
      mutate: mutateSelectedSection,
      create: openCreate,
      edit: openEdit,
      configureLocal: setLocalPicker,
      toggleRepository: () => toggleRepository(selectedRepository ?? null),
      selectBrowser: () => selectBrowser(GIT_BROWSER_OPTIONS[selectedIndex] ?? "system"),
      moveSelection: (delta) =>
        setSelectedIndex((current) =>
          Math.max(0, Math.min(Math.max(0, itemCount - 1), current + delta)),
        ),
    })
  })

  const width = Math.max(54, Math.min(104, terminal.width - 4))
  const height = Math.max(16, Math.min(30, terminal.height - 2))
  const selectedRepositories = useMemo(
    () => new Set(ready?.repositories ?? []),
    [ready?.repositories],
  )

  if (!open) return null
  if (editor) {
    return (
      <GitConfigurationEditor
        editor={editor}
        repositories={ready?.availableRepositories ?? []}
        onClose={() => setEditor(null)}
        onSavePullRequest={savePrEditor}
        onSaveIssue={saveIssueEditor}
      />
    )
  }
  if (localPicker && ready) {
    return (
      <GitLocalTargetPicker
        kind={localPicker}
        target={ready.localTarget}
        projects={ready.availableLocalProjects}
        projectsLoading={ready.localProjectsLoading}
        projectError={ready.localProjectError}
        onClose={() => setLocalPicker(null)}
        onSelectProject={configuration.saveLocalProject}
        onSelectBranch={configuration.saveLocalBranch}
      />
    )
  }

  return (
    <GitConfigurationPanel
      dialogRef={dialogRef}
      listRef={listRef}
      width={width}
      height={height}
      state={configuration.state}
      ready={ready}
      notice={configuration.notice}
      tab={tab}
      sections={sections}
      selectedIndex={selectedIndex}
      selectedRepositories={selectedRepositories}
      selected={Boolean(selectedSection)}
      pendingDelete={Boolean(pendingDelete)}
      onClose={onClose}
      onSelectTab={selectTab}
      onSelect={setSelectedIndex}
      onToggleRepository={toggleRepository}
      onSelectBrowser={selectBrowser}
      onConfigureLocal={setLocalPicker}
      onReload={() => void configuration.reload()}
      onCreate={openCreate}
      onEdit={openEdit}
      onMutate={mutateSelectedSection}
    />
  )
}
