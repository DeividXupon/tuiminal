import { DEMO_ISSUES, demoIssueDetails } from "../issue/fixtures"
import { demoPullRequestDetails } from "../pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../pr/fixtures"
import type { InboxConversation, InboxConversationTarget } from "./conversation"

export function demoInboxConversation({
  notification,
  subject,
}: InboxConversationTarget): InboxConversation {
  const identity = {
    host: subject.host,
    owner: subject.owner,
    repository: subject.repository,
    number: subject.number,
    nodeId: `demo-${subject.kind}-${subject.number}`,
    url: `https://${subject.host}/${subject.owner}/${subject.repository}/${subject.kind === "pr" ? "pull" : "issues"}/${subject.number}`,
  }
  const auth = { host: subject.host, viewerId: "demo", viewerLogin: "demo", generation: 0 }
  if (subject.kind === "issue") {
    const base = DEMO_ISSUES[0]
    if (!base) throw new Error("Missing demo issue")
    const item = { ...base, identity, title: notification.title, updatedAt: notification.updatedAt }
    return { kind: "issue", item, details: demoIssueDetails(item), auth }
  }
  const base = DEMO_PULL_REQUESTS[0]
  if (!base) throw new Error("Missing demo PR")
  const item = { ...base, identity, title: notification.title, updatedAt: notification.updatedAt }
  return { kind: "pr", item, details: demoPullRequestDetails(item), auth }
}
