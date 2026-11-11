import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { ReactNode } from "react"

/** Fixed labels are localized; children and values retain their original user content. */
export function HttpDialogSection({
  title,
  children,
  accent = COLORS.http,
}: {
  title?: string
  children: ReactNode
  accent?: string
}) {
  return (
    <box
      style={{
        flexShrink: 0,
        border: ["left"],
        borderColor: accent,
        paddingLeft: 1,
        backgroundColor: COLORS.canvas,
      }}
    >
      {title && <text content={translateUi(title)} style={{ fg: COLORS.muted, flexShrink: 0 }} />}
      {children}
    </box>
  )
}

export function HttpDialogNotice({ text, warning = false }: { text: string; warning?: boolean }) {
  return (
    <text
      content={translateUi(text)}
      wrapMode="word"
      style={{ flexShrink: 0, fg: warning ? COLORS.warning : COLORS.muted }}
    />
  )
}
