import { useTerminalDimensions } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"

function TutorialLocalTargetRow({
  id,
  selected,
  title,
  value,
  description,
}: {
  id?: string | undefined
  selected: boolean
  title: string
  value: string
  description: string
}) {
  return (
    <box
      style={{
        height: 3,
        flexShrink: 0,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: selected ? COLORS.panelRaised : COLORS.panel,
      }}
    >
      <box {...(id ? { id } : {})} style={{ height: 2, flexShrink: 0, width: id ? 42 : "100%" }}>
        <text
          content={`${selected ? "▶" : " "} ${translateUi(title)}`}
          style={{ fg: selected ? COLORS.git : COLORS.text }}
        />
        <text content={`  ${value}`} style={{ fg: COLORS.text }} />
      </box>
      <text content={`  ${translateUi(description)}`} style={{ fg: COLORS.muted }} />
    </box>
  )
}

export function GitTutorialProjectModal({
  onPress,
  targetId = "tutorial-git-local-configuration",
  targetProjectRow = false,
}: {
  onPress: () => void
  targetId?: string
  targetProjectRow?: boolean
}) {
  const terminal = useTerminalDimensions()
  const width = Math.max(48, Math.min(92, terminal.width - 6))
  const height = Math.max(14, Math.min(20, terminal.height - 4))
  return (
    <>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={600}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={601}
        alignItems="center"
        justifyContent="center"
      >
        <box
          {...(targetProjectRow ? {} : { id: targetId })}
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
            <text
              content={`${translateUi("◆ CONFIGURAÇÕES")} · GIT`}
              style={{ fg: COLORS.focus }}
            />
            <InlineButton label="Fechar" accent={COLORS.git} onPress={onPress} />
          </box>
          <box style={{ flexGrow: 1, flexDirection: "row" }}>
            <box style={{ width: 27, flexShrink: 0, paddingRight: 1 }}>
              <text content="GIT" style={{ height: 1, flexShrink: 0, fg: COLORS.muted }} />
              <box
                style={{
                  height: 1,
                  flexShrink: 0,
                  flexDirection: "row",
                  backgroundColor: COLORS.panelRaised,
                }}
              >
                <text content="▌" style={{ width: 2, fg: BRAND_COLOR }} />
                <text content={translateUi("DIFFS")} style={{ flexGrow: 1, fg: COLORS.focus }} />
                <ShortcutText content="[Enter]" highlight={false} style={{ fg: BRAND_COLOR }} />
              </box>
              <box style={{ height: 6, flexShrink: 0, paddingTop: 1 }}>
                <text content="GITHUB" style={{ fg: COLORS.muted }} />
                <text content={`  ${translateUi("PULL REQUESTS")}`} style={{ fg: COLORS.text }} />
                <text content={`  ${translateUi("ISSUES")}`} style={{ fg: COLORS.text }} />
                <text content={`  ${translateUi("REPOSITÓRIOS")}`} style={{ fg: COLORS.text }} />
                <text content={`  ${translateUi("NAVEGADOR")}`} style={{ fg: COLORS.text }} />
              </box>
            </box>
            <box
              id="tutorial-git-local-configuration-rows"
              style={{ flexGrow: 1, border: ["left"], borderColor: COLORS.canvas, paddingLeft: 2 }}
            >
              <text
                content={`${translateUi("REPOSITÓRIO LOCAL")}: tuiminal / development`}
                style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
              />
              <box style={{ flexGrow: 1, marginTop: 1 }}>
                <TutorialLocalTargetRow
                  id={targetProjectRow ? targetId : "tutorial-git-local-project-row"}
                  selected
                  title="PROJETO LOCAL"
                  value="tuiminal"
                  description="Escolha qualquer repositório Git local"
                />
                <TutorialLocalTargetRow
                  id="tutorial-git-local-branch-row"
                  selected={false}
                  title="BRANCH LOCAL"
                  value="development"
                  description="Somente branches existentes neste repositório"
                />
              </box>
            </box>
          </box>
        </box>
      </box>
    </>
  )
}
