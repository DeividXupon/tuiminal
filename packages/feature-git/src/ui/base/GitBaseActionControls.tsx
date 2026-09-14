import type { Dispatch, SetStateAction } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { gitActionLabel } from "../../model/base-navigation"
import type { ViewMode } from "../../model/view"

type CommonActionProps = {
  compact: boolean
  view: ViewMode
  busy: boolean
  commandRunning: boolean
  stagePending: boolean
  setView: Dispatch<SetStateAction<ViewMode>>
}

function GitHistoryActions({
  compact,
  view,
  selectedCommitIndex,
  commitCount,
  hasSelectedCommit,
  setSelectedCommitIndex,
  setView,
}: {
  compact: boolean
  view: ViewMode
  selectedCommitIndex: number
  commitCount: number
  hasSelectedCommit: boolean
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  setView: Dispatch<SetStateAction<ViewMode>>
}) {
  return (
    <>
      <InlineButton
        label={gitActionLabel(compact, "[K/↑] ‹")}
        accent={COLORS.git}
        disabled={selectedCommitIndex === 0}
        onPress={() => setSelectedCommitIndex((current) => Math.max(0, current - 1))}
      />
      <InlineButton
        label={gitActionLabel(compact, "[J/↓] ›")}
        accent={COLORS.git}
        disabled={selectedCommitIndex >= commitCount - 1}
        onPress={() => setSelectedCommitIndex((current) => Math.min(commitCount - 1, current + 1))}
      />
      <InlineButton
        label={gitActionLabel(compact, "[↵] Abrir")}
        accent={COLORS.git}
        disabled={!hasSelectedCommit}
        onPress={() => setView("commit")}
      />
      <InlineButton
        label={gitActionLabel(compact, "[D] Diff")}
        accent={COLORS.git}
        onPress={() => setView("diff")}
      />
      <InlineButton
        label={gitActionLabel(compact, view === "graph" ? "[O] Lista" : "[G] Árvore")}
        accent={COLORS.database}
        onPress={() => setView(view === "graph" ? "log" : "graph")}
      />
    </>
  )
}

function GitDiffActions({
  compact,
  view,
  busy,
  commandRunning,
  stagePending,
  selectedActionFileCount,
  selectedFolder,
  repositoryFileCount,
  partialStageDisabled,
  setView,
  onStage,
  onStageSelection,
  onPartialStage,
  onDiscard,
}: CommonActionProps & {
  selectedActionFileCount: number
  selectedFolder: boolean
  repositoryFileCount: number
  partialStageDisabled: boolean
  onStage: () => void
  onStageSelection: () => void
  onPartialStage: () => void
  onDiscard: () => void
}) {
  return (
    <>
      {view === "diff" ? (
        <>
          <InlineButton
            label={gitActionLabel(compact, "[␠] Stage")}
            accent={COLORS.git}
            disabled={!selectedActionFileCount || busy || commandRunning}
            onPress={onStage}
          />
          <InlineButton
            id="git-partial-stage-open"
            label={gitActionLabel(compact, translateUi("[S] Stage parcial"))}
            accent={COLORS.git}
            disabled={partialStageDisabled}
            onPress={onPartialStage}
          />
          <InlineButton
            label={gitActionLabel(compact, translateUi(selectedFolder ? "[A] Pasta" : "[A] Todos"))}
            accent={COLORS.git}
            disabled={
              !(selectedFolder ? selectedActionFileCount : repositoryFileCount) ||
              busy ||
              commandRunning
            }
            onPress={onStageSelection}
          />
          <InlineButton
            label={gitActionLabel(compact, translateUi("[D] Descartar"))}
            accent={COLORS.danger}
            disabled={!selectedActionFileCount || busy || stagePending || commandRunning}
            onPress={onDiscard}
          />
        </>
      ) : null}
      <InlineButton
        label={gitActionLabel(compact, "[G] Árvore")}
        accent={COLORS.database}
        onPress={() => setView("graph")}
      />
      <InlineButton
        label={gitActionLabel(compact, "[O] Log")}
        accent={COLORS.git}
        onPress={() => setView("log")}
      />
      {view === "commit" ? (
        <InlineButton
          label={gitActionLabel(compact, "[D] Diff")}
          accent={COLORS.git}
          onPress={() => setView("diff")}
        />
      ) : null}
    </>
  )
}

export function GitBaseActionControls({
  selectedCommitIndex,
  commitCount,
  hasSelectedCommit,
  setSelectedCommitIndex,
  selectedActionFileCount,
  selectedFolder,
  repositoryFileCount,
  partialStageDisabled,
  loading,
  onStage,
  onStageSelection,
  onPartialStage,
  onDiscard,
  onFocusTerminal,
  onRefresh,
  ...common
}: CommonActionProps & {
  selectedCommitIndex: number
  commitCount: number
  hasSelectedCommit: boolean
  setSelectedCommitIndex: Dispatch<SetStateAction<number>>
  selectedActionFileCount: number
  selectedFolder: boolean
  repositoryFileCount: number
  partialStageDisabled: boolean
  loading: boolean
  onStage: () => void
  onStageSelection: () => void
  onPartialStage: () => void
  onDiscard: () => void
  onFocusTerminal: () => void
  onRefresh: () => void
}) {
  const history = common.view === "graph" || common.view === "log"
  return (
    <>
      {history ? (
        <GitHistoryActions
          compact={common.compact}
          view={common.view}
          selectedCommitIndex={selectedCommitIndex}
          commitCount={commitCount}
          hasSelectedCommit={hasSelectedCommit}
          setSelectedCommitIndex={setSelectedCommitIndex}
          setView={common.setView}
        />
      ) : (
        <GitDiffActions
          {...common}
          selectedActionFileCount={selectedActionFileCount}
          selectedFolder={selectedFolder}
          repositoryFileCount={repositoryFileCount}
          partialStageDisabled={partialStageDisabled}
          onStage={onStage}
          onStageSelection={onStageSelection}
          onPartialStage={onPartialStage}
          onDiscard={onDiscard}
        />
      )}
      <InlineButton
        label={gitActionLabel(common.compact, translateUi("[T] Focar"))}
        accent={COLORS.git}
        onPress={onFocusTerminal}
      />
      <InlineButton
        id="git-base-refresh"
        label={gitActionLabel(common.compact, "[R] Sync")}
        accent={COLORS.git}
        disabled={loading || common.busy || common.stagePending || common.commandRunning}
        onPress={onRefresh}
      />
    </>
  )
}
