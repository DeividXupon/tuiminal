import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { open } from "node:fs/promises"
import { Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { RemoteServerProfile } from "../model/sessions"
import type { AgentDroppedFile } from "./agent-file-drop"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"

export const REMOTE_AGENT_FILES_ROOT = "/tmp/tuiminal-agents"
const UPLOAD_ERROR = "Não foi possível enviar o arquivo ao servidor."
const CHANGED_ERROR = "O arquivo local mudou. Solte o arquivo novamente."
const quote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`

function uploadScript(directory: string, path: string, size: number) {
  return `set -eu
umask 077
root=${quote(REMOTE_AGENT_FILES_ROOT)}
mkdir -m 700 "$root" 2>/dev/null || true
[ -d "$root" ] && [ ! -L "$root" ]
[ "$(stat -c %u "$root")" = "$(id -u)" ]
chmod 700 "$root"
directory=${quote(directory)}
mkdir -m 700 "$directory"
trap 'rm -rf -- "$directory"' EXIT HUP INT TERM
path=${quote(path)}
cat > "$path"
[ "$(wc -c < "$path" | tr -d ' ')" = ${quote(String(size))} ]
digest=$(sha256sum < "$path")
printf 'TUIMINAL_UPLOAD_OK %s\\n' "\${digest%% *}"
trap - EXIT HUP INT TERM`
}

type UploadOptions = {
  onProgress?: (bytes: number) => void
  /** An isolated command adapter for transport tests. */
  command?: (script: string) => readonly string[]
  timeoutMs?: number
}

export async function uploadRemoteAgentFile(
  profile: RemoteServerProfile,
  file: AgentDroppedFile,
  signal: AbortSignal,
  options: UploadOptions = {},
) {
  signal.throwIfAborted()
  const source = await open(file.path, "r").catch(() => {
    throw new Error(CHANGED_ERROR)
  })
  try {
    const info = await source.stat()
    if (
      !info.isFile() ||
      info.size !== file.size ||
      info.mtimeMs !== file.modified ||
      info.ctimeMs !== file.changed ||
      info.dev !== file.device ||
      info.ino !== file.inode
    )
      throw new Error(CHANGED_ERROR)
    const directory = `${REMOTE_AGENT_FILES_ROOT}/${randomUUID()}`
    const path = `${directory}/${file.name}`
    const script = uploadScript(directory, path, file.size)
    const command = options.command?.(script) ?? remoteNonInteractiveSshCommand(profile, script)
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 120_000)
    const combined = AbortSignal.any([signal, deadline])
    combined.throwIfAborted()
    const executable = command[0]
    if (!executable) throw new Error(UPLOAD_ERROR)
    const child = spawn(executable, command.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    const hash = createHash("sha256")
    let bytes = 0
    let reportedAt = 0
    let output = ""
    child.stdout.on("data", (data: Buffer) => {
      output = (output + data.toString()).slice(-1024)
    })
    child.stderr.resume()
    const exited = new Promise<number | null>((resolveExit, reject) => {
      child.once("error", () => reject(new Error(UPLOAD_ERROR)))
      child.once("close", resolveExit)
    })
    const stop = () => child.kill()
    combined.addEventListener("abort", stop, { once: true })
    const stream = source.createReadStream({ autoClose: false })
    const digest = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk)
        bytes += chunk.length
        if (Date.now() - reportedAt >= 80 || bytes === file.size) {
          reportedAt = Date.now()
          options.onProgress?.(bytes)
        }
        callback(null, chunk)
      },
    })
    try {
      const [transfer, exit] = await Promise.allSettled([
        pipeline(stream, digest, child.stdin, { signal: combined }),
        exited,
      ])
      if (signal.aborted) signal.throwIfAborted()
      if (deadline.aborted) throw new Error("O envio do arquivo excedeu o tempo limite.")
      if (transfer.status === "rejected" || exit.status === "rejected" || exit.value !== 0)
        throw new Error(UPLOAD_ERROR)
      if (!output.split(/\r?\n/u).includes(`TUIMINAL_UPLOAD_OK ${hash.digest("hex")}`))
        throw new Error(UPLOAD_ERROR)
      const after = await source.stat()
      if (
        after.size !== info.size ||
        after.mtimeMs !== info.mtimeMs ||
        after.ctimeMs !== info.ctimeMs
      )
        throw new Error(CHANGED_ERROR)
      return path
    } finally {
      combined.removeEventListener("abort", stop)
      stream.destroy()
      if (child.exitCode === null) child.kill()
    }
  } finally {
    await source.close()
  }
}
