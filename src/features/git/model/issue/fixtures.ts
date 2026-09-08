import type { IssueDetails, IssueSection, IssueSummary } from "./types"

export const DEFAULT_DEMO_ISSUE_SECTION: IssueSection = {
  id: "created",
  title: "Criadas por mim",
  query: "is:open author:@me",
}

export const DEMO_ISSUE_SECTIONS: readonly IssueSection[] = [
  DEFAULT_DEMO_ISSUE_SECTION,
  { id: "assigned", title: "Atribuídas a mim", query: "is:open assignee:@me" },
  { id: "involved", title: "Estou envolvido", query: "is:open involves:@me" },
  { id: "mentioned", title: "Mencionaram-me", query: "is:open mentions:@me" },
]

export const DEMO_ISSUES: readonly IssueSummary[] = [
  {
    identity: {
      host: "github.com",
      nodeId: "I_demo_api_318",
      owner: "equipe",
      repository: "api",
      number: 318,
      url: "https://github.com/equipe/api/issues/318",
    },
    title: "Cache expira antes da atualização concorrente",
    state: "open",
    author: { login: "deivid" },
    assignees: [{ login: "ana" }],
    labels: [
      { name: "bug", color: "d73a4a" },
      { name: "backend", color: "1d76db" },
    ],
    commentCount: 6,
    reactionCount: 4,
    createdAt: "2026-08-29T10:20:00Z",
    updatedAt: "2026-09-06T17:40:00Z",
  },
  {
    identity: {
      host: "github.com",
      nodeId: "I_demo_web_204",
      owner: "equipe",
      repository: "web",
      number: 204,
      url: "https://github.com/equipe/web/issues/204",
    },
    title: "Navegação perde foco ao fechar o modal",
    state: "open",
    author: { login: "rui" },
    assignees: [{ login: "deivid" }],
    labels: [{ name: "accessibility", color: "7057ff" }],
    commentCount: 3,
    reactionCount: 8,
    createdAt: "2026-09-01T14:00:00Z",
    updatedAt: "2026-09-05T09:15:00Z",
  },
  {
    identity: {
      host: "github.com",
      nodeId: "I_demo_cli_77",
      owner: "equipe",
      repository: "cli",
      number: 77,
      url: "https://github.com/equipe/cli/issues/77",
    },
    title: "Adicionar saída estruturada ao comando de diagnóstico",
    state: "closed",
    author: { login: "bia" },
    assignees: [],
    labels: [{ name: "enhancement", color: "a2eeef" }],
    commentCount: 2,
    reactionCount: 1,
    createdAt: "2026-08-17T08:30:00Z",
    updatedAt: "2026-09-02T12:10:00Z",
  },
]

export function demoIssuesForSection(sectionId: string) {
  if (sectionId === "created") return DEMO_ISSUES.filter((issue) => issue.author.login === "deivid")
  if (sectionId === "assigned") {
    return DEMO_ISSUES.filter((issue) => issue.assignees.some((actor) => actor.login === "deivid"))
  }
  if (sectionId === "mentioned") return DEMO_ISSUES.slice(0, 2)
  return DEMO_ISSUES
}

export function demoIssueDetails(item: IssueSummary): IssueDetails {
  return {
    identity: item.identity,
    title: item.title,
    body: "## Contexto\n\nEsta issue de demonstração reproduz o fluxo completo sem acessar o GitHub.\n\n- descrição em Markdown\n- responsáveis e labels\n- atividade e ações seguras",
    state: item.state,
    author: item.author,
    assignees: item.assignees,
    labels: item.labels,
    comments: [
      {
        id: `${item.identity.nodeId}-comment-1`,
        author: { login: "ana" },
        body: "Consegui reproduzir o problema no ambiente local.",
        createdAt: "2026-09-05T10:00:00Z",
        updatedAt: "2026-09-05T10:00:00Z",
        url: `${item.identity.url}#issuecomment-1`,
        reactionCount: 2,
      },
      {
        id: `${item.identity.nodeId}-comment-2`,
        author: { login: "deivid" },
        body: "Vou preparar a correção e manter o caso de regressão.",
        createdAt: "2026-09-06T12:00:00Z",
        updatedAt: "2026-09-06T12:00:00Z",
        url: `${item.identity.url}#issuecomment-2`,
        reactionCount: 1,
      },
    ],
    commentPage: { totalCount: 2, hasNextPage: false, endCursor: null, partial: false },
    reactionCount: item.reactionCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    closedAt: item.state === "closed" ? item.updatedAt : "",
    permissions: {
      canClose: item.state === "open",
      canReopen: item.state === "closed",
      canUpdate: true,
      repositoryPermission: "write",
    },
    metadataComplete: true,
    partial: false,
  }
}
