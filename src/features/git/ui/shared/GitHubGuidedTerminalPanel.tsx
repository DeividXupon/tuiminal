import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { COLORS, LAYOUT } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import {
  type GitHubCliGuidedTerminalProcess,
  startGitHubCliGuidedTerminal,
} from "../../services/github/installer"
import {
  githubGuidanceCopy,
  type GitHubGuidanceMode,
  type GitHubGuidanceStatus,
} from "./github-guidance-copy"
import { GitHubGuidanceGuide, GitHubGuidanceTerminal } from "./GitHubGuidanceViews"

export type GitHubGuidedTerminalStarter = typeof startGitHubCliGuidedTerminal

type ReadinessResult = { kind: "ready" | "waiting" } | { kind: "error"; message: string }

async function checkReadiness(verifyReady: () => Promise<boolean>): Promise<ReadinessResult> {
  try {
    return (await verifyReady()) ? { kind: "ready" } : { kind: "waiting" }
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Não foi possível verificar o gh.",
    }
  }
}

export function GitHubGuidedTerminalPanel({
  active,
  mode,
  command,
  commandAvailable,
  metadata,
  guideUrl,
  onRetry,
  verifyReady,
  startTerminal = startGitHubCliGuidedTerminal,
  pollIntervalMs = 1_500,
}: {
  active: boolean
  mode: GitHubGuidanceMode
  command: string
  commandAvailable: boolean
  metadata: string
  guideUrl: string
  onRetry: () => void
  verifyReady: () => Promise<boolean>
  startTerminal?: GitHubGuidedTerminalStarter | undefined
  pollIntervalMs?: number | undefined
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const processRef = useRef<GitHubCliGuidedTerminalProcess | null>(null)
  const mountedRef = useRef(true)
  const checkingRef = useRef(false)
  const reloadingRef = useRef(false)
  const [status, setStatus] = useState<GitHubGuidanceStatus>("idle")
  const [message, setMessage] = useState("")
  const [terminalVisible, setTerminalVisible] = useState(false)
  const copy = githubGuidanceCopy(mode, mode === "install")
  const sideBySide = terminal.width >= 96 && terminal.height >= 18
  const stacked = !sideBySide && terminal.height >= 30
  const singlePanel = !sideBySide && !stacked

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      processRef.current?.stop()
      processRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active || processRef.current) return
    try {
      processRef.current = startTerminal({
        columns: Math.max(20, terminalRef.current?.width ?? 80),
        rows: Math.max(5, terminalRef.current?.height ?? 16),
        onData: (data) => terminalRef.current?.write(data),
        onExit: (result) => {
          processRef.current = null
          if (!mountedRef.current || result.stopped) return
          setStatus("failed")
          setMessage(
            "O mini terminal foi encerrado. Saia e volte a esta tela para abri-lo novamente.",
          )
        },
      })
    } catch (error) {
      setStatus("failed")
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o mini terminal.")
    }
    return () => {
      processRef.current?.stop()
      processRef.current = null
    }
  }, [active, startTerminal])

  const verifyAndReload = useCallback(
    async (showFailure: boolean) => {
      if (!mountedRef.current || checkingRef.current || reloadingRef.current) return
      checkingRef.current = true
      if (showFailure) setStatus("checking")
      const result = await checkReadiness(verifyReady)
      checkingRef.current = false
      if (!mountedRef.current) return
      if (result.kind !== "ready") {
        if (showFailure) {
          setStatus("failed")
          setMessage(result.kind === "error" ? result.message : copy.unavailable)
        }
        return
      }
      reloadingRef.current = true
      setMessage("")
      setStatus("ready")
      terminalRef.current?.write(
        `\r\n\u001b[32m${translateUi("✓ Tudo pronto. Recarregando Git…")}\u001b[0m\r\n`,
      )
      onRetry()
    },
    [copy.unavailable, onRetry, verifyReady],
  )

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => void verifyAndReload(false), pollIntervalMs)
    return () => clearInterval(timer)
  }, [active, pollIntervalMs, verifyAndReload])

  const focusTerminal = useCallback(() => {
    setTerminalVisible(true)
    queueMicrotask(() => terminalRef.current?.focus())
  }, [])

  const copyCommand = useCallback(() => {
    if (!commandAvailable) return
    const copied = renderer.copyToClipboardOSC52(command)
    setMessage(
      copied
        ? "Comando copiado. Cole no mini terminal usando o atalho de colar do seu terminal."
        : "O terminal não aceitou a cópia OSC52; digite o comando exibido no mini terminal.",
    )
  }, [command, commandAvailable, renderer])

  useKeyboard((key) => {
    if (!active) return
    const terminalFocused = renderer.currentFocusedRenderable?.id === "git-gh-guidance-terminal"
    if (terminalFocused) {
      if (key.name === "escape") {
        key.preventDefault()
        key.stopPropagation()
        terminalRef.current?.blur()
        if (singlePanel) setTerminalVisible(false)
      }
      return
    }
    if (key.name === "c" && commandAvailable) {
      key.preventDefault()
      key.stopPropagation()
      copyCommand()
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      key.stopPropagation()
      focusTerminal()
    } else if (key.name === "r") {
      key.preventDefault()
      key.stopPropagation()
      void verifyAndReload(true)
    }
  })

  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: sideBySide ? "row" : "column",
        gap: LAYOUT.gap,
        backgroundColor: COLORS.canvas,
      }}
    >
      <GitHubGuidanceGuide
        copy={copy}
        mode={mode}
        singlePanel={singlePanel}
        visible={!singlePanel || !terminalVisible}
        sideBySide={sideBySide}
        stacked={stacked}
        command={command}
        commandAvailable={commandAvailable}
        metadata={metadata}
        guideUrl={guideUrl}
        status={status}
        message={message}
        onCopy={copyCommand}
        onOpenTerminal={focusTerminal}
        onVerify={() => void verifyAndReload(true)}
      />
      <GitHubGuidanceTerminal
        copy={copy}
        status={status}
        visible={!singlePanel || terminalVisible}
        terminalRef={terminalRef}
        processRef={processRef}
      />
    </box>
  )
}
