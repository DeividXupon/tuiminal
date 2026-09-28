import { posix } from "node:path"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import type { RemoteCodexTarget } from "../model/sessions"
import { remoteLiveDiffSshCommand } from "./remote-live-diff-helper"
import { RemoteLiveDiffProtocol } from "./remote-live-diff-protocol"

export type RemoteTerminalContextSource = {
  read: (signal: AbortSignal) => Promise<TerminalRepositoryContext>
  close: () => void
}

function safeValue(value: string, maximum: number) {
  return Boolean(value && value.length <= maximum && !/[\p{Cc}\p{Cf}]/u.test(value))
}

export function createRemoteTerminalContextSource(
  remote: RemoteCodexTarget,
  options: { command?: readonly string[]; requestTimeoutMs?: number } = {},
): RemoteTerminalContextSource {
  let protocol: RemoteLiveDiffProtocol | null = null
  let disposed = false
  const command =
    options.command ?? remoteLiveDiffSshCommand(remote.profile, remote.workingDirectory)
  const request = (signal: AbortSignal) => {
    if (disposed) return Promise.reject(new Error("Contexto remoto fechado."))
    if (!protocol || protocol.closed)
      protocol = new RemoteLiveDiffProtocol(command, options.requestTimeoutMs)
    return protocol.request("context", [], signal)
  }
  return {
    async read(signal) {
      const result = await request(signal)
      if (result.status !== 0) {
        if (result.status === 128 && /not a git repository/u.test(result.stderr)) {
          return {
            directory: remote.workingDirectory,
            projectName: posix.basename(remote.workingDirectory) || remote.workingDirectory,
            state: "no-git",
          }
        }
        throw new Error(result.stderr.trim() || "Não foi possível ler o contexto Git remoto.")
      }
      const [root = "", branch = "", state = ""] = result.stdout.split("\0")
      if (
        !root.startsWith("/") ||
        !safeValue(root, 4096) ||
        !safeValue(branch, 512) ||
        (state !== "clean" && state !== "dirty")
      )
        throw new Error("Resposta de contexto Git remoto inválida.")
      return {
        directory: remote.workingDirectory,
        projectName: posix.basename(root) || root,
        branch,
        state,
      }
    },
    close() {
      disposed = true
      protocol?.close()
      protocol = null
    },
  }
}
