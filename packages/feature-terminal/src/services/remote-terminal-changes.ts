import type { RemoteLiveDiffProtocolResult } from "./remote-live-diff-protocol"
import { readTerminalRepositoryChanges } from "./terminal-repository-changes"

type Request = (
  operation: string,
  fields: readonly string[],
) => Promise<RemoteLiveDiffProtocolResult>

export async function readRemoteTerminalChanges(root: string, request: Request) {
  const read = async (operation: string, fields: readonly string[]) => {
    const result = await request(operation, fields)
    if (result.status !== 0) throw new Error(result.stderr || "Git indisponível.")
    return result.stdout
  }
  const status = await read("status", [root])
  return readTerminalRepositoryChanges(status, {
    headExists: async () => (await request("head", [root])).status === 0,
    numstat: () => read("numstat", [root]),
    newLines: async (paths) => {
      const safe = paths.filter(
        (path) =>
          !path.startsWith("/") && !path.split("/").includes("..") && !/[\p{Cc}\p{Cf}]/u.test(path),
      )
      if (!safe.length) return { additions: 0, partial: true }
      const output = await read("file-info", [root, safe.map((path) => `U${path}`).join("\n")])
      let additions = 0
      let partial = safe.length !== paths.length
      const lines = output.trimEnd().split("\n")
      for (let index = 0; index < safe.length; index++) {
        const fields = (lines[index] ?? "").split("\t")
        if (fields[4] === "1") continue
        const count = Number(fields[3])
        if (Number.isSafeInteger(count) && count >= 0) additions += count
        else partial = true
      }
      return { additions, partial }
    },
  })
}
