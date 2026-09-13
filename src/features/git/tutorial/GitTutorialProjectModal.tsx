import { useTerminalDimensions } from "@opentui/react"
import { COLORS } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../shared/ui/ShortcutText"

function TutorialLocalTargetRow({
  id,
  selected,
  title,
  shortcut,
  value,
  description,
}: {
  id?: string | undefined
  selected: boolean
  title: string
  shortcut: string
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
          content={`${selected ? "▶" : " "} ${translateUi(title)}  ${shortcut}`}
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
            <text content={translateUi("◆ CONFIGURAÇÕES DO GIT")} style={{ fg: COLORS.git }} />
            <InlineButton
              label={translateUi("[Esc] Fechar")}
              accent={COLORS.git}
              onPress={onPress}
            />
          </box>
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <InlineButton label="[1] Diffs" accent={COLORS.git} active onPress={onPress} />
            <InlineButton label="[2] PR" accent={COLORS.git} onPress={onPress} />
            <InlineButton label="[3] Issues" accent={COLORS.git} onPress={onPress} />
            <InlineButton label="[4] Repos" accent={COLORS.git} onPress={onPress} />
          </box>
          <text
            content={`${translateUi("REPOSITÓRIO LOCAL")}: tuiminal / development`}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
          <box id="tutorial-git-local-configuration-rows" style={{ flexGrow: 1, marginTop: 1 }}>
            <TutorialLocalTargetRow
              id={targetProjectRow ? targetId : undefined}
              selected
              title="PROJETO LOCAL"
              shortcut="[P]"
              value="tuiminal"
              description="Escolha qualquer repositório Git local"
            />
            <TutorialLocalTargetRow
              selected={false}
              title="BRANCH LOCAL"
              shortcut="[B]"
              value="development"
              description="Somente branches existentes neste repositório"
            />
          </box>
          <ShortcutText
            content={translateUi(
              "[P] Projeto  [B] Branch  [J/K] Navegar  [Enter] Alterar  [1/2/3/4] Aba",
            )}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
