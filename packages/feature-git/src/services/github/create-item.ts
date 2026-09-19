import type { PullRequestAuthContext } from "../../model/pr/types"
import { type GitHubCreateDraft, validateGitHubCreateDraft } from "../../model/create-item"
import { loadGhAuthContext } from "./auth"
import { isValidGitHubHost } from "./host"
import { type GhTransportOptions, runGhJson } from "./transport"

export type GitHubCreateResult =
  | { status: "confirmed"; url: string; number: number }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; reason: string }

type RepositoryRead = {
  full_name?: unknown
  has_issues?: unknown
}

type CreatedItem = {
  html_url?: unknown
  number?: unknown
  pull_request?: unknown
}

function matchingCreatedItem(value: CreatedItem, draft: GitHubCreateDraft, host: string) {
  if (typeof value.number !== "number" || !Number.isSafeInteger(value.number) || value.number < 1)
    return null
  if (typeof value.html_url !== "string") return null
  try {
    const url = new URL(value.html_url)
    const path = `/${draft.repository}/${draft.kind === "pr" ? "pull" : "issues"}/${value.number}`
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== host ||
      url.pathname.toLowerCase() !== path.toLowerCase()
    )
      return null
    return { status: "confirmed" as const, url: url.toString(), number: value.number }
  } catch {
    return null
  }
}

async function verifyCreationTarget(
  draft: GitHubCreateDraft,
  auth: PullRequestAuthContext,
  endpoint: string,
  options: GhTransportOptions,
) {
  const host = auth.host.toLowerCase()
  const currentAuth = await loadGhAuthContext({ host, generation: auth.generation, options })
  if (currentAuth.viewerId !== auth.viewerId || currentAuth.viewerLogin !== auth.viewerLogin) {
    throw new Error("A conta GitHub mudou. Atualize antes de criar.")
  }
  const currentRepo = await runGhJson<RepositoryRead>(
    { args: ["api", "--hostname", host, endpoint] },
    { ...options, host },
  )
  if (
    typeof currentRepo.full_name !== "string" ||
    currentRepo.full_name.toLowerCase() !== draft.repository.trim().toLowerCase()
  ) {
    throw new Error("Repositório GitHub não corresponde ao escolhido.")
  }
  if (draft.kind === "issue" && currentRepo.has_issues === false) {
    throw new Error("Issues estão desativadas neste repositório.")
  }
  if (draft.kind !== "pr") return
  for (const branch of [draft.base?.trim(), draft.head?.trim()]) {
    const remoteBranch = await runGhJson<{ name?: unknown }>(
      {
        args: [
          "api",
          "--hostname",
          host,
          `${endpoint}/branches/${encodeURIComponent(branch ?? "")}`,
        ],
      },
      { ...options, host },
    )
    if (remoteBranch.name !== branch) {
      throw new Error("Branch remota não corresponde à escolhida.")
    }
  }
}

export async function createGitHubItem(
  draft: GitHubCreateDraft,
  auth: PullRequestAuthContext,
  options: GhTransportOptions = {},
): Promise<GitHubCreateResult> {
  const invalid = validateGitHubCreateDraft(draft)
  if (invalid) return { status: "rejected", reason: invalid }
  const host = auth.host.toLowerCase()
  if (!isValidGitHubHost(host)) return { status: "rejected", reason: "Host GitHub inválido." }
  const repository = draft.repository.trim()
  const endpoint = `repos/${repository}`
  try {
    await verifyCreationTarget({ ...draft, repository }, auth, endpoint, options)
  } catch (error) {
    return {
      status: "rejected",
      reason: error instanceof Error ? error.message : "Falha na verificação GitHub.",
    }
  }
  try {
    const payload =
      draft.kind === "issue"
        ? { title: draft.title.trim(), body: draft.body }
        : {
            title: draft.title.trim(),
            body: draft.body,
            base: draft.base?.trim(),
            head: draft.head?.trim(),
            draft: Boolean(draft.draft),
          }
    const created = await runGhJson<CreatedItem>(
      {
        args: [
          "api",
          "--method",
          "POST",
          "--hostname",
          host,
          `${endpoint}/${draft.kind === "pr" ? "pulls" : "issues"}`,
          "--input",
          "-",
        ],
        stdin: JSON.stringify(payload),
      },
      { ...options, host },
    )
    return (
      matchingCreatedItem(created, { ...draft, repository }, host) ?? {
        status: "uncertain",
        reason: "O GitHub não confirmou a identidade do item criado.",
      }
    )
  } catch (error) {
    return {
      status: "uncertain",
      reason: error instanceof Error ? error.message : "Resultado remoto incerto.",
    }
  }
}
