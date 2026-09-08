import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { COLORS } from "../../../core/settings/theme"
import { displayWidth, translateUi } from "../../../shared/i18n/index"

export function HttpOpaqueRequestContent({
  requestId,
  rawText,
  registerScroll,
  onFocus,
  active,
}: {
  requestId: string
  rawText: string
  registerScroll: (scroll: ScrollBoxRenderable | null) => void
  onFocus: () => void
  active: boolean
}) {
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const lines = rawText.split(/\r?\n/)
  const width = Math.max(1, ...lines.map(displayWidth))
  useEffect(() => {
    if (active) scrollRef.current?.focus()
  }, [active])
  return (
    <>
      <text
        content={`${translateUi("SOMENTE LEITURA · RECURSO .HTTP NÃO SUPORTADO")} · ${translateUi("Raw")}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
      />
      <text
        content={translateUi(
          "Este request usa recursos .http que o Tuiminal ainda não executa com segurança.",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the native scroll pane needs mouse focus for keyboard scrolling. */}
      <scrollbox
        ref={(scroll) => {
          scrollRef.current = scroll
          registerScroll(scroll)
        }}
        id={`http-request-raw-${requestId}`}
        scrollX
        scrollY
        viewportCulling
        onMouseDown={() => {
          onFocus()
          scrollRef.current?.focus()
        }}
        style={{ flexGrow: 1, backgroundColor: COLORS.canvas }}
      >
        <text
          content={rawText || " "}
          style={{ width, height: Math.max(1, lines.length), fg: COLORS.text }}
        />
      </scrollbox>
    </>
  )
}
