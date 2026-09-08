import { Button } from "@tuiparts/react/button"
import { COLORS } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { PlasmaLoadingOverlay } from "../../../../shared/ui/PlasmaLoadingOverlay"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { GitComparisonContext, GitComparisonRef } from "../../model/branch-comparison"
import { fitLine } from "../../rendering/diff"
import { displayLocalProjectPath } from "../../services/local-target"
import type { GitComparePickerSide } from "./GitCompareBranchPicker"

function ComparisonCard({
  id,
  title,
  value,
  detail,
  hint,
  shortHint,
  width,
  dense,
  onPress,
}: {
  id: string
  title: string
  value: string
  detail: string
  hint: string
  shortHint: string
  width: number
  dense: boolean
  onPress: () => void
}) {
  const height = dense ? 3 : 5
  return (
    <Button id={id} width={width} height={height} flexShrink={0} onPress={onPress}>
      {(state) => (
        <box
          style={{
            width: "100%",
            height,
            border: true,
            borderStyle: "rounded",
            borderColor: state.focused ? COLORS.git : COLORS.border,
            backgroundColor: state.pressed ? COLORS.diffModifiedBg : COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          {dense ? (
            <box style={{ height: 1, flexDirection: "row", justifyContent: "space-between" }}>
              <text
                content={fitLine(`${translateUi(title)}  ${value}`, width - shortHint.length - 6)}
                style={{ fg: COLORS.git }}
              />
              <ShortcutText content={shortHint} style={{ fg: COLORS.muted }} />
            </box>
          ) : (
            <>
              <box style={{ height: 1, flexDirection: "row", justifyContent: "space-between" }}>
                <text content={translateUi(title)} style={{ fg: COLORS.git }} />
                <ShortcutText content={translateUi(hint)} style={{ fg: COLORS.muted }} />
              </box>
              <text content={fitLine(value, width - 4)} style={{ fg: COLORS.text }} />
              <text content={fitLine(detail, width - 4)} style={{ fg: COLORS.muted }} />
            </>
          )}
        </box>
      )}
    </Button>
  )
}

export type ComparisonSelectorArrangement = "setup" | "row" | "column"

export function comparisonSelectorArrangement(
  terminalWidth: number,
  complete: boolean,
): ComparisonSelectorArrangement {
  if (complete) return terminalWidth >= 110 ? "row" : "column"
  return terminalWidth < 82 ? "column" : "setup"
}

function selectorDimensions(terminalWidth: number, arrangement: ComparisonSelectorArrangement) {
  if (arrangement === "row") {
    const cardWidth = Math.max(30, Math.min(46, Math.floor((terminalWidth - 12) / 3)))
    return { cardWidth, projectWidth: cardWidth }
  }
  if (arrangement === "column") {
    const cardWidth = Math.max(34, Math.min(72, terminalWidth - 10))
    return { cardWidth, projectWidth: cardWidth }
  }
  const cardWidth = Math.max(30, Math.min(48, Math.floor((terminalWidth - 18) / 2)))
  return { cardWidth, projectWidth: Math.min(58, cardWidth + 10) }
}

function ProjectCard({
  context,
  width,
  dense,
  onPress,
}: {
  context: GitComparisonContext | null
  width: number
  dense: boolean
  onPress: () => void
}) {
  return (
    <ComparisonCard
      id="git-compare-project"
      title="PROJETO"
      value={context?.repositoryName ?? "—"}
      detail={context ? displayLocalProjectPath(context.root) : translateUi("Carregando projeto…")}
      hint="[Ctrl+P] Alterar"
      shortHint="[Ctrl+P]"
      width={width}
      dense={dense}
      onPress={onPress}
    />
  )
}

function BaseCard({
  reference,
  width,
  dense,
  onPress,
}: {
  reference: GitComparisonRef | null
  width: number
  dense: boolean
  onPress: () => void
}) {
  return (
    <ComparisonCard
      id="git-compare-base"
      title="BRANCH BASE"
      value={reference?.name ?? "—"}
      detail={
        reference
          ? translateUi("A branch que será usada como base")
          : translateUi("Escolha uma branch do projeto")
      }
      hint="[B] Escolher"
      shortHint="[B]"
      width={width}
      dense={dense}
      onPress={onPress}
    />
  )
}

function ComparedCard({
  reference,
  width,
  dense,
  onPress,
}: {
  reference: GitComparisonRef | null
  width: number
  dense: boolean
  onPress: () => void
}) {
  return (
    <ComparisonCard
      id="git-compare-compared"
      title="BRANCH COMPARADA"
      value={reference?.name ?? "—"}
      detail={
        reference
          ? translateUi("Mudanças desta branch serão exibidas")
          : translateUi("Escolha a branch comparada")
      }
      hint="[T] Escolher"
      shortHint="[T]"
      width={width}
      dense={dense}
      onPress={onPress}
    />
  )
}

function ComparisonCards({
  context,
  base,
  compared,
  arrangement,
  dense,
  cardWidth,
  projectWidth,
  onConfigure,
  onPick,
}: {
  context: GitComparisonContext | null
  base: GitComparisonRef | null
  compared: GitComparisonRef | null
  arrangement: ComparisonSelectorArrangement
  dense: boolean
  cardWidth: number
  projectWidth: number
  onConfigure: () => void
  onPick: (side: GitComparePickerSide) => void
}) {
  const projectCard = (
    <ProjectCard context={context} width={projectWidth} dense={dense} onPress={onConfigure} />
  )
  const baseCard = (
    <BaseCard reference={base} width={cardWidth} dense={dense} onPress={() => onPick("base")} />
  )
  const comparedCard = (
    <ComparedCard
      reference={compared}
      width={cardWidth}
      dense={dense}
      onPress={() => onPick("compared")}
    />
  )
  if (arrangement === "setup") {
    return (
      <>
        {projectCard}
        <box style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
          {baseCard}
          <text content="→" style={{ fg: COLORS.git }} />
          {comparedCard}
        </box>
      </>
    )
  }
  const horizontal = arrangement === "row"
  return (
    <box
      style={{
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        gap: horizontal ? 1 : 0,
      }}
    >
      {projectCard}
      {horizontal ? null : <text content="↓" style={{ fg: COLORS.git }} />}
      {baseCard}
      <text content={horizontal ? "→" : "↓"} style={{ fg: COLORS.git }} />
      {comparedCard}
    </box>
  )
}

function SelectorStatus({
  complete,
  loading,
  context,
}: {
  complete: boolean
  loading: boolean
  context: GitComparisonContext | null
}) {
  return (
    <>
      {!complete ? (
        <ShortcutText
          content={translateUi(
            "Escolha a branch base e a branch comparada. Nenhum checkout será realizado.",
          )}
          style={{ fg: COLORS.muted }}
        />
      ) : null}
      {loading ? (
        <text content={translateUi("◷ CARREGANDO BRANCHES…")} style={{ fg: COLORS.git }} />
      ) : null}
      {!loading && context && !context.isRepository ? (
        <text
          content={translateUi("O projeto selecionado não é um repositório Git.")}
          style={{ fg: COLORS.danger }}
        />
      ) : null}
      {!loading && context?.isRepository && !context.refs.length ? (
        <text content={translateUi("Nenhuma branch encontrada.")} style={{ fg: COLORS.muted }} />
      ) : null}
    </>
  )
}

export function GitComparisonSelector({
  context,
  base,
  compared,
  loading,
  terminalWidth,
  complete,
  onConfigure,
  onPick,
}: {
  context: GitComparisonContext | null
  base: GitComparisonRef | null
  compared: GitComparisonRef | null
  loading: boolean
  terminalWidth: number
  complete: boolean
  onConfigure: () => void
  onPick: (side: GitComparePickerSide) => void
}) {
  const arrangement = comparisonSelectorArrangement(terminalWidth, complete)
  const dense = complete || arrangement === "column"
  const { cardWidth, projectWidth } = selectorDimensions(terminalWidth, arrangement)
  return (
    <box
      style={{
        position: "relative",
        flexGrow: complete ? 0 : 1,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
      }}
    >
      <ComparisonCards
        context={context}
        base={base}
        compared={compared}
        arrangement={arrangement}
        dense={dense}
        cardWidth={cardWidth}
        projectWidth={projectWidth}
        onConfigure={onConfigure}
        onPick={onPick}
      />
      <SelectorStatus complete={complete} loading={loading} context={context} />
      <PlasmaLoadingOverlay
        active={loading}
        label="◷ CARREGANDO BRANCHES…"
        accent={COLORS.git}
        background={COLORS.canvas}
      />
    </box>
  )
}
