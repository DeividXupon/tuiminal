import { useNotificationFromValue } from "../../../shared/notifications/index"

export function useDatabaseWorkspaceNotifications(
  connectionNotice: string,
  error: string | null,
  changesNotice: string,
  writeNotice: string,
) {
  useNotificationFromValue(connectionNotice, { source: "Banco" })
  useNotificationFromValue(error, { source: "Banco", kind: "error" })
  useNotificationFromValue(changesNotice, { source: "Banco" })
  useNotificationFromValue(writeNotice, { source: "Banco" })
}

export function useDatabaseQueryNotifications(error: string, notice: string) {
  useNotificationFromValue(error, { source: "Banco · SQL", kind: "error" })
  useNotificationFromValue(notice, { source: "Banco · SQL" })
}
