import { useCallback, useEffect, useRef, useState } from "react"
import { translateUi } from "../../../shared/i18n"
import {
  displayGitCommand,
  type GitCommandConsoleLine,
  gitConsoleOutputLines,
  parseGitCommandInput,
} from "../model/git-command-console"
import { sanitizeGitHubText } from "../model/pr/content"
import { runGitCommand } from "../services/git"
import type { GitCommandResult } from "../services/git-command"
import { useGitCommandAutocomplete } from "./use-git-command-autocomplete"

const MAX_CONSOLE_LINES = 2_000
const MAX_VISIBLE_OUTPUT = 256 * 1_024

function commandResultLines(result: GitCommandResult) {
  const lines: Omit<GitCommandConsoleLine, "id">[] = []
  const appendOutput = (value: string, tone: GitCommandConsoleLine["tone"]) => {
    const sanitized = sanitizeGitHubText(value).slice(0, MAX_VISIBLE_OUTPUT)
    lines.push(...gitConsoleOutputLines(sanitized).map((text) => ({ text, tone })))
  }
  appendOutput(result.stdout, "output")
  appendOutput(result.stderr, result.exitCode === 0 ? "muted" : "error")
  if (!lines.length) {
    lines.push({
      text:
        result.exitCode === 0
          ? translateUi("Concluído.")
          : `${translateUi("O comando Git encerrou com código")} ${result.exitCode}.`,
      tone: result.exitCode === 0 ? "success" : "error",
    })
  }
  if (result.truncated) lines.push({ text: `[${translateUi("saída truncada")}]`, tone: "muted" })
  return lines
}

export function useGitCommandConsole({
  root,
  paths,
  refresh,
  onError,
}: {
  root: string | null | undefined
  paths: readonly string[]
  refresh: (showLoading?: boolean) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [value, setValue] = useState("")
  const [lines, setLines] = useState<GitCommandConsoleLine[]>([])
  const [running, setRunning] = useState(false)
  const runningRef = useRef(false)
  const nextLineIdRef = useRef(0)
  const autocomplete = useGitCommandAutocomplete({ root, input: value, paths, onInput: setValue })
  const clearAutocomplete = autocomplete.clear
  const reloadAutocomplete = autocomplete.reload

  useEffect(() => {
    void root
    setValue("")
    setLines([])
    runningRef.current = false
    nextLineIdRef.current = 0
    setRunning(false)
  }, [root])

  const append = useCallback((nextLines: Omit<GitCommandConsoleLine, "id">[]) => {
    const identifiedLines = nextLines.map((line) => ({ ...line, id: nextLineIdRef.current++ }))
    setLines((current) => [...current, ...identifiedLines].slice(-MAX_CONSOLE_LINES))
  }, [])
  const recordCommand = useCallback(
    (args: readonly string[]) =>
      append([{ text: `❯ ${displayGitCommand(args)}`, tone: "command" }]),
    [append],
  )
  const recordResult = useCallback(
    (text: string, success = true) => {
      const sanitized = sanitizeGitHubText(text).slice(0, MAX_VISIBLE_OUTPUT)
      append(
        gitConsoleOutputLines(sanitized).map((line) => ({
          text: line,
          tone: success ? "success" : "error",
        })),
      )
    },
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
    clearAutocomplete()
    runningRef.current = true
    setRunning(true)
    onError(null)
    recordCommand(args)
    try {
      const result = await runGitCommand(root, args, {
        maxOutputBytes: 256 * 1_024,
        mutating: true,
      })
      append(commandResultLines(result))
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
      void reloadAutocomplete()
      runningRef.current = false
      setRunning(false)
    }
  }, [
    append,
    clearAutocomplete,
    onError,
    recordCommand,
    recordResult,
    refresh,
    reloadAutocomplete,
    root,
    value,
  ])

  return {
    value,
    setValue: autocomplete.updateInput,
    lines,
    running,
    recordCommand,
    recordResult,
    submit,
    autocomplete,
  }
}
