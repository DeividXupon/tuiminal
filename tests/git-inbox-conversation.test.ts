import { expect, test } from "bun:test"
import { DEMO_INBOX_NOTIFICATIONS } from "../packages/feature-git/src/model/inbox/fixtures"
import { inboxSubject } from "../packages/feature-git/src/model/inbox/subject"
import { matchingInboxConversation } from "../packages/feature-git/src/model/inbox/conversation"
import { demoInboxConversation } from "../packages/feature-git/src/model/inbox/conversation-fixtures"
import { normalizeInboxConversationTarget } from "../packages/feature-git/src/services/github/inbox-conversation"

for (const notification of DEMO_INBOX_NOTIFICATIONS.slice(0, 2)) {
  test(`${notification.subjectType} conversation is pinned to the notification repository, number and host`, () => {
    const subject = inboxSubject(notification, "github.com")
    if (!subject) throw new Error("Missing fixture subject")
    const conversation = demoInboxConversation({ notification, subject })
    const { identity } = conversation.item
    const node = {
      __typename: notification.subjectType,
      id: identity.nodeId,
      number: identity.number,
      url: identity.url,
      title: notification.title,
      state: "OPEN",
      updatedAt: notification.updatedAt,
      repository: { name: identity.repository, owner: { login: identity.owner } },
      headRefOid: "abcdef",
      author: { login: "author" },
    }
    const payload = {
      data: {
        viewer: { id: "viewer-id", login: "viewer" },
        repository: { issueOrPullRequest: node },
      },
    }
    expect(normalizeInboxConversationTarget(payload, subject)).toMatchObject({
      kind: subject.kind,
      item: { identity },
      auth: { viewerId: "viewer-id", host: "github.com" },
    })
    expect(
      normalizeInboxConversationTarget(payload, { ...subject, number: identity.number + 1 }),
    ).toBeNull()
    expect(
      normalizeInboxConversationTarget(payload, { ...subject, host: "enterprise.example" }),
    ).toBeNull()
    expect(
      normalizeInboxConversationTarget({ data: { repository: payload.data.repository } }, subject),
    ).toBeNull()
    expect(matchingInboxConversation(conversation, { notification, subject })).toBe(conversation)
    expect(
      matchingInboxConversation(conversation, {
        notification,
        subject: { ...subject, number: 999 },
      }),
    ).toBeNull()
  })
}

test("Inbox conversations reject unrelated or malformed subject URLs and support enterprise hosts", () => {
  const item = DEMO_INBOX_NOTIFICATIONS[0]
  if (!item) throw new Error("Missing fixture")
  for (const subjectApiUrl of [
    "https://evil.example/repos/equipe/api/pulls/142",
    "https://user@api.github.com/repos/equipe/api/pulls/142",
    "https://api.github.com/repos/other/api/pulls/142",
    "https://api.github.com/repos/equipe/api/issues/142",
    "https://api.github.com/repos/equipe/api/pulls/142?redirect=1",
    "https://api.github.com/repos/equipe/api/pulls/9007199254740992",
  ])
    expect(inboxSubject({ ...item, subjectApiUrl }, "github.com")).toBeNull()
  expect(inboxSubject({ ...item, subjectType: "Release" }, "github.com")).toBeNull()
  expect(
    inboxSubject(
      { ...item, subjectApiUrl: "https://git.example/api/v3/repos/equipe/api/pulls/142" },
      "git.example",
    ),
  ).toMatchObject({
    host: "git.example",
    owner: "equipe",
    repository: "api",
    number: 142,
    kind: "pr",
  })
})
