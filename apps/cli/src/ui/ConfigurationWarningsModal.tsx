import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import type { ConfigurationWarning } from "@xupon/tuiminal-core/config/index"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useEffect, useRef } from "react"

/** Mounted only while open; invalid configuration must not hide later diagnostics. */
export function ConfigurationWarningsModal({
  warnings,
  onClose,
}: {
  warnings: readonly ConfigurationWarning[]
  onClose: () => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const height = Math.max(1, Math.min(22, terminal.height - 2))
  useEffect(() => {
    const previous = renderer.currentFocusedRenderable
    previous?.blur()
    dialog.current?.focus()
    return () => {
      if (!renderer.isDestroyed && previous && !previous.isDestroyed) previous.focus()
    }
  }, [renderer])
  useKeyboard((key) => {
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onClose()
    else if (key.name === "up" || key.name === "down")
      scroll.current?.scrollBy(key.name === "up" ? -1 : 1)
    else if (key.name === "pageup" || key.name === "pagedown")
      scroll.current?.scrollBy((key.name === "pageup" ? -1 : 1) * Math.max(1, height - 4))
    else if (key.name === "home") scroll.current?.scrollTo(0)
    else if (key.name === "end") scroll.current?.scrollTo(scroll.current.scrollHeight)
  })
  return (
    <ModalSurface
      id="configuration-warnings"
      dialogRef={dialog}
      width={Math.max(1, Math.min(96, terminal.width - 2))}
      height={height}
      zIndex={1100}
      borderColor={COLORS.warning}
      onBackdropPress={onClose}
    >
      <text
        content={`YAML · ${translateUi("Configurações")}`}
        height={1}
        fg={COLORS.warning}
        flexShrink={0}
      />
      <scrollbox
        id="configuration-warnings-details"
        ref={scroll}
        scrollY
        style={{ flexGrow: 1, minHeight: 0 }}
      >
        <text
          content={warnings.map(({ file, message }) => `${file}\n${message}`).join("\n\n")}
          wrapMode="word"
          flexShrink={0}
          fg={COLORS.text}
        />
      </scrollbox>
      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
        <ShortcutText content="[↑/↓] [PageUp/PageDown]" />
        <InlineButton
          id="configuration-warnings-close"
          label="[Esc] Fechar"
          accent={COLORS.warning}
          onPress={onClose}
        />
      </box>
    </ModalSurface>
  )
}
