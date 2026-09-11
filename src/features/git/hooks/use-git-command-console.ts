import { useCallback, useEffect, useRef, useState } from "react"
import { translateUi } from "../../../shared/i18n"
import {
  displayGitCommand,
  type GitCommandConsoleLine,
  parseGitCommandInput,
} from "../model/git-command-console"
import { sanitizeGitHubText } from "../model/pr/content"
import { runGitCommand } from "../services/git"
import type { GitCommandResult } from "../services/git-command"

const MAX_CONSOLE_LINES = 40
const MAX_VISIBLE_OUTPUT = 1_000

function resultLine(result: GitCommandResult) {
  const output = sanitizeGitHubText([result.stderr, result.stdout].filter(Boolean).join("\n"))
  const compact = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" · ")
  const text =
    compact ||
    (result.exitCode === 0
      ? translateUi("Concluído.")
      : `${translateUi("O comando Git encerrou com código")} ${result.exitCode}.`)
  return `${text.slice(0, MAX_VISIBLE_OUTPUT)}${result.truncated ? ` · ${translateUi("saída truncada")}` : ""}`
}

export function useGitCommandConsole({
  root,
  refresh,
  onError,
}: {
  root: string | null | undefined
  refresh: (showLoading?: boolean) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [value, setValue] = useState("")
  const [lines, setLines] = useState<GitCommandConsoleLine[]>([])
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  const nextLineIdRef = useRef(0)

  useEffect(() => {
    void root
    setValue("")
    setLines([])
    runningRef.current = false
    nextLineIdRef.current = 0
    setRunning(false)
  }, [root])

  const append = useCallback((line: Omit<GitCommandConsoleLine, "id">) => {
    const identifiedLine = { ...line, id: nextLineIdRef.current++ }
    setLines((current) => [...current, identifiedLine].slice(-MAX_CONSOLE_LINES))
  }, [])
  const recordCommand = useCallback(
    (args: readonly string[]) => append({ text: `❯ ${displayGitCommand(args)}`, tone: "command" }),
    [append],
  )
  const recordResult = useCallback(
    (text: string, success = true) =>
      append({
        text: sanitizeGitHubText(text.replace(/\r?\n/g, " · ")).slice(0, MAX_VISIBLE_OUTPUT),
        tone: success ? "success" : "error",
      }),
    [append],
  )
  const submit = useCallback(async () => {
    if (!root || runningRef.current) return
    let args: string[]
    try {
      args = parseGitCommandInput(value)
    } catch (error) {
      recordResult(
        translateUi(error instanceof Error ? error.message : "Comando Git inválido."),
        false,
      )
      return
    }
    setValue("")
    runningRef.current = true
    setRunning(true)
    onError(null)
    recordCommand(args)
    try {
      const result = await runGitCommand(root, args, {
        maxOutputBytes: 256 * 1_024,
        mutating: true,
      })
      recordResult(resultLine(result), result.exitCode === 0)
      if (result.exitCode !== 0) {
        onError(`${translateUi("O comando Git encerrou com código")} ${result.exitCode}.`)
      }
    } catch (error) {
      const message = translateUi(
        error instanceof Error ? error.message : "Não foi possível executar o Git.",
      )
      recordResult(message, false)
      onError(message)
    } finally {
      await refresh(false)
      runningRef.current = false
      setRunning(false)
    }
  }, [onError, recordCommand, recordResult, refresh, root, value])

  return { value, setValue, lines, running, recordCommand, recordResult, submit }
}
