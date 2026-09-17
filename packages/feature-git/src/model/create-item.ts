import { validateRepositoryName } from "./pr/query"

export type GitHubCreateDraft = {
  kind: "pr" | "issue"
  repository: string
  title: string
  body: string
  base?: string
  head?: string
  draft?: boolean
}

export function defaultCreateRepository(
  identity: { owner: string; repository: string } | null,
  repositories: readonly string[],
) {
  return identity ? `${identity.owner}/${identity.repository}` : (repositories[0] ?? "")
}

export function validGitHubBranch(value: string) {
  return (
    /^(?!\/)(?!.*(?:\.\.|\/\/|@\{|\\|\s))[A-Za-z0-9._/-]+$/.test(value) &&
    !value.endsWith("/") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock")
  )
}

export function validateGitHubCreateDraft(draft: GitHubCreateDraft): string | null {
  if (!validateRepositoryName(draft.repository.trim())) return "Informe owner/repository válido."
  if (!draft.title.trim()) return "Informe o título."
  if (draft.title.length > 256) return "O título é longo demais."
  if (draft.body.length > 65_000) return "A descrição é longa demais."
  if (draft.kind === "issue") return null
  if (!validGitHubBranch(draft.base?.trim() ?? "")) return "Informe uma branch base válida."
  if (!validGitHubBranch(draft.head?.trim() ?? "")) return "Informe uma branch comparada válida."
  if (draft.base?.trim() === draft.head?.trim()) return "Base e comparada precisam ser diferentes."
  return null
}
