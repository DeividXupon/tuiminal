import type { IssueIdentity } from "../../model/issue/types"
import { type GhTransportOptions, runGhCommand } from "./transport"

export function openIssueInBrowser(identity: IssueIdentity, options: GhTransportOptions = {}) {
  return runGhCommand(
    {
      args: [
        "issue",
        "view",
        String(identity.number),
        "--repo",
        `${identity.owner}/${identity.repository}`,
        "--web",
      ],
    },
    { ...options, host: identity.host },
  )
}
