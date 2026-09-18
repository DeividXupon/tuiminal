import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { RUNNER_YAML_GUIDE, runnerYamlGuideIndex } from "../model/yaml-guide"

export function RunnerYamlGuide({
  currentKey,
  onClose,
}: {
  currentKey: string
  onClose: () => void
}) {
  const terminal = useTerminalDimensions()
  const content = useRef<ScrollBoxRenderable | null>(null)
  const [index, setIndex] = useState(() => runnerYamlGuideIndex(currentKey))
  const topic = RUNNER_YAML_GUIDE[index]!
  const navigate = (delta: number) => {
    setIndex((current) => Math.max(0, Math.min(RUNNER_YAML_GUIDE.length - 1, current + delta)))
    content.current?.scrollTo(0)
    content.current?.focus()
  }
  useEffect(() => {
    content.current?.focus()
  }, [])
  useKeyboard((key) => {
    if (["escape", "f1", "left", "right"].includes(key.name) || key.ctrl) {
      key.preventDefault()
      key.stopPropagation()
      if (key.name === "escape" || key.name === "f1") onClose()
      else if (key.name === "left") navigate(-1)
      else if (key.name === "right") navigate(1)
    }
  })
  return (
    <ModalSurface
      id="runner-config-guide"
      width={Math.max(1, Math.min(110, terminal.width - 4))}
      height={Math.max(1, terminal.height - 4)}
      zIndex={985}
      borderColor={COLORS.runner}
      onBackdropPress={onClose}
    >
      <box height={1} flexDirection="row" justifyContent="space-between">
        <text content={translateUi("TUTORIAL YAML DO RUNNER")} fg={COLORS.runner} />
        <InlineButton
          id="runner-config-guide-close"
          label="[Esc] Voltar ao YAML"
          onPress={onClose}
          accent={COLORS.runner}
        />
      </box>
      <text
        content={`${index + 1}/${RUNNER_YAML_GUIDE.length} · ${translateUi(topic.title)}`}
        fg={COLORS.text}
        height={1}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Native scrollbox is focusable and owns arrow/Page Up/Down navigation. */}
      <scrollbox
        ref={content}
        id="runner-config-guide-content"
        focusable
        scrollY
        flexGrow={1}
        minHeight={1}
        onMouseDown={() => content.current?.focus()}
      >
        {topic.fields.map((field) => (
          <box key={field.names.join()} flexShrink={0} marginBottom={1}>
            <text content={field.names.join(" · ")} fg={COLORS.runner} />
            <text content={translateUi(field.help)} fg={COLORS.text} />
          </box>
        ))}
        <text content={translateUi("Exemplo YAML")} fg={COLORS.runner} />
        <text content={topic.example} fg={COLORS.text} flexShrink={0} bg={COLORS.panelRaised} />
      </scrollbox>
      <box height={1} flexDirection="row" justifyContent="space-between">
        <InlineButton
          id="runner-config-guide-previous"
          label="[←] Anterior"
          disabled={index === 0}
          onPress={() => navigate(-1)}
          accent={COLORS.runner}
        />
        <InlineButton
          id="runner-config-guide-up"
          label="[↑] Rolar"
          onPress={() => content.current?.scrollBy(-3)}
          accent={COLORS.runner}
        />
        <InlineButton
          id="runner-config-guide-down"
          label="[↓] Rolar"
          onPress={() => content.current?.scrollBy(3)}
          accent={COLORS.runner}
        />
        <InlineButton
          id="runner-config-guide-next"
          label="[→] Próximo"
          disabled={index === RUNNER_YAML_GUIDE.length - 1}
          onPress={() => navigate(1)}
          accent={COLORS.runner}
        />
      </box>
    </ModalSurface>
  )
}
