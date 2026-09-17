import { validGitHubBranch } from "../../model/create-item"
import { sanitizeGitHubText } from "../../model/pr/content"
import { validateRepositoryName } from "../../model/pr/query"
import { isValidGitHubHost } from "./host"
import { type GhTransportOptions, runGhJson } from "./transport"

type BranchRead = {
  name?: unknown
  commit?: { commit?: { message?: unknown } }
}

export function commitSubject(message: string) {
  const firstLine = sanitizeGitHubText(message.split(/\r?\n/, 1)[0] ?? "")
    .replace(/\s+/g, " ")
    .trim()
  let title = ""
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    firstLine,
  )) {
    if (title.length + segment.length > 256) break
    title += segment
  }
  return title
}

export async function readGitHubBranchCommitTitle(
  host: string,
  repository: string,
  branch: string,
  options: GhTransportOptions = {},
) {
  if (
    !isValidGitHubHost(host) ||
    !validateRepositoryName(repository) ||
    !validGitHubBranch(branch)
  ) {
    throw new Error("Branch remota inválida.")
  }
  const response = await runGhJson<BranchRead>(
    {
      args: [
        "api",
        "--hostname",
        host,
        `repos/${repository}/branches/${encodeURIComponent(branch)}`,
      ],
    },
    { ...options, host },
  )
  if (response.name !== branch || typeof response.commit?.commit?.message !== "string") {
    throw new Error("Título do último commit indisponível.")
  }
  return commitSubject(response.commit.commit.message)
}
