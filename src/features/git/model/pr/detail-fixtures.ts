import type { PullRequestDetails, PullRequestPageInfo, PullRequestSummary } from "./types"

const COMPLETE_PAGE: PullRequestPageInfo = {
  totalCount: 1,
  hasNextPage: false,
  endCursor: null,
  partial: false,
}

export function demoPullRequestDetails(item: PullRequestSummary): PullRequestDetails {
  const author = item.author
  return {
    identity: item.identity,
    body: "## Objetivo\n\nEsta é uma descrição fictícia e segura para demonstrar a prévia completa do Pull Request.\n\n- preserva o foco\n- não acessa o GitHub",
    baseSha: "base0000112233445566778899aabbccddeeff00",
    headSha: item.headSha,
    remoteState: item.state === "draft" ? "open" : item.state,
    isDraft: item.state === "draft",
    mergedAt: item.state === "merged" ? item.updatedAt : "",
    mergeable: item.state === "open" ? "mergeable" : "unknown",
    mergeState: item.checkState === "failure" ? "BLOCKED" : "CLEAN",
    mergeQueueConfigured: false,
    mergeQueueEntry: null,
    autoMergeRequest: null,
    assignees: item.assignees,
    reviewRequests: [
      { login: "frontend", kind: "team", asCodeOwner: true },
      { login: "ana", kind: "user", asCodeOwner: false },
    ],
    reviews: [
      {
        id: `${item.identity.nodeId}-review-1`,
        author: { login: "ana" },
        state:
          item.reviewState === "approved" || item.reviewState === "changes-requested"
            ? item.reviewState
            : "commented",
        body: "Revisão fictícia para validar a interface.",
        submittedAt: item.updatedAt,
        commitSha: item.headSha,
      },
    ],
    commits: [
      {
        sha: item.headSha,
        headline: item.title,
        authoredAt: item.updatedAt,
        author,
      },
    ],
    files: [
      {
        path: "src/features/git/PullRequestsWorkspace.tsx",
        additions: item.additions,
        deletions: item.deletions,
        changeType: "MODIFIED",
      },
    ],
    comments: [
      {
        id: `${item.identity.nodeId}-comment-1`,
        author: { login: "bia" },
        body: "Comentário fictício para a linha do tempo.",
        createdAt: item.updatedAt,
        url: `${item.identity.url}#issuecomment-demo`,
      },
    ],
    timeline: [
      {
        id: `${item.identity.nodeId}-event-1`,
        kind: "ready",
        actor: author,
        body: "",
        createdAt: item.updatedAt,
        state: "",
      },
    ],
    checks: [
      {
        id: `${item.identity.nodeId}-check-1`,
        name: "test",
        state: item.checkState,
        detailsUrl: `${item.identity.url}/checks`,
        provider: "GitHub Actions",
      },
    ],
    pages: {
      reviewRequests: { ...COMPLETE_PAGE, totalCount: 2 },
      reviews: COMPLETE_PAGE,
      commits: COMPLETE_PAGE,
      files: COMPLETE_PAGE,
      comments: COMPLETE_PAGE,
      timeline: COMPLETE_PAGE,
      checks: COMPLETE_PAGE,
    },
    permissions: {
      canUpdateBranch: item.state === "open",
      canClose: item.state === "open" || item.state === "draft",
      canReopen: item.state === "closed",
      canMerge: item.state === "open" && item.checkState === "success",
      canMarkReady: item.state === "draft",
      repositoryPermission: "write",
      mergeMethods: ["merge", "squash", "rebase"],
    },
    partial: false,
  }
}
