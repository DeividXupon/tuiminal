import { describe, expect, test } from "bun:test"
import {
  GITHUB_REACTION_CHOICES,
  githubDiscussionReplyBody,
  githubReactionCount,
  githubReactionSummary,
  hasAnyGitHubReaction,
  isGitHubDiscussionCommentUrl,
  normalizeGitHubReactionGroups,
  threadGitHubDiscussionComments,
} from "../packages/feature-git/src/model/reactions"

describe("GitHub discussions", () => {
  test("offers the five selected GitHub reactions in a stable keyboard order", () => {
    expect(GITHUB_REACTION_CHOICES.map(({ emoji, content }) => [emoji, content])).toEqual([
      ["👍", "THUMBS_UP"],
      ["❤️", "HEART"],
      ["🎉", "HOORAY"],
      ["😄", "LAUGH"],
      ["👀", "EYES"],
    ])
  })

  test("normalizes counts and records the authenticated viewer's reactions", () => {
    const raw = [
      { content: "THUMBS_UP", viewerHasReacted: true, users: { totalCount: 3 } },
      { content: "HEART", viewerHasReacted: false, users: { totalCount: 2 } },
      { content: "ROCKET", viewerHasReacted: true, users: { totalCount: 4 } },
    ]
    const groups = normalizeGitHubReactionGroups(raw)
    expect(groups).toEqual([
      { content: "THUMBS_UP", count: 3, viewerHasReacted: true },
      { content: "HEART", count: 2, viewerHasReacted: false },
    ])
    expect(githubReactionCount(raw)).toBe(9)
    expect(githubReactionSummary(groups)).toBe("👍 3 ✓  ❤️ 2")
    expect(hasAnyGitHubReaction(groups)).toBe(true)
    expect(hasAnyGitHubReaction([{ content: "HEART", count: 2, viewerHasReacted: false }])).toBe(
      true,
    )
    expect(hasAnyGitHubReaction([], 1)).toBe(true)
    expect(hasAnyGitHubReaction([], 0)).toBe(false)
  })

  test("builds a linked reply only for a comment URL belonging to the selected item", () => {
    const identity = { host: "github.com", owner: "team", repository: "api", number: 42 }
    const url = "https://github.com/team/api/issues/42#issuecomment-123"
    expect(isGitHubDiscussionCommentUrl(url, identity)).toBe(true)
    expect(
      isGitHubDiscussionCommentUrl(
        "https://github.com/other/api/issues/42#issuecomment-123",
        identity,
      ),
    ).toBe(false)
    expect(githubDiscussionReplyBody({ author: "ana", url, body: "  Obrigado!  " })).toBe(
      `↳ ${url}\n\n@ana Obrigado!`,
    )
  })

  test("groups linked replies below their parent and removes the transport marker", () => {
    const identity = { host: "github.com", owner: "team", repository: "api", number: 42 }
    const baseUrl = "https://github.com/team/api/issues/42"
    const comments = [
      {
        id: "parent",
        author: { login: "ana" },
        body: "Pergunta",
        createdAt: "2026-09-10T10:00:00Z",
        url: `${baseUrl}#issuecomment-1`,
      },
      {
        id: "reply",
        author: { login: "bia" },
        body: `↳ ${baseUrl}#issuecomment-1\n\n@ana Resposta`,
        createdAt: "2026-09-10T10:01:00Z",
        url: `${baseUrl}#issuecomment-2`,
      },
      {
        id: "nested",
        author: { login: "ana" },
        body: `↳ ${baseUrl}#issuecomment-2\n\n@bia Continuação`,
        createdAt: "2026-09-10T10:02:00Z",
        url: `${baseUrl}#issuecomment-3`,
      },
    ]

    expect(
      threadGitHubDiscussionComments(comments, identity).map(({ comment, body, depth }) => ({
        id: comment.id,
        body,
        depth,
      })),
    ).toEqual([
      { id: "parent", body: "Pergunta", depth: 0 },
      { id: "reply", body: "Resposta", depth: 1 },
      { id: "nested", body: "Continuação", depth: 2 },
    ])
  })
})
