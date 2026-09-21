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
import { LAYOUT } from "../settings/theme"
import { NotificationViewport } from "./NotificationViewport"
import {
  appendNotification,
  inferNotificationKind,
  NOTIFICATION_ANIMATION_TIMING,
  resolveNotificationDuration,
  type AppNotification,
  type NotificationInput,
  type NotificationKind,
} from "./model"

type NotificationApi = {
  notify: (input: NotificationInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

type NotificationTimer = {
  remainingMs: number
  resumedAt: number
  handle: ReturnType<typeof setTimeout> | null
}

const NOOP_API: NotificationApi = {
  notify: () => "notification-unmounted",
  dismiss: () => undefined,
  clear: () => undefined,
}

const NotificationContext = createContext<NotificationApi>(NOOP_API)

function stopNotificationTimer(timer: NotificationTimer, now: number) {
  if (timer.handle === null) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remainingMs = Math.max(0, timer.remainingMs - Math.max(0, now - timer.resumedAt))
}

function startNotificationTimer(
  id: string,
  timer: NotificationTimer,
  onExpire: (id: string) => void,
) {
  if (timer.handle !== null) return
  timer.resumedAt = Date.now()
  timer.handle = setTimeout(() => {
    timer.handle = null
    timer.remainingMs = 0
    onExpire(id)
  }, timer.remainingMs)
}

function remainingNotificationTime(timer: NotificationTimer, now: number, paused: boolean) {
  if (paused || timer.handle === null) return timer.remainingMs
  return Math.max(0, timer.remainingMs - Math.max(0, now - timer.resumedAt))
}

function releaseDiscardedTimers(
  retained: Set<string>,
  departing: Set<string>,
  timers: Map<string, NotificationTimer>,
  exitTimers: Map<string, ReturnType<typeof setTimeout>>,
  now: number,
) {
  for (const [id, timer] of timers) {
    if (retained.has(id) && !departing.has(id)) continue
    stopNotificationTimer(timer, now)
    timers.delete(id)
  }
  for (const [id, timer] of exitTimers) {
    if (retained.has(id) && departing.has(id)) continue
    clearTimeout(timer)
    exitTimers.delete(id)
  }
}

function withoutDepartures(current: Record<string, number>, stale: string[]) {
  const next = { ...current }
  for (const id of stale) delete next[id]
  return next
}

function startExitTimer(
  notification: AppNotification,
  dismissStartedAt: number,
  now: number,
  exitTimers: Map<string, ReturnType<typeof setTimeout>>,
  onComplete: (id: string) => void,
) {
  if (exitTimers.has(notification.id)) return
  const remaining = Math.max(0, dismissStartedAt + NOTIFICATION_ANIMATION_TIMING.exitMs - now)
  const exitTimer = setTimeout(() => {
    exitTimers.delete(notification.id)
    onComplete(notification.id)
  }, remaining)
  exitTimers.set(notification.id, exitTimer)
}

function startRetainedTimers({
  notifications,
  departures,
  timers,
  exitTimers,
  now,
  paused,
  onExpire,
  onExitComplete,
}: {
  notifications: AppNotification[]
  departures: Record<string, number>
  timers: Map<string, NotificationTimer>
  exitTimers: Map<string, ReturnType<typeof setTimeout>>
  now: number
  paused: boolean
  onExpire: (id: string) => void
  onExitComplete: (id: string) => void
}) {
  for (const notification of notifications) {
    const dismissStartedAt = departures[notification.id]
    if (dismissStartedAt !== undefined) {
      startExitTimer(notification, dismissStartedAt, now, exitTimers, onExitComplete)
      continue
    }
    if (timers.has(notification.id)) continue
    const timer: NotificationTimer = {
      remainingMs: Math.max(0, notification.createdAt + notification.durationMs - now),
      resumedAt: now,
      handle: null,
    }
    timers.set(notification.id, timer)
    if (!paused) startNotificationTimer(notification.id, timer, onExpire)
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [departures, setDepartures] = useState<Record<string, number>>({})
  const [paused, setPaused] = useState(false)
  const [frameNow, setFrameNow] = useState(() => Date.now())
  const sequence = useRef(0)
  const pausedRef = useRef(false)
  const notificationsRef = useRef(notifications)
  const timers = useRef(new Map<string, NotificationTimer>())
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  notificationsRef.current = notifications

  const beginDismiss = useCallback((id: string) => {
    if (!notificationsRef.current.some((notification) => notification.id === id)) return
    const timer = timers.current.get(id)
    if (timer) stopNotificationTimer(timer, Date.now())
    timers.current.delete(id)
    const startedAt = Date.now()
    setDepartures((current) =>
      Object.hasOwn(current, id) ? current : { ...current, [id]: startedAt },
    )
  }, [])

  const finalizeDismiss = useCallback((id: string) => {
    const exitTimer = exitTimers.current.get(id)
    if (exitTimer) clearTimeout(exitTimer)
    exitTimers.current.delete(id)
    setNotifications((current) => current.filter((notification) => notification.id !== id))
    setDepartures((current) => {
      if (!Object.hasOwn(current, id)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const clear = useCallback(() => {
    const startedAt = Date.now()
    for (const timer of timers.current.values()) stopNotificationTimer(timer, startedAt)
    timers.current.clear()
    setDepartures((current) => {
      const next = { ...current }
      for (const notification of notificationsRef.current) {
        if (!Object.hasOwn(next, notification.id)) next[notification.id] = startedAt
      }
      return next
    })
  }, [])

  const notify = useCallback((input: NotificationInput) => {
    sequence.current += 1
    const kind = input.kind ?? inferNotificationKind(input.message)
    const createdAt = Date.now()
    const notification: AppNotification = {
      id: `notification-${createdAt}-${sequence.current}`,
      kind,
      source: input.source,
      message: input.message,
      ...(input.messageChunks === undefined ? {} : { messageChunks: input.messageChunks }),
      ...(input.title === undefined ? {} : { title: input.title }),
      createdAt,
      durationMs: resolveNotificationDuration(kind, input.durationMs),
    }
    setNotifications((current) => appendNotification(current, notification))
    return notification.id
  }, [])

  const pauseAll = useCallback(() => {
    if (pausedRef.current) return
    const pausedAt = Date.now()
    pausedRef.current = true
    for (const timer of timers.current.values()) stopNotificationTimer(timer, pausedAt)
    setPaused(true)
    setFrameNow(pausedAt)
  }, [])

  const resumeAll = useCallback(() => {
    if (!pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
    for (const [id, timer] of timers.current) {
      startNotificationTimer(id, timer, beginDismiss)
    }
    setFrameNow(Date.now())
  }, [beginDismiss])

  useEffect(() => {
    const retained = new Set(notifications.map((notification) => notification.id))
    const departing = new Set(Object.keys(departures))
    const now = Date.now()
    releaseDiscardedTimers(retained, departing, timers.current, exitTimers.current, now)
    const staleDepartures = Object.keys(departures).filter((id) => !retained.has(id))
    if (staleDepartures.length > 0) {
      setDepartures((current) => withoutDepartures(current, staleDepartures))
    }
    startRetainedTimers({
      notifications,
      departures,
      timers: timers.current,
      exitTimers: exitTimers.current,
      now,
      paused: pausedRef.current,
      onExpire: beginDismiss,
      onExitComplete: finalizeDismiss,
    })
  }, [beginDismiss, departures, finalizeDismiss, notifications])

  useEffect(() => {
    if (notifications.length === 0) return
    setFrameNow(Date.now())
    const interval = setInterval(
      () => setFrameNow(Date.now()),
      NOTIFICATION_ANIMATION_TIMING.frameMs,
    )
    return () => clearInterval(interval)
  }, [notifications.length])

  useEffect(() => {
    if (notifications.length > 0 || !pausedRef.current) return
    pausedRef.current = false
    setPaused(false)
  }, [notifications.length])

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        if (timer.handle !== null) clearTimeout(timer.handle)
      }
      for (const timer of exitTimers.current.values()) clearTimeout(timer)
      timers.current.clear()
      exitTimers.current.clear()
    },
    [],
  )

  const api = useMemo(
    () => ({ notify, dismiss: beginDismiss, clear }),
    [beginDismiss, clear, notify],
  )
  const presented = notifications.map((notification) => {
    const timer = timers.current.get(notification.id)
    return {
      notification,
      remainingMs: Object.hasOwn(departures, notification.id)
        ? 0
        : timer
          ? remainingNotificationTime(timer, frameNow, paused)
          : notification.durationMs,
      dismissStartedAt: departures[notification.id] ?? null,
    }
  })

  return (
    <NotificationContext.Provider value={api}>
      <box
        style={{ flexGrow: 1, position: "relative", backgroundColor: LAYOUT.workspaceBackground }}
      >
        {children}
        <NotificationViewport
          notifications={presented}
          now={frameNow}
          onDismiss={beginDismiss}
          onPause={pauseAll}
          onResume={resumeAll}
        />
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
