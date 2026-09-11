import type { EmbeddedTerminalRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { COLORS, LAYOUT } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import {
  type GitHubCliGuidedTerminalProcess,
  startGitHubCliGuidedTerminal,
} from "../../services/github/installer"
import { GitHubGuidanceGuide, GitHubGuidanceTerminal } from "./GitHubGuidanceViews"
import {
  type GitHubGuidanceMode,
  type GitHubGuidanceStatus,
  githubGuidanceCopy,
} from "./github-guidance-copy"

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

function useGuidedTerminalKeyboard({
  active,
  terminalClosed,
  commandAvailable,
  copyCommand,
  focusTerminal,
  hideTerminal,
  reopenTerminal,
  verify,
}: {
  active: boolean
  terminalClosed: boolean
  commandAvailable: boolean
  copyCommand: () => void
  focusTerminal: () => void
  hideTerminal: () => void
  reopenTerminal: () => void
  verify: () => void
}) {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (!active) return
    const terminalFocused = renderer.currentFocusedRenderable?.id === "git-gh-guidance-terminal"
    if (terminalFocused) {
      if (key.name === "escape") {
        key.preventDefault()
        key.stopPropagation()
        hideTerminal()
      } else if (terminalClosed && (key.name === "return" || key.name === "enter")) {
        key.preventDefault()
        key.stopPropagation()
        reopenTerminal()
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
      verify()
    }
  })
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
  const terminalGenerationRef = useRef(0)
  const requestedTerminalRevisionRef = useRef(0)
  const mountedRef = useRef(true)
  const checkingRef = useRef(false)
  const reloadingRef = useRef(false)
  const [status, setStatus] = useState<GitHubGuidanceStatus>("idle")
  const [message, setMessage] = useState("")
  const [terminalVisible, setTerminalVisible] = useState(false)
  const [terminalClosed, setTerminalClosed] = useState(false)
  const [terminalRevision, setTerminalRevision] = useState(0)
  requestedTerminalRevisionRef.current = terminalRevision
  const copy = githubGuidanceCopy(mode, mode === "install")
  const sideBySide = terminal.width >= 96 && terminal.height >= 18
  const stacked = !sideBySide && terminal.height >= 30
  const singlePanel = !sideBySide && !stacked

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      terminalGenerationRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const generation = terminalGenerationRef.current + 1
    const requestedRevision = terminalRevision
    terminalGenerationRef.current = generation
    let ownedProcess: GitHubCliGuidedTerminalProcess | null = null
    setTerminalClosed(false)
    try {
      ownedProcess = startTerminal({
        columns: Math.max(20, terminalRef.current?.width ?? 80),
        rows: Math.max(5, terminalRef.current?.height ?? 16),
        onData: (data) => terminalRef.current?.write(data),
        onExit: (result) => {
          queueMicrotask(() => {
            if (
              terminalGenerationRef.current !== generation ||
              requestedTerminalRevisionRef.current !== requestedRevision ||
              processRef.current !== ownedProcess
            )
              return
            processRef.current = null
            if (!mountedRef.current) return
            setTerminalClosed(true)
            if (result.stopped) return
            setStatus("failed")
            setMessage("O mini terminal foi encerrado. Pressione [Enter] para abri-lo novamente.")
          })
        },
      })
      processRef.current = ownedProcess
    } catch (error) {
      setTerminalClosed(true)
      setStatus("failed")
      setMessage(error instanceof Error ? error.message : "Não foi possível abrir o mini terminal.")
    }
    return () => {
      if (terminalGenerationRef.current === generation) terminalGenerationRef.current += 1
      if (processRef.current === ownedProcess) processRef.current = null
      ownedProcess?.stop()
    }
  }, [active, startTerminal, terminalRevision])

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

  const reopenTerminal = useCallback(() => {
    if (processRef.current) return
    setMessage("")
    setStatus("idle")
    setTerminalClosed(false)
    setTerminalRevision((current) => current + 1)
  }, [])

  const focusTerminal = useCallback(() => {
    setTerminalVisible(true)
    if (terminalClosed) reopenTerminal()
    queueMicrotask(() => terminalRef.current?.focus())
  }, [reopenTerminal, terminalClosed])

  const copyCommand = useCallback(() => {
    if (!commandAvailable) return
    const copied = renderer.copyToClipboardOSC52(command)
    setMessage(
      copied
        ? "Comando copiado. Cole no mini terminal usando o atalho de colar do seu terminal."
        : "O terminal não aceitou a cópia OSC52; digite o comando exibido no mini terminal.",
    )
  }, [command, commandAvailable, renderer])

  const hideTerminal = useCallback(() => {
    terminalRef.current?.blur()
    if (singlePanel) setTerminalVisible(false)
  }, [singlePanel])

  useGuidedTerminalKeyboard({
    active,
    terminalClosed,
    commandAvailable,
    copyCommand,
    focusTerminal,
    hideTerminal,
    reopenTerminal,
    verify: () => void verifyAndReload(true),
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
        terminalClosed={terminalClosed}
        onCopy={copyCommand}
        onOpenTerminal={focusTerminal}
        onVerify={() => void verifyAndReload(true)}
      />
      <GitHubGuidanceTerminal
        copy={copy}
        status={status}
        terminalClosed={terminalClosed}
        visible={!singlePanel || terminalVisible}
        terminalRef={terminalRef}
        processRef={processRef}
      />
    </box>
  )
}
