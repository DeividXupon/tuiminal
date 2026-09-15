import {
  COLORS,
  focusedPanelBorder,
  LAYOUT,
  panelBorder,
} from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

function TutorialCompareDiff({ split }: { split: boolean }) {
  return (
    <box
      id={split ? "tutorial-git-compare-layout" : "tutorial-git-compare-diff"}
      style={{
        ...focusedPanelBorder(false, COLORS.git),
        flexGrow: 1,
        minHeight: 4,
        overflow: "hidden",
        backgroundColor: LAYOUT.alternatePanel,
      }}
    >
      <text
        content="◆ src/features/git/tutorial/GitTutorialCompareView.tsx · TSX"
        style={{ height: 1, flexShrink: 0, fg: COLORS.git, bg: COLORS.panelRaised }}
      />
      {split ? (
        <box
          id="tutorial-git-compare-split-preview"
          style={{ flexGrow: 1, flexDirection: "row", gap: 1, overflow: "hidden" }}
        >
          <box style={{ width: "50%", overflow: "hidden" }}>
            <text content="  18  const mode = 'diffs'" style={{ fg: COLORS.muted }} />
            <text
              content="  19  return renderLocalDiffs()"
              style={{ fg: COLORS.danger, bg: COLORS.diffRemovedBg }}
            />
            <text content="  20  }" style={{ fg: COLORS.muted }} />
          </box>
          <box style={{ width: "50%", overflow: "hidden" }}>
            <text content="  18  const mode = 'compare'" style={{ fg: COLORS.muted }} />
            <text
              content="  19  return renderBranchComparison()"
              style={{ fg: COLORS.success, bg: COLORS.diffAddedBg }}
            />
            <text content="  20  }" style={{ fg: COLORS.muted }} />
          </box>
        </box>
      ) : (
        <box style={{ flexGrow: 1, overflow: "hidden" }}>
          <text
            content="@@ -18,3 +18,3 @@ export function GitTutorial"
            style={{ fg: COLORS.git, bg: COLORS.diffHunkBg }}
          />
          <text content="  18  18   const project = 'tuiminal'" style={{ fg: COLORS.muted }} />
          <text
            content="  19       − return renderLocalDiffs()"
            style={{ fg: COLORS.danger, bg: COLORS.diffRemovedBg }}
          />
          <text
            content="      19   + return renderBranchComparison()"
            style={{ fg: COLORS.success, bg: COLORS.diffAddedBg }}
          />
          <text content="  20  20   }" style={{ fg: COLORS.muted }} />
        </box>
      )}
    </box>
  )
}

export function TutorialCompareResult({ split, onPress }: { split: boolean; onPress: () => void }) {
  return (
    <box
      style={{
        ...panelBorder(),
        position: "relative",
        flexGrow: 1,
        minHeight: 7,
        backgroundColor: COLORS.panel,
      }}
    >
      <box
        id="tutorial-git-compare-summary"
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
        <text content="main → feature/tutorial" style={{ fg: COLORS.git }} />
        <text content={`2 ${translateUi("ARQUIVOS")}  +27 −8`} style={{ fg: COLORS.muted }} />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.diffGutterBg,
        }}
      >
        <InlineButton
          {...(split ? {} : { id: "tutorial-git-compare-layout" })}
          label={`${split ? "" : "[V] "}${translateUi("Unificado")}`}
          accent={COLORS.database}
          active={!split}
          onPress={onPress}
        />
        <InlineButton
          label={`${split ? "[V] " : ""}${translateUi("2 colunas")}`}
          accent={COLORS.database}
          active={split}
          onPress={onPress}
        />
        <InlineButton
          label={translateUi("Intralinha")}
          accent={COLORS.database}
          onPress={onPress}
        />
      </box>
      <box style={{ flexGrow: 1, minHeight: 3, flexDirection: "row", gap: 1 }}>
        <box
          id="tutorial-git-compare-files"
          style={{
            ...focusedPanelBorder(true, COLORS.git),
            width: 31,
            flexShrink: 0,
            backgroundColor: COLORS.panel,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text content={`${translateUi("ARQUIVOS")} 2`} style={{ fg: COLORS.git }} />
          <text content="▾ src/" style={{ fg: COLORS.graphAccent }} />
          <text content="  ▾ features/" style={{ fg: COLORS.graphAccent }} />
          <text content="    ▾ git/" style={{ fg: COLORS.graphAccent }} />
          <text
            content="      ▶ tutorial/GitTutorialCompareView.tsx"
            style={{ fg: COLORS.git, bg: COLORS.panelRaised }}
          />
          <text
            content="      shared/i18n/git-compare-tutorial-catalog.ts"
            style={{ fg: COLORS.text }}
          />
        </box>
        <TutorialCompareDiff split={split} />
      </box>
    </box>
  )
}
