import type { ScrollBoxRenderable } from "@opentui/core"
import { type ReactNode, type RefObject, useEffect, useRef } from "react"
import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { GitPartialStagePane } from "../../hooks/use-git-partial-stage"
import { gitActionLabel } from "../../model/base-navigation"
import type {
  GitPartialStageGranularity,
  GitPartialStageItem,
  GitPartialStageSource,
} from "../../model/git-partial-stage"
import type { GitPartialStageState } from "../../services/git-partial-stage"
import { gitPartialStageTargetRowId, GitPartialStageRows } from "./GitPartialStageRows"
import { GitDiffViewport } from "../shared/GitDiffViewport"

export function GitPartialStageToolbar({
  granularity,
  disabled,
  onToggleGranularity,
}: {
  granularity: GitPartialStageGranularity
  disabled: boolean
  onToggleGranularity: () => void
}) {
  return (
    <>
      <text content={translateUi("STAGE PARCIAL · UNIFICADO")} style={{ fg: COLORS.git }} />
      <InlineButton
        id="git-partial-stage-mode-toggle"
        label={translateUi(granularity === "hunk" ? "[S] Modo: hunk" : "[S] Modo: linha")}
        accent={COLORS.git}
        active
        disabled={disabled}
        onPress={onToggleGranularity}
      />
    </>
  )
}

export function GitPartialStageToolbarSlot({
  active,
  granularity,
  disabled,
  onToggleGranularity,
  children,
}: {
  active: boolean
  granularity: GitPartialStageGranularity
  disabled: boolean
  onToggleGranularity: () => void
  children: ReactNode
}) {
  if (!active) return children
  return (
    <GitPartialStageToolbar
      granularity={granularity}
      disabled={disabled}
      onToggleGranularity={onToggleGranularity}
    />
  )
}

export function GitPartialStageActions({
  compact,
  pane,
  cursor,
  targetCount,
  loading,
  running,
  onMove,
  onTransfer,
  onApply,
  onCancel,
}: {
  compact: boolean
  pane: GitPartialStagePane
  cursor: number
  targetCount: number
  loading: boolean
  running: boolean
  onMove: (delta: -1 | 1) => void
  onTransfer: () => void
  onApply: () => void
  onCancel: () => void
}) {
  return (
    <>
      <InlineButton
        id="git-partial-stage-previous"
        label={gitActionLabel(compact, translateUi("[K/↑] Anterior"))}
        accent={COLORS.git}
        disabled={cursor === 0 || loading || running}
        onPress={() => onMove(-1)}
      />
      <InlineButton
        id="git-partial-stage-next"
        label={gitActionLabel(compact, translateUi("[J/↓] Próximo"))}
        accent={COLORS.git}
        disabled={cursor >= targetCount - 1 || loading || running}
        onPress={() => onMove(1)}
      />
      <InlineButton
        id="git-partial-stage-transfer"
        label={gitActionLabel(
          compact,
          translateUi(pane === "available" ? "[Espaço] Enviar →" : "[Espaço] ← Retirar"),
        )}
        accent={COLORS.git}
        disabled={!targetCount || running}
        onPress={onTransfer}
      />
      <InlineButton
        id="git-partial-stage-apply"
        label={gitActionLabel(compact, translateUi("[Enter] Aplicar stage"))}
        accent={COLORS.success}
        disabled={loading || running}
        onPress={onApply}
      />
      <InlineButton
        id="git-partial-stage-cancel"
        label={gitActionLabel(compact, translateUi("[Esc] Aplicar e sair"))}
        accent={COLORS.danger}
        disabled={running}
        onPress={onCancel}
      />
    </>
  )
}

export function GitPartialStageActionSlot({
  active,
  children,
  ...actions
}: {
  active: boolean
  children: ReactNode
} & Parameters<typeof GitPartialStageActions>[0]) {
  if (!active) return children
  return <GitPartialStageActions {...actions} />
}

function GitPartialStagePaneView({
  pane,
  activePane,
  documents,
  loading,
  granularity,
  items,
  currentTargetId,
  width,
  scrollRef,
  onPaneChange,
  onTransfer,
}: {
  pane: GitPartialStagePane
  activePane: GitPartialStagePane
  documents: GitPartialStageState["documents"] | null
  loading: boolean
  granularity: GitPartialStageGranularity
  items: readonly GitPartialStageItem[]
  currentTargetId: string | null
  width: number
  scrollRef: RefObject<ScrollBoxRenderable | null>
  onPaneChange: (pane: GitPartialStagePane) => void
  onTransfer: (targetId: string, pane: GitPartialStagePane) => void
}) {
  const focused = activePane === pane
  const emptyMessage =
    pane === "available"
      ? loading
        ? "Carregando alterações selecionáveis…"
        : "Nenhuma alteração disponível neste modo."
      : "Nenhuma alteração permanecerá no stage."
  const focus = () => onPaneChange(pane)
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking the pane transfers TUI focus.
    <box
      id={`git-partial-stage-${pane}-panel`}
      onMouseDown={focus}
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 12,
        overflow: "hidden",
        ...focusedPanelBorder(focused, COLORS.git),
        backgroundColor: COLORS.panel,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: focused ? COLORS.panelRaised : COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          content={translateUi(pane === "available" ? "FORA DO STAGE" : "NO STAGE")}
          style={{ fg: focused ? COLORS.git : COLORS.muted }}
        />
        <text content={String(items.length)} style={{ fg: COLORS.muted }} />
      </box>
      <GitDiffViewport
        scrollRef={scrollRef}
        id={`git-partial-stage-${pane}`}
        focused={focused}
        onFocus={focus}
      >
        {documents && items.length ? (
          (["staged", "unstaged"] as const).map((source: GitPartialStageSource) => {
            const document = documents[source]
            const targets = items
              .filter((item) => item.source === source)
              .map((item) => item.target)
            return document && targets.length ? (
              <GitPartialStageRows
                key={source}
                document={document}
                source={source}
                pane={pane}
                granularity={granularity}
                targets={targets}
                currentTargetId={focused ? currentTargetId : null}
                width={width}
                onTransfer={(targetId) => onTransfer(targetId, pane)}
                onFocus={focus}
              />
            ) : null
          })
        ) : (
          <ShortcutText
            content={translateUi(emptyMessage)}
            style={{ fg: COLORS.muted, paddingLeft: 1 }}
          />
        )}
      </GitDiffViewport>
    </box>
  )
}

export function GitPartialStage({
  documents,
  loading,
  granularity,
  pane,
  availableTargets,
  selectedTargets,
  currentTargetId,
  width,
  setDiffScrollRef,
  onPaneChange,
  onTransfer,
  onFocus,
}: {
  documents: GitPartialStageState["documents"] | null
  loading: boolean
  granularity: GitPartialStageGranularity
  pane: GitPartialStagePane
  availableTargets: readonly GitPartialStageItem[]
  selectedTargets: readonly GitPartialStageItem[]
  currentTargetId: string | null
  width: number
  setDiffScrollRef: (value: ScrollBoxRenderable | null) => void
  onPaneChange: (pane: GitPartialStagePane) => void
  onTransfer: (targetId: string, pane: GitPartialStagePane) => void
  onFocus: () => void
}) {
  const availableRef = useRef<ScrollBoxRenderable | null>(null)
  const selectedRef = useRef<ScrollBoxRenderable | null>(null)
  useEffect(() => {
    const activeRef = pane === "available" ? availableRef : selectedRef
    setDiffScrollRef(activeRef.current)
    activeRef.current?.focus()
    onFocus()
    return () => setDiffScrollRef(null)
  }, [onFocus, pane, setDiffScrollRef])
  useEffect(() => {
    const activeRef = pane === "available" ? availableRef : selectedRef
    const targets = pane === "available" ? availableTargets : selectedTargets
    const currentTarget = targets.find((target) => target.id === currentTargetId)
    if (!currentTarget) return
    activeRef.current?.scrollChildIntoView(
      gitPartialStageTargetRowId(pane, currentTarget.source, currentTarget.target.id),
    )
  }, [availableTargets, currentTargetId, pane, selectedTargets])

  const paneWidth = Math.max(10, Math.floor((width - LAYOUT.gap) / 2))
  return (
    <box
      id="git-partial-stage-split"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: "row",
        gap: LAYOUT.gap,
        overflow: "hidden",
      }}
    >
      <GitPartialStagePaneView
        pane="available"
        activePane={pane}
        documents={documents}
        loading={loading}
        granularity={granularity}
        items={availableTargets}
        currentTargetId={currentTargetId}
        width={paneWidth}
        scrollRef={availableRef}
        onPaneChange={(nextPane) => {
          onPaneChange(nextPane)
          onFocus()
        }}
        onTransfer={onTransfer}
      />
      <GitPartialStagePaneView
        pane="selected"
        activePane={pane}
        documents={documents}
        loading={false}
        granularity={granularity}
        items={selectedTargets}
        currentTargetId={currentTargetId}
        width={paneWidth}
        scrollRef={selectedRef}
        onPaneChange={(nextPane) => {
          onPaneChange(nextPane)
          onFocus()
        }}
        onTransfer={onTransfer}
      />
    </box>
  )
}
