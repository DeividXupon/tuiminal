import {
  boundedPullRequestDiff,
  type PullRequestDiffSnapshot,
  type PullRequestDiffTarget,
} from "../../model/pr/diff"
import type { PullRequestIdentity } from "../../model/pr/types"
import { type GhTransportOptions, runGhCommand } from "./transport"

function diffRequest(identity: PullRequestIdentity, target: PullRequestDiffTarget) {
  if (target.kind === "commit") {
    return {
      args: [
        "api",
        `repos/${identity.owner}/${identity.repository}/commits/${target.sha}`,
        "--hostname",
        identity.host,
        "--header",
        "Accept: application/vnd.github.v3.diff",
      ],
    }
  }
  return {
    args: [
      "pr",
      "diff",
      String(identity.number),
      "--repo",
      `${identity.owner}/${identity.repository}`,
      "--color",
      "never",
    ],
  }
}

export async function loadPullRequestDiff({
  identity,
  target,
  baseSha,
  headSha,
  options = {},
}: {
  identity: PullRequestIdentity
  target: PullRequestDiffTarget
  baseSha: string
  headSha: string
  options?: GhTransportOptions
}): Promise<PullRequestDiffSnapshot> {
  const result = await runGhCommand(diffRequest(identity, target), {
    ...options,
    host: identity.host,
    maxOutputBytes: 2 * 1024 * 1024 + 64 * 1024,
  })
  const bounded = boundedPullRequestDiff(result.stdout)
  return { identity, target, baseSha, headSha, ...bounded }
}
