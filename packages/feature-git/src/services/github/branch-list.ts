import { validGitHubBranch } from "../../model/create-item"
import { validateRepositoryName } from "../../model/pr/query"
import { isValidGitHubHost } from "./host"
import { type GhTransportOptions, runGhJson } from "./transport"

const PAGE_SIZE = 100

export async function listGitHubRepositoryBranches(
  host: string,
  repository: string,
  page: number,
  options: GhTransportOptions = {},
): Promise<{ branches: string[]; nextPage: number | null }> {
  if (!isValidGitHubHost(host) || !validateRepositoryName(repository)) {
    throw new Error("Informe owner/repository válido.")
  }
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Página de branches inválida.")
  const result = await runGhJson<unknown>(
    {
      args: [
        "api",
        "--hostname",
        host,
        `repos/${repository}/branches?per_page=${PAGE_SIZE}&page=${page}`,
      ],
    },
    { ...options, host },
  )
  if (
    !Array.isArray(result) ||
    result.length > PAGE_SIZE ||
    result.some((item) => !item || typeof item !== "object" || typeof item.name !== "string")
  ) {
    throw new Error("Resposta de branches inválida.")
  }
  return {
    branches: result.map((item) => item.name as string).filter(validGitHubBranch),
    nextPage: result.length === PAGE_SIZE ? page + 1 : null,
  }
}
