export type GitHubRepositoryReference = { host: string; repository: string }

export function parseGitHubRemote(remote: string): GitHubRepositoryReference | null {
  const value = remote.trim().replace(/\.git$/, "")
  const ssh = value.match(/^git@([^:]+):([^/]+)\/(.+)$/)
  if (ssh) return { host: ssh[1]?.toLowerCase() ?? "", repository: `${ssh[2]}/${ssh[3]}` }
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "ssh:") return null
    const repository = url.pathname.replace(/^\//, "")
    return repository.includes("/") ? { host: url.hostname.toLowerCase(), repository } : null
  } catch {
    return null
  }
}
