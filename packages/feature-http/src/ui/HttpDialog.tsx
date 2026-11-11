import { type BoxRenderable, TextAttributes } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import type { ReactNode, Ref } from "react"
import { HttpDialogContent } from "./HttpDialogContent"
import { type HttpDialogAction, HttpDialogFooter, httpDialogActionRows } from "./HttpDialogFooter"

/** HTTP owns each dialog's keyboard and form state; core owns the modal surface. */
export function HttpDialog({
  id,
  title,
  width,
  height,
  fitContent = false,
  terminalWidth,
  terminalHeight,
  children,
  onClose,
  accent = COLORS.http,
  zIndex = 110,
  closeLabel = "[Esc] Fechar",
  closeId,
  closeRef,
  dialogRef,
  busy = false,
  actions,
  scrollContent = false,
}: {
  id: string
  title: string
  width: number
  height: number
  fitContent?: boolean
  terminalWidth: number
  terminalHeight: number
  children: ReactNode
  onClose: () => void
  accent?: string
  zIndex?: number
  closeLabel?: string
  closeId?: string
  closeRef?: Ref<ButtonRenderable>
  dialogRef?: Ref<BoxRenderable>
  busy?: boolean
  actions?: readonly HttpDialogAction[]
  /** Short forms scroll their details while keeping actions available on small terminals. */
  scrollContent?: boolean
}) {
  const boundedWidth = Math.max(1, Math.min(width, terminalWidth - 2))
  const boundedHeight = Math.max(1, Math.min(height, terminalHeight - 2))
  const short = terminalHeight < 20
  const intrinsic = fitContent
  const titleWidth = Math.max(
    1,
    boundedWidth - (actions ? 4 : displayWidth(translateUi(closeLabel)) + 6),
  )
  const close = {
    id: closeId ?? `${id}-close`,
    label: closeLabel,
    onPress: onClose,
    disabled: busy,
    ...(closeRef ? { buttonRef: closeRef } : {}),
  }
  const rows = actions
    ? httpDialogActionRows(Math.max(1, boundedWidth - 4), [close, ...actions])
    : []
  const headerGap = short || (fitContent && !actions) ? 0 : 1
  const footerGap = !actions || short ? 0 : 1
  const bodyHeight = Math.max(1, boundedHeight - 3 - headerGap - footerGap - rows.length)
  return (
    <ModalSurface
      id={id}
      width={boundedWidth}
      height={boundedHeight}
      fitContent={intrinsic}
      zIndex={zIndex}
      borderColor={accent}
      backgroundColor={COLORS.panel}
      backdropOpacity={0.75}
      onBackdropPress={() => {}}
      {...(dialogRef ? { dialogRef } : {})}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panel,
          marginBottom: headerGap,
        }}
      >
        <text
          content={truncateDisplay(translateUi(title), titleWidth)}
          id={`${id}-title`}
          wrapMode="none"
          attributes={TextAttributes.BOLD}
          style={{ fg: COLORS.text, bg: COLORS.panel, flexGrow: 1 }}
        />
        {!actions && <InlineButton {...close} accent={COLORS.http} />}
      </box>
      {scrollContent ? (
        <HttpDialogContent id={id} fitContent={intrinsic} height={bodyHeight}>
          {children}
        </HttpDialogContent>
      ) : (
        <box
          style={{
            flexGrow: intrinsic ? 0 : 1,
            minHeight: 0,
          }}
        >
          {children}
        </box>
      )}
      {actions && (
        <box style={{ flexShrink: 0, marginTop: footerGap }}>
          <HttpDialogFooter id={id} closeId={close.id} rows={rows} />
        </box>
      )}
    </ModalSurface>
  )
}
