import { useTerminalDimensions } from "@opentui/react"
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { COLORS, LAYOUT } from "../../core/settings/theme"
import { translateUi } from "../i18n/index"
import {
  appendNotification,
  defaultNotificationDuration,
  inferNotificationKind,
  type AppNotification,
  type NotificationInput,
  type NotificationKind,
} from "./model"

type NotificationApi = {
  notify: (input: NotificationInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

const NOOP_API: NotificationApi = {
  notify: () => "notification-unmounted",
  dismiss: () => undefined,
  clear: () => undefined,
}

const NotificationContext = createContext<NotificationApi>(NOOP_API)

const PRESENTATION: Record<NotificationKind, { icon: string; title: string; color: () => string }> =
  {
    info: { icon: "◆", title: "INFORMAÇÃO", color: () => COLORS.focus },
    success: { icon: "✓", title: "SUCESSO", color: () => COLORS.success },
    warning: { icon: "⚠", title: "AVISO", color: () => COLORS.warning },
    error: { icon: "×", title: "ERRO", color: () => COLORS.danger },
  }

function NotificationViewport({
  notifications,
  onDismiss,
}: {
  notifications: AppNotification[]
  onDismiss: (id: string) => void
}) {
  const terminal = useTerminalDimensions()
  const maximumVisible = terminal.height < 21 ? 1 : terminal.height < 31 ? 2 : 3
  const visible = notifications.slice(-maximumVisible)
  const width = Math.max(18, Math.min(56, terminal.width - 2))
  const height = LAYOUT.compact ? 4 : 5
  const spacing = LAYOUT.compact ? 0 : 1
  const slotHeight = height + spacing
  const left = Math.max(0, terminal.width - width - 1)

  return visible.map((notification, index) => {
    const presentation = PRESENTATION[notification.kind]
    const accent = presentation.color()
    const top = Math.max(
      LAYOUT.compact ? 1 : 2,
      terminal.height - 1 - (visible.length - index) * slotHeight,
    )
    return (
      <box
        id={`app-notification-${index}`}
        key={notification.id}
        style={{
          position: "absolute",
          left,
          top,
          width,
          height,
          zIndex: 995,
          flexDirection: "column",
          backgroundColor: COLORS.panelRaised,
          border: LAYOUT.compact ? (["left"] as ["left"]) : true,
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
            onMouseDown={() => onDismiss(notification.id)}
            style={{ fg: accent }}
          />
        </box>
        <text
          content={translateUi(notification.message)}
          style={{ height: 2, fg: COLORS.text, wrapMode: "word" }}
        />
      </box>
    )
  })
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const sequence = useRef(0)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const clear = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
    setNotifications([])
  }, [])

  const notify = useCallback((input: NotificationInput) => {
    sequence.current += 1
    const kind = input.kind ?? inferNotificationKind(input.message)
    const id = `notification-${Date.now()}-${sequence.current}`
    const durationMs =
      input.durationMs === undefined ? defaultNotificationDuration(kind) : input.durationMs
    const notification: AppNotification = {
      id,
      kind,
      source: input.source,
      message: input.message,
      ...(input.title === undefined ? {} : { title: input.title }),
      createdAt: Date.now(),
      durationMs,
    }
    setNotifications((current) => appendNotification(current, notification))
    return id
  }, [])

  useEffect(() => {
    const retained = new Set(notifications.map((notification) => notification.id))
    for (const [id, timer] of timers.current) {
      if (retained.has(id)) continue
      clearTimeout(timer)
      timers.current.delete(id)
    }
    // Only committed cards own timers, even when many events arrive in one batch.
    for (const { id, durationMs, createdAt } of notifications) {
      if (durationMs === null || durationMs <= 0 || timers.current.has(id)) continue
      const remaining = Math.max(0, createdAt + durationMs - Date.now())
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), remaining),
      )
    }
  }, [dismiss, notifications])

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    },
    [],
  )

  const api = useMemo(() => ({ notify, dismiss, clear }), [clear, dismiss, notify])
  return (
    <NotificationContext.Provider value={api}>
      <box style={{ flexGrow: 1, position: "relative", backgroundColor: COLORS.canvas }}>
        {children}
        <NotificationViewport notifications={notifications} onDismiss={dismiss} />
      </box>
    </NotificationContext.Provider>
  )
}

export function withNotifications<Props extends object>(Component: ComponentType<Props>) {
  function NotificationRoot(props: Props) {
    return <NotificationProvider>{createElement(Component, props)}</NotificationProvider>
  }
  NotificationRoot.displayName = `withNotifications(${Component.displayName ?? Component.name})`
  return NotificationRoot
}

export function useNotifications() {
  return useContext(NotificationContext)
}

export function useNotificationFromValue(
  value: string | null | undefined,
  options: {
    source: string
    kind?: NotificationKind
    title?: string
    durationMs?: number | null
  },
) {
  const { notify } = useNotifications()
  const previous = useRef(value)
  useEffect(() => {
    if (!value || value === previous.current) {
      previous.current = value
      return
    }
    previous.current = value
    notify({
      source: options.source,
      message: value,
      ...(options.kind === undefined ? {} : { kind: options.kind }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }),
    })
  }, [notify, options.durationMs, options.kind, options.source, options.title, value])
}
