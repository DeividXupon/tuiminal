import type { NotificationInput } from "../../../shared/notifications/index"
import { useNotificationFromValue, useNotifications } from "../../../shared/notifications/index"
import type { FreeTerminalExit } from "../services/terminal"

type Notify = (input: NotificationInput) => string

export function useTerminalNotifications(notice: string) {
  const { notify } = useNotifications()
  useNotificationFromValue(notice, { source: "Terminal" })
  return notify
}

export function notifyTerminalExit(notify: Notify, label: string, result: FreeTerminalExit) {
  const failed = result.code !== 0 && !result.stopped
  if (failed) {
    notify({
      source: "Terminal",
      kind: "error",
      message: `${label} encerrou com código ${result.code ?? "desconhecido"}.`,
    })
    return
  }
  notify({
    source: "Terminal",
    kind: result.stopped ? "warning" : "success",
    message: result.stopped ? `${label} foi interrompido.` : `${label} foi concluído.`,
  })
}
