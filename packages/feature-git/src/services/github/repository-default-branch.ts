import { validGitHubBranch } from "../../model/create-item"
import { validateRepositoryName } from "../../model/pr/query"
import { isValidGitHubHost } from "./host"
import { type GhTransportOptions, runGhJson } from "./transport"

type RepositoryRead = {
  full_name?: unknown
  default_branch?: unknown
}

export async function readGitHubRepositoryDefaultBranch(
  host: string,
  repository: string,
  options: GhTransportOptions = {},
) {
  if (!isValidGitHubHost(host) || !validateRepositoryName(repository)) {
    throw new Error("Repositório GitHub inválido.")
  }
  const response = await runGhJson<RepositoryRead>(
    { args: ["api", "--hostname", host, `repos/${repository}`] },
    { ...options, host },
  )
  if (
    typeof response.full_name !== "string" ||
    response.full_name.toLowerCase() !== repository.toLowerCase() ||
    typeof response.default_branch !== "string" ||
    !validGitHubBranch(response.default_branch)
  ) {
    throw new Error("Branch padrão do repositório indisponível.")
  }
  return response.default_branch
}
