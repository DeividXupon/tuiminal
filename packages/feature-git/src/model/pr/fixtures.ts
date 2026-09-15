import type { PullRequestSection, PullRequestSummary } from "./types"

export const DEFAULT_DEMO_PULL_REQUEST_SECTION: PullRequestSection = {
  id: "mine",
  title: "Meus PRs",
  query: "is:open author:@me",
}

export const DEMO_PULL_REQUEST_SECTIONS: readonly PullRequestSection[] = [
  DEFAULT_DEMO_PULL_REQUEST_SECTION,
  { id: "review", title: "Revisar", query: "is:open review-requested:@me" },
  { id: "assigned", title: "Atribuídos", query: "is:open assignee:@me" },
  { id: "failing", title: "CI falhando", query: "is:open status:failure" },
]

export const DEMO_PULL_REQUESTS: readonly PullRequestSummary[] = [
  {
    identity: {
      host: "github.com",
      nodeId: "PR_demo_api_142",
      owner: "equipe",
      repository: "api",
      number: 142,
      url: "https://github.com/equipe/api/pull/142",
    },
    title: "Corrigir invalidação do cache",
    state: "open",
    author: { login: "deivid" },
    assignees: [{ login: "ana" }],
    baseBranch: "main",
    headBranch: "fix/cache",
    headSha: "9ab13cd90ed98f00112233445566778899aabbcc",
    commentCount: 4,
    reviewState: "review-required",
    checkState: "failure",
    labels: [{ name: "bug" }, { name: "backend" }],
    additions: 32,
    deletions: 11,
    changedFiles: 5,
    updatedAt: "2026-09-04T12:00:00Z",
    isFork: false,
  },
  {
    identity: {
      host: "github.com",
      nodeId: "PR_demo_web_87",
      owner: "equipe",
      repository: "web",
      number: 87,
      url: "https://github.com/equipe/web/pull/87",
    },
    title: "Ajustar navegação por teclado",
    state: "draft",
    author: { login: "rui" },
    assignees: [{ login: "deivid" }],
    baseBranch: "main",
    headBranch: "feature/navigation",
    headSha: "87cafe00112233445566778899aabbccddeeff00",
    commentCount: 2,
    reviewState: "approved",
    checkState: "success",
    labels: [{ name: "frontend" }],
    additions: 104,
    deletions: 29,
    changedFiles: 8,
    updatedAt: "2026-09-03T18:30:00Z",
    isFork: false,
  },
  {
    identity: {
      host: "github.com",
      nodeId: "PR_demo_infra_31",
      owner: "equipe",
      repository: "infra",
      number: 31,
      url: "https://github.com/equipe/infra/pull/31",
    },
    title: "Atualizar imagem do runtime",
    state: "open",
    author: { login: "ana" },
    assignees: [{ login: "deivid" }],
    baseBranch: "main",
    headBranch: "deps/runtime",
    headSha: "31deed00112233445566778899aabbccddeeff00",
    commentCount: 7,
    reviewState: "changes-requested",
    checkState: "pending",
    labels: [{ name: "dependencies" }],
    additions: 14,
    deletions: 8,
    changedFiles: 3,
    updatedAt: "2026-09-02T09:15:00Z",
    isFork: true,
  },
  {
    identity: {
      host: "github.com",
      nodeId: "PR_demo_cli_55",
      owner: "equipe",
      repository: "cli",
      number: 55,
      url: "https://github.com/equipe/cli/pull/55",
    },
    title: "Preparar release estável",
    state: "merged",
    author: { login: "deivid" },
    assignees: [],
    baseBranch: "main",
    headBranch: "release/stable",
    headSha: "55fade00112233445566778899aabbccddeeff00",
    commentCount: 10,
    reviewState: "approved",
    checkState: "success",
    labels: [{ name: "release" }],
    additions: 50,
    deletions: 12,
    changedFiles: 4,
    updatedAt: "2026-09-01T14:20:00Z",
    isFork: false,
  },
  {
    identity: {
      host: "github.com",
      nodeId: "PR_demo_docs_12",
      owner: "equipe",
      repository: "docs",
      number: 12,
      url: "https://github.com/equipe/docs/pull/12",
    },
    title: "Reorganizar guia de contribuição",
    state: "closed",
    author: { login: "bia" },
    assignees: [],
    baseBranch: "main",
    headBranch: "docs/contributing",
    headSha: "12cafe00112233445566778899aabbccddeeff00",
    commentCount: 1,
    reviewState: "unknown",
    checkState: "none",
    labels: [{ name: "documentation" }],
    additions: 76,
    deletions: 41,
    changedFiles: 2,
    updatedAt: "2026-08-30T11:10:00Z",
    isFork: false,
  },
]

export const DEMO_PERMISSION_DENIED = {
  action: "approve-workflow" as const,
  reason: "viewer-lacks-actions-write-permission",
}

export function demoPullRequestsForSection(sectionId: string) {
  if (sectionId === "mine")
    return DEMO_PULL_REQUESTS.filter((item) => item.author.login === "deivid")
  if (sectionId === "review") {
    return DEMO_PULL_REQUESTS.filter((item) => item.reviewState === "review-required")
  }
  if (sectionId === "assigned") {
    return DEMO_PULL_REQUESTS.filter((item) =>
      item.assignees.some((assignee) => assignee.login === "deivid"),
    )
  }
  return DEMO_PULL_REQUESTS.filter((item) => item.checkState === "failure")
}
