import type { OpenCodeActivity, OpenCodeHydration } from "./opencode-api"
import {
  openCodeEventActivity,
  openCodeEventState,
  openCodeEventTool,
  openCodeToolActivity,
} from "./opencode-events"

export type OpenCodeLiveState = Pick<
  OpenCodeHydration,
  "activity" | "state" | "waitingOnApproval"
> & {
  toolActivities: Map<string, OpenCodeActivity>
  settled: boolean
}

function eventClearsApproval(type: unknown) {
  return [
    "permission.replied",
    "permission.updated",
    "question.replied",
    "form.replied",
    "form.cancelled",
  ].includes(String(type))
}

function rememberToolActivity(observed: OpenCodeLiveState, id: string, name: string) {
  const activity = openCodeToolActivity(name)
  if (!activity) return
  observed.toolActivities.set(id, activity)
  if (observed.toolActivities.size <= 64) return
  const oldest = observed.toolActivities.keys().next().value
  if (oldest) observed.toolActivities.delete(oldest)
}

export function applyOpenCodeLiveEvent(
  observed: OpenCodeLiveState,
  value: unknown,
  eventType: unknown,
) {
  const state = openCodeEventState(value)
  if (state) {
    observed.state = state
    observed.waitingOnApproval = state === "blocked"
    if (state === "working") observed.settled = false
    else if (state === "done" || state === "unknown") observed.settled = true
  }
  if (eventClearsApproval(eventType)) observed.waitingOnApproval = false

  const tool = openCodeEventTool(value)
  if (tool?.id && tool.name) rememberToolActivity(observed, tool.id, tool.name)
  const activity = openCodeEventActivity(
    value,
    tool?.id ? (observed.toolActivities.get(tool.id) ?? null) : null,
  )
  if (tool?.terminal && tool.id) observed.toolActivities.delete(tool.id)
  if (activity) {
    observed.activity = activity
    observed.state = "working"
    observed.settled = false
  } else if (observed.state !== "working") observed.activity = null
  if (state === "done" || state === "idle" || state === "unknown") observed.toolActivities.clear()
}
