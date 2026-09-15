import { COLORS, LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { TutorialSplitDiff } from "./GitTutorialStateViews"

export function TutorialDiffPanel({
  layoutDemo,
  onPress,
}: {
  layoutDemo: boolean
  onPress: () => void
}) {
  return (
    <box
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 5,
        overflow: "hidden",
        backgroundColor: LAYOUT.alternatePanel,
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
        <text content="∆ src/features/git/tutorial/steps.ts" style={{ fg: COLORS.git }} />
        <text content="+3  −2  1/9" style={{ fg: COLORS.muted }} />
      </box>
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.diffGutterBg,
        }}
      >
        <text content={`${translateUi("VIEW")}  `} style={{ fg: COLORS.border }} />
        <InlineButton
          {...(layoutDemo ? {} : { id: "tutorial-git-diff-layout" })}
          label={`${layoutDemo ? "" : "[V] "}${translateUi("Unificado")}`}
          accent={COLORS.database}
          active={!layoutDemo}
          onPress={onPress}
        />
        <InlineButton
          label={`${layoutDemo ? "[V] " : ""}${translateUi("2 colunas")}`}
          accent={COLORS.database}
          active={layoutDemo}
          onPress={onPress}
        />
        <InlineButton
          label={translateUi("Intralinha")}
          accent={COLORS.database}
          onPress={onPress}
        />
      </box>
      <box
        id="tutorial-git-diff"
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {layoutDemo ? (
          <TutorialSplitDiff />
        ) : (
          <>
            <text
              content="@@ -18,3 +18,4 @@ export function tutorial"
              style={{ fg: COLORS.git, bg: COLORS.diffHunkBg }}
            />
            <text
              content="  18  18   const screen = localRepository"
              style={{ fg: COLORS.muted }}
            />
            <text
              content="  19       − return oldTutorial"
              style={{ fg: COLORS.danger, bg: COLORS.diffRemovedBg }}
            />
            <text
              content="      19   + return describeWorkspace(screen)"
              style={{ fg: COLORS.success, bg: COLORS.diffAddedBg }}
            />
            <text
              content="      20   + // local data only"
              style={{ fg: COLORS.success, bg: COLORS.diffAddedBg }}
            />
            <text content="  20  21   }" style={{ fg: COLORS.muted }} />
          </>
        )}
      </box>
    </box>
  )
}
