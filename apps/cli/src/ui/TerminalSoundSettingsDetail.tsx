import { useKeyboard } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  TERMINAL_AGENT_SOUND_OPTIONS,
  type TerminalAgentSoundEvent,
  type TerminalAgentSounds,
} from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { previewTerminalAgentSound } from "../features/components"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"

const EVENTS = ["question", "completed", "error"] as const
const LABELS = {
  question: "Pergunta ou aprovação",
  completed: "Tarefa concluída",
  error: "Erro do agente",
}

export function TerminalSoundSettingsDetail({
  sounds,
  onChange,
  notice,
  compact,
  contentWidth,
}: {
  sounds: TerminalAgentSounds
  onChange: ((sounds: TerminalAgentSounds) => void) | undefined
  notice: string
  compact: boolean
  contentWidth: number
}) {
  const [selected, setSelected] = useState<TerminalAgentSoundEvent>("question")
  const [previewStatus, setPreviewStatus] = useState("")
  const preview = useRef<AbortController | null>(null)
  useEffect(() => () => preview.current?.abort(), [])
  const change = (event: TerminalAgentSoundEvent, direction: -1 | 1) => {
    setSelected(event)
    const options = [null, ...TERMINAL_AGENT_SOUND_OPTIONS[event]]
    const index = options.indexOf(sounds[event])
    onChange?.({
      ...sounds,
      [event]: options[(index + direction + options.length) % options.length],
    })
  }
  const listen = async (event: TerminalAgentSoundEvent) => {
    const id = sounds[event]
    if (!id) return
    setSelected(event)
    preview.current?.abort()
    const controller = new AbortController()
    preview.current = controller
    setPreviewStatus("Reproduzindo som…")
    const result = await previewTerminalAgentSound(id, controller.signal)
    if (controller.signal.aborted) return
    setPreviewStatus(
      result === "played"
        ? "Som reproduzido"
        : result === "unavailable"
          ? "Nenhum reprodutor de áudio disponível."
          : result === "cancelled"
            ? ""
            : "Não foi possível reproduzir o som. Verifique a saída de áudio.",
    )
  }
  useKeyboard((key) => {
    if (key.ctrl || key.meta || key.option) return
    const event = EVENTS[Number(key.name) - 1]
    if (event) setSelected(event)
    else if (key.name === "h" || key.name === "left") change(selected, -1)
    else if (key.name === "l" || key.name === "right") change(selected, 1)
    else if (key.name === "p") void listen(selected)
    else return
    key.preventDefault()
    key.stopPropagation()
  })
  return (
    <>
      <ConfigurationDetailHeader
        section="terminalSounds"
        notice={notice}
        compact={compact}
        contentWidth={contentWidth}
        hint="[1/2/3] evento · [H/L/←/→] som · [P] ouvir"
      />
      <text
        content="Sons exclusivos do Term Agents. Escolha Sem som para silenciar um evento."
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      {EVENTS.map((event, index) => (
        <box key={event} style={{ height: 3, flexShrink: 0 }}>
          <InlineButton
            id={`configuration-sound-${event}`}
            label={`[${index + 1}] ${translateUi(LABELS[event])}`}
            accent={COLORS.terminal}
            active={selected === event}
            onPress={() => setSelected(event)}
          />
          <box style={{ height: 1, flexDirection: "row", gap: 1 }}>
            <InlineButton
              id={`configuration-sound-${event}-previous`}
              label="‹"
              onPress={() => change(event, -1)}
            />
            <text
              content={sounds[event] ?? translateUi("Sem som")}
              style={{ width: 12, fg: COLORS.text }}
            />
            <InlineButton
              id={`configuration-sound-${event}-next`}
              label="›"
              onPress={() => change(event, 1)}
            />
            <InlineButton
              id={`configuration-sound-${event}-preview`}
              label={selected === event ? "[P] Ouvir" : "Ouvir"}
              disabled={!sounds[event]}
              onPress={() => void listen(event)}
            />
          </box>
        </box>
      ))}
      <text
        id="configuration-sound-status"
        content={translateUi(previewStatus)}
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
      <text
        content="O som toca no computador onde o Tuiminal está executando."
        style={{ fg: COLORS.muted, flexShrink: 0 }}
      />
    </>
  )
}
