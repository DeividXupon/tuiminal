import { useNotificationFromValue } from "../../../../shared/notifications/index"
import type { PullRequestDashboardState } from "./usePullRequestDashboard"
import type { PullRequestDetailsState } from "./usePullRequestDetails"

function dashboardIssue(dashboard: PullRequestDashboardState) {
  if (dashboard.status === "error" || dashboard.status === "config-error") {
    return dashboard.error
  }
  if (dashboard.status !== "requirements") return null
  return dashboard.capabilities.reason === "missing"
    ? "GitHub CLI não encontrado. Instale gh 2.40.0 ou mais recente."
    : "GitHub CLI desatualizado. Instale gh 2.40.0 ou mais recente."
}

export function usePullRequestNotifications(
  notice: string,
  dashboard: PullRequestDashboardState,
  details: PullRequestDetailsState,
  workflowError: string | null,
) {
  useNotificationFromValue(notice, { source: "Git · PR" })
  useNotificationFromValue(dashboardIssue(dashboard), {
    source: "Git · PR",
    kind: "error",
  })
  useNotificationFromValue(details.status === "error" ? details.message : null, {
    source: "Git · PR",
    kind: "error",
  })
  useNotificationFromValue(workflowError, { source: "Git · PR", kind: "error" })
}
