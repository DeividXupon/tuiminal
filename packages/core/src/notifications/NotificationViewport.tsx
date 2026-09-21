import { useTerminalDimensions } from "@opentui/react"
import { translateUi } from "../i18n/index"
import { COLORS } from "../settings/theme"
import { BRAND_COLOR } from "../ui/brand"
import {
  notificationAnimationFrame,
  notificationProgress,
  type AppNotification,
  type NotificationKind,
} from "./model"

type VisibleNotification = {
  notification: AppNotification
  remainingMs: number
  dismissStartedAt: number | null
}

const PRESENTATION: Record<NotificationKind, { icon: string; title: string; color: () => string }> =
  {
    info: { icon: "◆", title: "INFORMAÇÃO", color: () => BRAND_COLOR },
    success: { icon: "✓", title: "SUCESSO", color: () => COLORS.success },
    warning: { icon: "⚠", title: "AVISO", color: () => COLORS.warning },
    error: { icon: "×", title: "ERRO", color: () => COLORS.danger },
  }

const CARD_HEIGHT = 4

export function NotificationViewport({
  notifications,
  now,
  onDismiss,
  onActivate,
  onPause,
  onResume,
}: {
  notifications: VisibleNotification[]
  now: number
  onDismiss: (id: string) => void
  onActivate: (notification: AppNotification) => void
  onPause: () => void
  onResume: () => void
}) {
  const terminal = useTerminalDimensions()
  const maximumVisible = terminal.height < 21 ? 1 : terminal.height < 31 ? 2 : 3
  const visible = notifications.slice(-maximumVisible)
  if (visible.length === 0) return null

  const width = Math.max(18, Math.min(56, terminal.width - 2))
  const left = Math.max(0, terminal.width - width - 1)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The floating stack observes native terminal hover without taking keyboard focus.
    // biome-ignore lint/a11y/useKeyWithMouseEvents: Hover pauses visual timers; it is not an activation that needs a keyboard equivalent.
    <box
      id="app-notification-stack"
      onMouseOver={onPause}
      onMouseOut={onResume}
      style={{
        position: "absolute",
        left,
        top: 1,
        width,
        height: visible.length * CARD_HEIGHT,
        zIndex: 995,
        flexDirection: "column",
      }}
    >
      {visible.map(({ notification, remainingMs, dismissStartedAt }, index) => {
        const presentation = PRESENTATION[notification.kind]
        const accent = presentation.color()
        const motion = notificationAnimationFrame(notification.createdAt, dismissStartedAt, now)
        const progress = notificationProgress(remainingMs, notification.durationMs)
        const progressColumns = Math.max(1, width - 3)
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: Mouse activation is optional; the card remains non-focusable so terminal keyboard focus is preserved.
          <box
            id={`app-notification-${index}`}
            key={notification.id}
            onMouseDown={(event) => {
              if (!notification.onPress || dismissStartedAt !== null) return
              event.preventDefault()
              onActivate(notification)
            }}
            style={{
              position: "relative",
              left: motion.offset,
              width: "100%",
              height: CARD_HEIGHT,
              flexShrink: 0,
              flexDirection: "column",
              overflow: "hidden",
              opacity: motion.opacity,
              backgroundColor: COLORS.panelRaised,
              border: ["left"],
              borderStyle: "rounded",
              borderColor: accent,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <box
              style={{
                height: 1,
                flexShrink: 0,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <text
                content={`${presentation.icon} ${translateUi(notification.title ?? presentation.title)} · ${translateUi(notification.source)}`}
                style={{ fg: accent, flexGrow: 1 }}
              />
              {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI has no button role for a paint-only mouse control; keeping it non-focusable preserves the active workspace focus. */}
              <text
                id={`app-notification-dismiss-${index}`}
                content=" × "
                onMouseDown={(event) => {
                  event.stopPropagation()
                  onDismiss(notification.id)
                }}
                style={{ fg: accent }}
              />
            </box>
            <text
              content={translateUi(notification.message)}
              style={{ height: 2, fg: COLORS.text, wrapMode: "word" }}
            />
            <box
              id={`app-notification-progress-track-${index}`}
              style={{
                position: "relative",
                height: 1,
                flexShrink: 0,
              }}
            >
              <text
                content={"─".repeat(progressColumns)}
                selectable={false}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: 1,
                  fg: COLORS.border,
                  wrapMode: "none",
                }}
              />
              <text
                id={`app-notification-progress-${index}`}
                content={"─".repeat(Math.round(progress * progressColumns))}
                selectable={false}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: 1,
                  fg: accent,
                  wrapMode: "none",
                }}
              />
            </box>
          </box>
        )
      })}
    </box>
  )
}
