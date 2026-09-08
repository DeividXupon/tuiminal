import { useNotificationFromValue } from "../../../../shared/notifications"
import { translateUi } from "../../../../shared/i18n"
import type { IssueDashboardState } from "./useIssueDashboard"
import type { IssueDetailsState } from "./useIssueDetails"

function dashboardIssue(dashboard: IssueDashboardState) {
  if (dashboard.status === "error" || dashboard.status === "config-error") return dashboard.error
  if (dashboard.status !== "requirements") return null
  return dashboard.capabilities.reason === "missing"
    ? "GitHub CLI não encontrado. Instale gh 2.40.0 ou mais recente."
    : "GitHub CLI desatualizado. Instale gh 2.40.0 ou mais recente."
}

export function useIssueNotifications(
  notice: string,
  dashboard: IssueDashboardState,
  details: IssueDetailsState,
) {
  useNotificationFromValue(notice, { source: translateUi("Git · Issues") })
  useNotificationFromValue(dashboardIssue(dashboard), {
    source: translateUi("Git · Issues"),
    kind: "error",
  })
  useNotificationFromValue(details.status === "error" ? details.message : null, {
    source: translateUi("Git · Issues"),
    kind: "error",
  })
}
