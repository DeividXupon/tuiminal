import type { TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { terminalRemoteProfileValidationError } from "@xupon/tuiminal-core/settings/theme"
import type { ProjectDirectory } from "../model/agent-project"
import { remoteNonInteractiveSshCommand } from "./remote-codex-connection"

// Fixed, read-only POSIX script. Paths are quoted positional arguments, never shell source.
export const PROJECT_DIRECTORY_SCRIPT = String.raw`
export LC_ALL=C
path=$1
base=$2
case "$base" in '~') base=$HOME ;; esac
case "$path" in '~') path=$HOME ;; '~/'*) path=$HOME/${"$"}{path#\~/} ;; esac
case "$base" in /*) ;; *) exit 72 ;; esac
cd "$base" 2>/dev/null || exit 72
case "$path" in /*) ;; *) path=./$path ;; esac
cd "$path" 2>/dev/null || exit 72
[ -r . ] && [ -x . ] || exit 72
root=$(pwd -P)
printf 'TUIMINAL_PROJECTS\000%s\000' "$root"
if [ "$3" = list ]; then
  count=0
  for entry in ./* ./.[!.]* ./..?*; do
    [ -d "$entry" ] || continue
    count=$((count + 1))
    if [ "$count" -gt 2000 ]; then printf 'TRUNCATED\000'; exit 0; fi
    printf '%s\000' "${"$"}{root%/}/${"$"}{entry#./}"
  done
fi
printf 'END\000'
`

function quote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function projectDirectorySshCommand(
  profile: TerminalRemoteCodexProfile,
  path: string,
  base: string,
  list: boolean,
) {
  if (
    terminalRemoteProfileValidationError(profile) ||
    [path, base].some((value) => value.length > 4_096 || /[\p{Cc}\p{Cf}]/u.test(value))
  )
    throw new Error("Não foi possível acessar a pasta selecionada.")
  return remoteNonInteractiveSshCommand(
    profile,
    `sh -s -- ${quote(path)} ${quote(base)} ${list ? "list" : "resolve"}`,
  )
}

export function parseProjectDirectoryOutput(output: string): ProjectDirectory {
  const fields = output.split("\0")
  if (fields.shift() !== "TUIMINAL_PROJECTS" || fields.pop() !== "")
    throw new Error("Não foi possível listar as pastas remotas.")
  const path = fields.shift() ?? ""
  const end = fields.pop()
  if (
    !path.startsWith("/") ||
    path.length > 4_096 ||
    /[\p{Cc}\p{Cf}]/u.test(path) ||
    !["END", "TRUNCATED"].includes(end ?? "")
  )
    throw new Error("Não foi possível listar as pastas remotas.")
  const directories = fields.filter(
    (value) => value.startsWith("/") && value.length <= 4_096 && !/[\p{Cc}\p{Cf}]/u.test(value),
  )
  if (directories.length > 2_000) throw new Error("Não foi possível listar as pastas remotas.")
  return { path, directories: directories.sort(), truncated: end === "TRUNCATED" }
}

async function boundedText(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
  overflow: () => void,
) {
  let bytes = 0
  let output = ""
  const decoder = new TextDecoder()
  for await (const chunk of stream) {
    bytes += chunk.byteLength
    if (bytes > maximum) {
      overflow()
      throw new Error("Não foi possível listar as pastas remotas.")
    }
    output += decoder.decode(chunk, { stream: true })
  }
  return output + decoder.decode()
}

export async function readRemoteProjectDirectory(
  profile: TerminalRemoteCodexProfile,
  path: string,
  base: string,
  signal: AbortSignal,
  list: boolean,
  options: { command?: string[]; timeoutMs?: number; script?: string } = {},
): Promise<ProjectDirectory> {
  signal.throwIfAborted()
  const command = options.command ?? projectDirectorySshCommand(profile, path, base, list)
  let child: ReturnType<typeof Bun.spawn>
  try {
    child = Bun.spawn(command, {
      stdin: new Blob([options.script ?? PROJECT_DIRECTORY_SCRIPT]),
      stdout: "pipe",
      stderr: "pipe",
    })
  } catch {
    throw new Error("O cliente SSH local não está disponível.")
  }
  const stop = () => {
    child.kill("SIGKILL")
  }
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    stop()
  }, options.timeoutMs ?? 10_000)
  signal.addEventListener("abort", stop, { once: true })
  try {
    const [code, output, error] = await Promise.all([
      child.exited,
      boundedText(child.stdout as ReadableStream<Uint8Array>, 8 * 1024 * 1024, stop),
      boundedText(child.stderr as ReadableStream<Uint8Array>, 16_384, stop),
    ])
    signal.throwIfAborted()
    if (timedOut) throw new Error("A consulta de pastas excedeu o tempo limite.")
    if (code === 72) throw new Error("Não foi possível acessar a pasta selecionada.")
    if (code !== 0) {
      if (/host key verification failed/i.test(error))
        throw new Error("A identidade do host remoto não pôde ser confirmada.")
      if (/permission denied/i.test(error))
        throw new Error("A chave SSH foi recusada pelo servidor remoto.")
      throw new Error("Não foi possível alcançar o servidor remoto.")
    }
    return parseProjectDirectoryOutput(output)
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", stop)
    if (child.exitCode === null) stop()
    await child.exited
  }
}
