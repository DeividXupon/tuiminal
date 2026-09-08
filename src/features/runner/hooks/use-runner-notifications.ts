import { basename } from "node:path"
import type { NotificationInput } from "../../../shared/notifications/index"
import { useNotificationFromValue, useNotifications } from "../../../shared/notifications/index"
import type { RunnerProcessExit } from "../model/types"

type Notify = (input: NotificationInput) => string

export function useRunnerNotifications(
  notice: string,
  discoveryError: string | null,
  projectPickerError: string | null,
) {
  const { notify } = useNotifications()
  useNotificationFromValue(notice, { source: "Runner" })
  useNotificationFromValue(discoveryError, { source: "Runner", kind: "error" })
  useNotificationFromValue(projectPickerError, { source: "Runner", kind: "error" })
  return notify
}

export function notifyRunnerHealth(
  notify: Notify,
  label: string,
  healthy: boolean,
  detail: string,
) {
  if (!healthy) {
    notify({ source: "Runner", kind: "warning", message: `${label}: ${detail}.` })
  }
}

export function runnerExitPresentation(result: RunnerProcessExit): {
  status: "success" | "failed" | "stopped"
  detail: string
  notificationKind: "success" | "warning" | "error"
} {
  if (result.stopped) {
    return {
      status: "stopped",
      detail: "processo interrompido",
      notificationKind: "warning",
    }
  }
  if (result.code === 0) {
    return { status: "success", detail: "processo concluído", notificationKind: "success" }
  }
  const code = result.code === null ? "" : ` com código ${result.code}`
  const signal = result.signal ? ` (${result.signal})` : ""
  return {
    status: "failed",
    detail: `processo finalizado${code}${signal}`,
    notificationKind: "error",
  }
}

export function notifyRunnerExit(
  notify: Notify,
  label: string,
  presentation: ReturnType<typeof runnerExitPresentation>,
) {
  notify({
    source: "Runner",
    kind: presentation.notificationKind,
    message: `${label}: ${presentation.detail}.`,
  })
}

export function notifyRunnerStarted(notify: Notify, label: string, projectRoot: string) {
  notify({
    source: "Runner",
    kind: "info",
    message: `${label} iniciado em ${basename(projectRoot)}.`,
  })
}
