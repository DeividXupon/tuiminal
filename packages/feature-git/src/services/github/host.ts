const HOST_PATTERN =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

export function isValidGitHubHost(host: string) {
  return HOST_PATTERN.test(host)
}

export function assertAllowedGitHubHost(host: string, allowedHosts: readonly string[]) {
  if (!isValidGitHubHost(host)) throw new Error("Invalid GitHub host")
  if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host.toLowerCase())) {
    throw new Error("GitHub host is not allowed by this profile")
  }
  return host.toLowerCase()
}
