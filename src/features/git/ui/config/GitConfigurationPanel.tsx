import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { Button } from "@tuiparts/react/button"
import type { RefObject } from "react"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { GitConfigurationTab } from "../../model/git-configuration"
import type { GitConfigurationReadyState, GitConfigurationState } from "./useGitConfiguration"
import {
  GitConfigurationTabs,
  GitLocalTargetRows,
  GitRepositoryRows,
  GitSelectorActions,
  GitSelectorRows,
} from "./GitConfigurationRows"

type Selector = { id: string; title: string; query: string }
type SectionMutation = "duplicate" | "delete" | "up" | "down"

function GitConfigurationList({
  state,
  ready,
  tab,
  sections,
  selectedIndex,
  selectedRepositories,
  width,
  onSelect,
  onToggleRepository,
  onConfigureLocal,
}: {
  state: GitConfigurationState
  ready: GitConfigurationReadyState | null
  tab: GitConfigurationTab
  sections: readonly Selector[]
  selectedIndex: number
  selectedRepositories: ReadonlySet<string>
  width: number
  onSelect: (index: number) => void
  onToggleRepository: (repository: string | null) => void
  onConfigureLocal: (target: "project" | "branch") => void
}) {
  if (state.status === "loading") {
    return <text content={translateUi("CARREGANDO CONFIGURAÇÃO GIT…")} style={{ fg: COLORS.git }} />
  }
  if (state.status === "error") return <text content={state.error} style={{ fg: COLORS.danger }} />
  if (tab === "diffs" && ready) {
    return (
      <>
        <GitLocalTargetRows
          target={ready.localTarget}
          selectedIndex={selectedIndex}
          width={width}
          onSelect={onSelect}
          onActivate={onConfigureLocal}
        />
        {ready.localProjectsLoading ? (
          <text
            content={translateUi("◷ Procurando repositórios Git locais…")}
            style={{ fg: COLORS.git }}
          />
        ) : null}
        {ready.localProjectError ? (
          <text content={ready.localProjectError} style={{ fg: COLORS.danger }} />
        ) : null}
      </>
    )
  }
  if (tab !== "repositories") {
    return (
      <GitSelectorRows
        kind={tab === "issues" ? "issue" : "pr"}
        sections={sections}
        selectedIndex={selectedIndex}
        width={width}
        onSelect={onSelect}
      />
    )
  }
  return (
    <>
      <GitRepositoryRows
        repositories={ready?.availableRepositories ?? []}
        selectedRepositories={selectedRepositories}
        selectedIndex={selectedIndex}
        currentRepository={ready?.context.remote?.repository ?? null}
        width={width}
        onSelect={onSelect}
        onToggle={onToggleRepository}
      />
      {ready?.repositoriesLoading ? (
        <text
          id="git-configuration-repositories-loader"
          content={translateUi("◷ Carregando todos os repositórios da conta…")}
          style={{ fg: COLORS.git }}
        />
      ) : null}
      {ready?.partial ? (
        <text
          content={translateUi("CATÁLOGO PARCIAL · alguns repositórios podem não aparecer")}
          style={{ fg: COLORS.warning }}
        />
      ) : null}
      {ready?.repositoryError ? (
        <text content={ready.repositoryError} style={{ fg: COLORS.danger }} />
      ) : null}
    </>
  )
}

function GitConfigurationFooter({
  state,
  tab,
  selected,
  canDelete,
  pendingDelete,
  onReload,
  onCreate,
  onEdit,
  onMutate,
}: {
  state: GitConfigurationState
  tab: GitConfigurationTab
  selected: boolean
  canDelete: boolean
  pendingDelete: boolean
  onReload: () => void
  onCreate: () => void
  onEdit: () => void
  onMutate: (action: SectionMutation) => void
}) {
  if (state.status === "error") {
    return (
      <InlineButton
        label={translateUi("[R] Tentar novamente")}
        accent={COLORS.git}
        onPress={onReload}
      />
    )
  }
  if (tab === "repositories") {
    return (
      <ShortcutText
        content={translateUi("[J/K] Navegar  [Espaço/Enter] selecionar  [1/2/3/4] Aba")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    )
  }
  if (tab === "diffs") {
    return (
      <ShortcutText
        content={translateUi(
          "[P] Projeto  [B] Branch  [J/K] Navegar  [Enter] Alterar  [1/2/3/4] Aba",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    )
  }
  return (
    <GitSelectorActions
      selected={selected}
      canDelete={canDelete}
      pendingDelete={pendingDelete}
      onCreate={onCreate}
      onEdit={onEdit}
      onMutate={onMutate}
    />
  )
}

export function GitConfigurationPanel({
  dialogRef,
  listRef,
  width,
  height,
  state,
  ready,
  notice,
  tab,
  sections,
  selectedIndex,
  selectedRepositories,
  selected,
  pendingDelete,
  onClose,
  onSelectTab,
  onSelect,
  onToggleRepository,
  onConfigureLocal,
  onReload,
  onCreate,
  onEdit,
  onMutate,
}: {
  dialogRef: RefObject<BoxRenderable | null>
  listRef: RefObject<ScrollBoxRenderable | null>
  width: number
  height: number
  state: GitConfigurationState
  ready: GitConfigurationReadyState | null
  notice: string
  tab: GitConfigurationTab
  sections: readonly Selector[]
  selectedIndex: number
  selectedRepositories: ReadonlySet<string>
  selected: boolean
  pendingDelete: boolean
  onClose: () => void
  onSelectTab: (tab: GitConfigurationTab) => void
  onSelect: (index: number) => void
  onToggleRepository: (repository: string | null) => void
  onConfigureLocal: (target: "project" | "branch") => void
  onReload: () => void
  onCreate: () => void
  onEdit: () => void
  onMutate: (action: SectionMutation) => void
}) {
  const context = ready?.context
  const contextLabel =
    tab === "diffs" && ready
      ? ready.localTarget.isRepository
        ? `${translateUi("REPOSITÓRIO LOCAL")}: ${ready.localTarget.name} / ${ready.localTarget.branch}`
        : translateUi("NENHUM REPOSITÓRIO LOCAL SELECIONADO")
      : context?.isRepository && context.remote
        ? `${translateUi("REPOSITÓRIO ATUAL")}: ${context.remote.repository}`
        : translateUi("FORA DE UM REPOSITÓRIO · ESCOPO PADRÃO: TODOS")
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={970}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={971}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-configuration-modal"
          focusable
          style={{
            width,
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 2,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
              border: ["bottom"],
              borderColor: COLORS.border,
            }}
          >
            <text content={translateUi("◆ CONFIGURAÇÕES DO GIT")} style={{ fg: COLORS.git }} />
            <InlineButton
              label={translateUi("[Esc] Fechar")}
              accent={COLORS.git}
              onPress={onClose}
            />
          </box>
          <GitConfigurationTabs active={tab} compact={width < 82} onSelect={onSelectTab} />
          {ready ? (
            <text
              content={tab === "diffs" ? contextLabel : `${contextLabel} · ${ready.host}`}
              style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
            />
          ) : null}
          {ready?.scopeMismatch && tab !== "diffs" ? (
            <text
              content={translateUi(
                "PR e Issues usam escopos antigos diferentes; uma seleção em Repositórios sincroniza os dois.",
              )}
              style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
            />
          ) : null}
          <scrollbox
            ref={listRef}
            scrollY
            style={{ flexGrow: 1, marginTop: 1 }}
            verticalScrollbarOptions={{
              trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
            }}
          >
            <GitConfigurationList
              state={state}
              ready={ready}
              tab={tab}
              sections={sections}
              selectedIndex={selectedIndex}
              selectedRepositories={selectedRepositories}
              width={width}
              onSelect={onSelect}
              onToggleRepository={onToggleRepository}
              onConfigureLocal={onConfigureLocal}
            />
          </scrollbox>
          <GitConfigurationFooter
            state={state}
            tab={tab}
            selected={selected}
            canDelete={selected && sections.length > 1}
            pendingDelete={pendingDelete}
            onReload={onReload}
            onCreate={onCreate}
            onEdit={onEdit}
            onMutate={onMutate}
          />
          {notice ? (
            <text content={notice} style={{ height: 1, flexShrink: 0, fg: COLORS.warning }} />
          ) : null}
        </box>
      </box>
    </>
  )
}
