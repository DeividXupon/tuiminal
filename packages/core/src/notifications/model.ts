export type NotificationKind = "info" | "success" | "warning" | "error"

export type NotificationMessageChunk = { text: string; color?: string }

export type NotificationInput = {
  kind?: NotificationKind
  source: string
  title?: string
  message: string
  messageChunks?: NotificationMessageChunk[]
  durationMs?: number | null
  onPress?: () => void
}

export type AppNotification = Required<Pick<NotificationInput, "source" | "message">> & {
  id: string
  kind: NotificationKind
  messageChunks?: NotificationMessageChunk[]
  title?: string
  createdAt: number
  durationMs: number
  onPress?: () => void
}

export const APP_NOTIFICATION_LIMIT = 3
export const NOTIFICATION_ANIMATION_TIMING = {
  enterMs: 180,
  exitMs: 180,
  frameMs: 40,
  slideColumns: 5,
} as const

const ERROR_TERMS =
  /(^|\W)(erro|error|falha|failed|failure|inválid|invalid|unable|denied|recusad|não foi possível|não pôde|não pode concluir|não conect|not found|não encontrado)(\W|$)/i
const WARNING_TERMS =
  /(^|\W)(aviso|warning|atenção|limite|cancelad|confirme|bloquead|revertid|descartad|somente leitura|não existe mais|indisponível)(\W|$)/i
const SUCCESS_TERMS =
  /(^|\W)(sucesso|success|salv[oa]|copiad[oa]|criad[oa]|adicionad[oa]|atualizad[oa]|restaurad[oa]|importad[oa]|exportad[oa]|executad[oa]|concluíd[oa]|abert[oa]|fechad[oa]|iniciad[oa]|removid[oa]|excluíd[oa]|aplicad[oa]|estabelecid[oa])(\W|$)/i

export function inferNotificationKind(message: string): NotificationKind {
  const normalized = message.trim()
  if (!normalized || normalized.endsWith("…") || normalized.endsWith("...")) return "info"
  if (normalized.startsWith("✓") || SUCCESS_TERMS.test(normalized)) return "success"
  if (normalized.startsWith("⚠") || WARNING_TERMS.test(normalized)) return "warning"
  if (normalized.startsWith("×") || ERROR_TERMS.test(normalized)) return "error"
  return "info"
}

export function defaultNotificationDuration(kind: NotificationKind) {
  if (kind === "error") return 10_000
  if (kind === "warning") return 7_000
  if (kind === "success") return 4_500
  return 4_000
}

export function resolveNotificationDuration(
  kind: NotificationKind,
  requested: number | null | undefined,
) {
  return typeof requested === "number" && Number.isFinite(requested) && requested > 0
    ? requested
    : defaultNotificationDuration(kind)
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function notificationProgress(remainingMs: number, durationMs: number) {
  return clamp(remainingMs / Math.max(1, durationMs))
}

export function notificationAnimationFrame(
  createdAt: number,
  dismissStartedAt: number | null,
  now: number,
) {
  if (dismissStartedAt !== null) {
    const progress = clamp((now - dismissStartedAt) / NOTIFICATION_ANIMATION_TIMING.exitMs)
    return {
      opacity: 1 - progress,
      offset: Math.round(progress * NOTIFICATION_ANIMATION_TIMING.slideColumns),
    }
  }
  const progress = clamp((now - createdAt) / NOTIFICATION_ANIMATION_TIMING.enterMs)
  const eased = 1 - (1 - progress) ** 3
  return {
    opacity: eased,
    offset: Math.round((1 - eased) * NOTIFICATION_ANIMATION_TIMING.slideColumns),
  }
}

export function appendNotification(
  current: AppNotification[],
  notification: AppNotification,
  limit = APP_NOTIFICATION_LIMIT,
) {
  const withoutDuplicate = current.filter(
    (item) =>
      item.source !== notification.source ||
      item.kind !== notification.kind ||
      item.message !== notification.message,
  )
  return [...withoutDuplicate, notification].slice(-Math.max(1, limit))
}
