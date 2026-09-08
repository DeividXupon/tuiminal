export type InboxSubjectType =
  | "PullRequest"
  | "Issue"
  | "Discussion"
  | "Release"
  | "Commit"
  | "RepositoryVulnerabilityAlert"
  | string

export type InboxNotification = {
  id: string
  unread: boolean
  reason: string
  updatedAt: string
  lastReadAt: string | null
  title: string
  subjectType: InboxSubjectType
  repository: string
  repositoryUrl: string
  subjectApiUrl: string | null
  threadApiUrl: string
  subscriptionApiUrl: string
  url: string
}

export type InboxSectionId = "inbox" | "review" | "assigned" | "mentioned" | "saved"

export type InboxSection = { id: InboxSectionId; title: string }

export const INBOX_SECTIONS: readonly InboxSection[] = [
  { id: "inbox", title: "Caixa de entrada" },
  { id: "review", title: "Revisão solicitada" },
  { id: "assigned", title: "Atribuídas a mim" },
  { id: "mentioned", title: "Menções" },
  { id: "saved", title: "Salvas" },
]
