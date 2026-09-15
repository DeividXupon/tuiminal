import { useTerminalDimensions } from "@opentui/react"
import { COLORS, LAYOUT, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { TutorialCompareBranchPicker } from "./GitTutorialComparePicker"
import { TutorialCompareResult } from "./GitTutorialCompareResult"
import { GitTutorialProjectModal } from "./GitTutorialProjectModal"
import type { GitTutorialVisualState } from "./GitTutorialVisualState"

type CompareCardProps = {
  id?: string | undefined
  title: string
  value: string
  description: string
  shortcut: string
  width: number
  dense: boolean
  onPress: () => void
}

const COMPLETE_COMPARE_STATES = new Set<GitTutorialVisualState>(["compare-result", "compare-split"])

function selectorCardWidth(width: number, horizontal: boolean) {
  if (horizontal) return Math.max(28, Math.min(42, Math.floor((width - 12) / 3)))
  return Math.max(34, Math.min(68, width - 8))
}

function selectorTarget(
  state: GitTutorialVisualState,
  openState: GitTutorialVisualState,
  targetId: string,
) {
  return state === openState ? undefined : targetId
}

function TutorialCompareCard({
  id,
  title,
  value,
  description,
  shortcut,
  width,
  dense,
  onPress,
}: CompareCardProps) {
  const height = dense ? 3 : 5
  return (
    <box {...(id ? { id } : {})} style={{ width, height, flexShrink: 0 }}>
      <box
        style={{
          ...panelBorder(),
          width: "100%",
          height,
          backgroundColor: COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            height: 1,
            flexShrink: 0,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <text content={translateUi(title)} style={{ fg: COLORS.git }} />
          <InlineButton label={shortcut} accent={COLORS.git} onPress={onPress} />
        </box>
        <text content={truncateDisplay(value, width - 4)} style={{ fg: COLORS.text }} />
        {dense ? null : (
          <text
            content={truncateDisplay(translateUi(description), width - 4)}
            style={{ fg: COLORS.muted }}
          />
        )}
      </box>
    </box>
  )
}

function TutorialCompareSelectors({
  state,
  width,
  onPress,
}: {
  state: GitTutorialVisualState
  width: number
  onPress: () => void
}) {
  const complete = COMPLETE_COMPARE_STATES.has(state)
  const baseSelected = complete || state === "compare-compared"
  const horizontal = width >= 110
  const dense = complete || !horizontal
  const cardWidth = selectorCardWidth(width, horizontal)
  const projectTarget = selectorTarget(state, "compare-project", "tutorial-git-compare-project")
  const baseTarget = selectorTarget(state, "compare-base", "tutorial-git-compare-base")
  const comparedTarget = selectorTarget(state, "compare-compared", "tutorial-git-compare-compared")

  return (
    <box
      style={{
        flexGrow: complete ? 0 : 1,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
      }}
    >
      <box
        style={{
          flexDirection: horizontal && complete ? "row" : "column",
          alignItems: "center",
          gap: horizontal && complete ? 1 : 0,
        }}
      >
        <TutorialCompareCard
          id={projectTarget}
          title="PROJETO"
          value="tuiminal"
          description="Repositório local usado pela comparação"
          shortcut="[Ctrl+P]"
          width={cardWidth}
          dense={dense}
          onPress={onPress}
        />
        {horizontal && complete ? null : <text content="↓" style={{ fg: COLORS.git }} />}
        <box
          style={{
            flexDirection: horizontal ? "row" : "column",
            alignItems: "center",
            gap: horizontal ? 1 : 0,
          }}
        >
          <TutorialCompareCard
            id={baseTarget}
            title="BRANCH BASE"
            value={baseSelected ? "main" : "—"}
            description="A branch que será usada como base"
            shortcut="[B]"
            width={cardWidth}
            dense={dense}
            onPress={onPress}
          />
          <box
            id="tutorial-git-compare-range"
            style={{ width: horizontal ? 1 : cardWidth, height: 1, alignItems: "center" }}
          >
            <text content={horizontal ? "→" : "↓"} style={{ fg: COLORS.git }} />
          </box>
          <TutorialCompareCard
            id={comparedTarget}
            title="BRANCH COMPARADA"
            value={complete ? "feature/tutorial" : "—"}
            description="Mudanças desta branch serão exibidas"
            shortcut="[T]"
            width={cardWidth}
            dense={dense}
            onPress={onPress}
          />
        </box>
      </box>
      {complete ? null : (
        <box id="tutorial-git-compare-selectors" style={{ height: 1, flexShrink: 0 }}>
          <text
            content={translateUi(
              "Escolha a branch base e a branch comparada. Nenhum checkout será realizado.",
            )}
            style={{ fg: COLORS.muted }}
          />
        </box>
      )}
    </box>
  )
}

export function GitTutorialCompareView({
  state,
  onPress,
}: {
  state: GitTutorialVisualState
  onPress: () => void
}) {
  const terminal = useTerminalDimensions()
  const split = state === "compare-split"
  const complete = COMPLETE_COMPARE_STATES.has(state)
  return (
    <box
      style={{
        position: "relative",
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        padding: LAYOUT.outerPadding,
        gap: LAYOUT.gap,
      }}
    >
      <TutorialCompareSelectors state={state} width={terminal.width} onPress={onPress} />
      {complete ? <TutorialCompareResult split={split} onPress={onPress} /> : null}
      <box
        id="tutorial-git-compare-navigation"
        style={{
          width: "100%",
          height: 1,
          flexShrink: 0,
          overflow: "hidden",
          backgroundColor: COLORS.panelRaised,
          zIndex: 30,
        }}
      >
        <ShortcutText
          content={translateUi(
            complete
              ? "[Tab/H/L/←/→] Árvore/diff  [J/K] Navegar/rolar  [B] Base  [T] Comparada  [V] Visualização  [R] Atualizar  [C/Esc] Diffs"
              : "[Ctrl+P] Projeto  [B] Base  [T] Comparada  [C/Esc] Diffs",
          )}
          style={{ width: "100%", height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      </box>
      {state === "compare-project" ? (
        <GitTutorialProjectModal
          onPress={onPress}
          targetId="tutorial-git-compare-project"
          targetProjectRow
        />
      ) : null}
      {state === "compare-base" ? (
        <TutorialCompareBranchPicker side="base" onPress={onPress} />
      ) : null}
      {state === "compare-compared" ? (
        <TutorialCompareBranchPicker side="compared" onPress={onPress} />
      ) : null}
    </box>
  )
}
