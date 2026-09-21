import { ScrollBoxRenderable, type InputRenderable } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { TERMINAL_MASTER_KEYS, type TerminalMasterKey } from "@xupon/tuiminal-core/settings/theme"
import { COLORS, type UiSettings } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"

export function TerminalSettingsDetail({
  settings,
  notice,
  compact,
  contentWidth,
  onChange,
  onAgentCommandsChange,
}: {
  settings: UiSettings
  notice: string
  compact: boolean
  contentWidth: number
  onAgentCommandsChange: ((commands: string[]) => void) | undefined
  onChange: ((key: TerminalMasterKey) => void) | undefined
}) {
  const input = useRef<InputRenderable | null>(null)
  const savedCommands = settings.terminalAgentCommands.join(", ")
  const [commands, setCommands] = useState(savedCommands)
  useEffect(() => {
    setCommands(savedCommands)
  }, [savedCommands])
  const focusCommands = () => {
    input.current?.focus()
    let parent = input.current?.parent
    while (parent) {
      if (parent instanceof ScrollBoxRenderable)
        parent.scrollChildIntoView("configuration-terminal-agent-input")
      parent = parent.parent
    }
  }
  useKeyboard((key) => {
    if (!input.current?.focused && key.name === "i" && !key.ctrl && !key.meta) {
      key.preventDefault()
      key.stopPropagation()
      focusCommands()
    }
    if (input.current?.focused && key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      input.current.blur()
    }
  })
  return (
    <>
      <ConfigurationDetailHeader
        section="terminal"
        notice={notice}
        compact={compact}
        contentWidth={contentWidth}
      />
      <text content="Master Key" style={{ fg: COLORS.terminal, height: 1 }} />
      <text
        content="Pressione a Master Key e depois uma ação. [Esc] cancela; repetir a Master Key a envia ao terminal."
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      {TERMINAL_MASTER_KEYS.map((key) => (
        <InlineButton
          key={key}
          id={`configuration-terminal-${key}`}
          label={`[${key}]`}
          active={key === settings.terminalMasterKey}
          accent={COLORS.terminal}
          onPress={() => onChange?.(key)}
        />
      ))}
      <InlineButton
        label="[I] Comandos de agentes adicionais"
        accent={COLORS.terminal}
        onPress={focusCommands}
      />
      <text
        content="Nomes de executáveis ou módulos, separados por vírgula. [Enter] salva."
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      <input
        id="configuration-terminal-agent-input"
        ref={input}
        value={commands}
        placeholder={translateUi("meu-agente, equipe.assistente")}
        onInput={setCommands}
        onMouseDown={focusCommands}
        onSubmit={() => onAgentCommandsChange?.(commands.split(","))}
        style={{
          width: "100%",
          backgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedBackgroundColor: COLORS.panelRaised,
          focusedTextColor: COLORS.text,
        }}
      />
      <InlineButton
        label="[Enter] Salvar"
        onPress={() => onAgentCommandsChange?.(commands.split(","))}
      />
    </>
  )
}
