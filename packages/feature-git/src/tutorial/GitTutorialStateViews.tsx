import { COLORS, focusedPanelBorder, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { DIFF_SYNTAX_STYLE } from "../rendering/constants"

const GRAPH_ROWS = [
  ["●", "ac0d327", "DX", "‹development›", "keyboard workflows", "0m"],
  ["│ ○", "91c2f06", "BA", "‹feature/tutorial›", "guided Git tutorial", "12m"],
  ["│ ●", "7be85a1", "DX", "", "partial stage by hunk", "24m"],
  ["● │", "36d8ab1", "DX", "‹main›", "local Git workspace", "1d"],
  ["│/", "e04b8c2", "MA", "", "command console", "1d"],
] as const

const GRAPH_COLORS = [COLORS.git, COLORS.graphAccent, COLORS.success, COLORS.warning] as const

export function TutorialGitGraphView({ width }: { width: number }) {
  return (
    <box
      id="tutorial-git-open-graph"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        overflow: "hidden",
        backgroundColor: COLORS.panel,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content={translateUi("Árvore Git em tela cheia")} style={{ fg: COLORS.git }} />
        <text content="5" style={{ fg: COLORS.muted }} />
      </box>
      <box id="tutorial-git-graph-rows" style={{ flexGrow: 1, overflow: "hidden" }}>
        {GRAPH_ROWS.map(([graph, hash, author, refs, subject, date], index) => {
          const selected = index === 0
          return (
            <box
              key={hash}
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                backgroundColor: selected ? COLORS.panelRaised : COLORS.panel,
              }}
            >
              <text
                content={`${graph.padEnd(5)} ${author} `}
                style={{
                  width: 9,
                  flexShrink: 0,
                  fg: GRAPH_COLORS[index % GRAPH_COLORS.length] ?? COLORS.git,
                  bg: selected ? COLORS.panelRaised : COLORS.panel,
                }}
              />
              <text
                content={truncateDisplay(
                  `${hash}${refs ? `  ${refs}` : ""}  ${subject}`,
                  Math.max(10, width - 24),
                )}
                style={{ flexGrow: 1, fg: COLORS.text }}
              />
              <text content={date.padStart(7)} style={{ width: 8, fg: COLORS.muted }} />
            </box>
          )
        })}
      </box>
    </box>
  )
}

export function TutorialGraphActions({ onPress }: { onPress: () => void }) {
  return (
    <box
      style={{
        height: 1,
        flexShrink: 0,
        flexDirection: "row",
        backgroundColor: COLORS.panelRaised,
      }}
    >
      <InlineButton label={translateUi("[K/↑] Anterior")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[J/↓] Próximo")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label="[Enter] Abrir commit" accent={COLORS.git} onPress={onPress} />
      <InlineButton label={translateUi("[O] Lista")} accent={COLORS.git} onPress={onPress} />
      <InlineButton label="[G] Voltar ao diff" accent={COLORS.database} active onPress={onPress} />
    </box>
  )
}

function TutorialCodeLine({
  oldLine,
  newLine,
  marker,
  content,
  tone = "context",
}: {
  oldLine: string
  newLine: string
  marker: string
  content: string
  tone?: "context" | "added" | "removed"
}) {
  const foreground =
    tone === "added" ? COLORS.success : tone === "removed" ? COLORS.danger : COLORS.muted
  const background =
    tone === "added" ? COLORS.diffAddedBg : tone === "removed" ? COLORS.diffRemovedBg : COLORS.panel
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: background }}>
      <text
        content={`${oldLine.padStart(3)} ${newLine.padStart(3)} ${marker} `}
        style={{ width: 10, flexShrink: 0, fg: foreground, bg: background }}
      />
      <code
        content={content}
        filetype="typescript"
        syntaxStyle={DIFF_SYNTAX_STYLE}
        bg={background}
        wrapMode="none"
        truncate
        style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, height: 1 }}
      />
    </box>
  )
}

function TutorialSplitPane({ side, added }: { side: "−" | "+"; added: boolean }) {
  return (
    <box
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 12,
        overflow: "hidden",
        backgroundColor: COLORS.panel,
      }}
    >
      <text
        content={`${side} src/features/git/tutorial/steps.ts`}
        style={{
          height: 1,
          flexShrink: 0,
          fg: added ? COLORS.success : COLORS.danger,
          bg: COLORS.panelRaised,
        }}
      />
      <text
        content="@@ -18,3 +18,4 @@ export function tutorial"
        style={{ fg: COLORS.git, bg: COLORS.diffHunkBg }}
      />
      <TutorialCodeLine
        oldLine="18"
        newLine="18"
        marker=" "
        content="const screen = localRepository"
      />
      {added ? (
        <>
          <TutorialCodeLine
            oldLine=""
            newLine="19"
            marker="+"
            content="return describeWorkspace(screen)"
            tone="added"
          />
          <TutorialCodeLine
            oldLine=""
            newLine="20"
            marker="+"
            content="// local data only"
            tone="added"
          />
        </>
      ) : (
        <TutorialCodeLine
          oldLine="19"
          newLine=""
          marker="−"
          content="return oldTutorial"
          tone="removed"
        />
      )}
      <TutorialCodeLine oldLine="20" newLine="21" marker=" " content="}" />
    </box>
  )
}

export function TutorialSplitDiff() {
  return (
    <box
      id="tutorial-git-diff-layout"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexDirection: "row",
        gap: LAYOUT.gap,
        overflow: "hidden",
      }}
    >
      <box
        id="tutorial-git-layout-split-preview"
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: "row",
          gap: LAYOUT.gap,
          overflow: "hidden",
        }}
      >
        <TutorialSplitPane side="−" added={false} />
        <TutorialSplitPane side="+" added />
      </box>
    </box>
  )
}

function TutorialPartialPane({ selected, active }: { selected: boolean; active: boolean }) {
  return (
    <box
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 12,
        overflow: "hidden",
        ...focusedPanelBorder(active, COLORS.git),
        backgroundColor: COLORS.panel,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: active ? COLORS.panelRaised : COLORS.panel,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          content={translateUi(selected ? "NO STAGE" : "FORA DO STAGE")}
          style={{ fg: active ? COLORS.git : COLORS.muted }}
        />
        <text content={selected ? "1" : "2"} style={{ fg: COLORS.muted }} />
      </box>
      <box
        style={{
          height: selected ? 4 : 5,
          flexShrink: 0,
          overflow: "hidden",
          ...(active
            ? {
                border: ["left"] as const,
                borderStyle: "single" as const,
                borderColor: COLORS.git,
              }
            : { paddingLeft: 1 }),
        }}
      >
        <text
          content={selected ? "@@ -31,2 +31,3 @@ footer" : "@@ -18,3 +18,4 @@ tutorial"}
          style={{ fg: active ? COLORS.text : COLORS.git, bg: COLORS.diffHunkBg }}
        />
        {selected ? (
          <>
            <TutorialCodeLine oldLine="31" newLine="31" marker=" " content="renderFooter()" />
            <TutorialCodeLine
              oldLine=""
              newLine="32"
              marker="+"
              content="showContextualKeys()"
              tone="added"
            />
          </>
        ) : (
          <>
            <TutorialCodeLine
              oldLine="18"
              newLine="18"
              marker=" "
              content="const screen = localRepository"
            />
            <TutorialCodeLine
              oldLine="19"
              newLine=""
              marker="−"
              content="return oldTutorial"
              tone="removed"
            />
            <TutorialCodeLine
              oldLine=""
              newLine="19"
              marker="+"
              content="return describeWorkspace(screen)"
              tone="added"
            />
          </>
        )}
      </box>
    </box>
  )
}

export function TutorialPartialStageView({ onPress }: { onPress: () => void }) {
  return (
    <box id="tutorial-git-partial-stage" style={{ flexGrow: 1, flexShrink: 1, overflow: "hidden" }}>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content="∆ src/features/git/tutorial/steps.ts" style={{ fg: COLORS.git }} />
        <text content="+2  −1" style={{ fg: COLORS.muted }} />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.diffGutterBg,
        }}
      >
        <text content={translateUi("STAGE PARCIAL · UNIFICADO")} style={{ fg: COLORS.git }} />
        <InlineButton
          label={translateUi("[S] Modo: hunk")}
          accent={COLORS.git}
          active
          onPress={onPress}
        />
      </box>
      <box
        id="tutorial-git-partial-stage-panes"
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: "row",
          gap: LAYOUT.gap,
          overflow: "hidden",
        }}
      >
        <TutorialPartialPane selected={false} active />
        <TutorialPartialPane selected active={false} />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          overflow: "hidden",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <InlineButton label={translateUi("[K/↑] Anterior")} accent={COLORS.git} onPress={onPress} />
        <InlineButton label={translateUi("[J/↓] Próximo")} accent={COLORS.git} onPress={onPress} />
        <InlineButton
          label={translateUi("[Espaço] Enviar →")}
          accent={COLORS.git}
          onPress={onPress}
        />
        <InlineButton
          label={translateUi("[Enter] Aplicar stage")}
          accent={COLORS.success}
          onPress={onPress}
        />
        <InlineButton
          label={translateUi("[Esc] Aplicar e sair")}
          accent={COLORS.danger}
          onPress={onPress}
        />
      </box>
    </box>
  )
}
