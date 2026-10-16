import { expect, test } from "bun:test"
import { pullRequestActivity } from "../packages/feature-git/src/model/pr/activity"
import { demoPullRequestDetails } from "../packages/feature-git/src/model/pr/detail-fixtures"
import { DEMO_PULL_REQUESTS } from "../packages/feature-git/src/model/pr/fixtures"

test("PR activity keeps threads together, deduplicates timeline copies and preserves reviews", () => {
  const item = DEMO_PULL_REQUESTS[0]
  if (!item) throw new Error("Missing PR fixture")
  const details = demoPullRequestDetails(item)
  const [parent, reply] = details.comments
  const review = details.reviews[0]
  const event = details.timeline[0]
  if (!parent || !reply || !review || !event) throw new Error("Missing activity fixture")
  parent.createdAt = "2026-09-08T10:00:00Z"
  reply.createdAt = "2026-09-08T12:00:00Z"
  review.submittedAt = "2026-09-08T11:00:00Z"
  review.state = "changes-requested"
  review.body = "First paragraph\n\n- Keep this list"
  event.createdAt = "2026-09-08T09:00:00Z"
  details.timeline.push(
    { ...event, id: parent.id, kind: "comment", body: parent.body },
    { ...event, id: review.id, kind: "review", body: "Duplicate timeline review" },
  )
  const entries = pullRequestActivity(details)
  expect(entries.map((entry) => entry.id)).toEqual([review.id, parent.id, reply.id, event.id])
  expect(entries[0]).toMatchObject({
    label: "changes-requested",
    body: review.body,
    comment: null,
  })
  expect(entries[2]).toMatchObject({
    comment: reply,
    depth: 1,
    isReply: true,
    body: "Resposta fictícia agrupada sob o comentário.",
  })
})
