import { isAbsolute } from "node:path"
import type { BoxRenderable, EmbeddedTerminalRenderable, KeyEvent } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  COLORS,
  matchesTerminalMasterKey,
  type TerminalMasterKey,
  type TerminalRemoteCodexProfile,
} from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { useEffect, useRef, useState } from "react"
import { remoteInteractiveSshCommand } from "../services/remote-codex-connection"
import {
  createShellTerminalCommand,
  type TermAgentsProcessHandle,
  startTermAgentsProcess,
} from "../services/terminal"
import { TerminalShortcutText } from "./TerminalShortcut"

// biome-ignore lint/complexity/useRegexLiterals: constructor escapes avoid literal control characters rejected by the linter.
const ANSI_SEQUENCE = new RegExp(
  "\\x1b(?:\\[[0-?]*[ -/]*[@-~]|\\][^\\x07]*(?:\\x07|\\x1b\\\\))",
  "g",
)

function consume(key: KeyEvent) {
  key.preventDefault()
  key.stopPropagation()
}

export function AgentDirectoryDialog({
  profile,
  masterKey,
  onConfirm,
  onClose,
}: {
  profile?: TerminalRemoteCodexProfile
  masterKey: TerminalMasterKey
  onConfirm: (workingDirectory: string) => void
  onClose: () => void
}) {
  const remote = Boolean(profile)
  const dialog = useRef<BoxRenderable | null>(null)
  const dimensions = useTerminalDimensions()
  const terminal = useRef<EmbeddedTerminalRenderable | null>(null)
  const processHandle = useRef<TermAgentsProcessHandle | null>(null)
  const closing = useRef(false)
  const output = useRef("")
  const decoder = useRef(new TextDecoder())
  const onConfirmRef = useRef(onConfirm)
  const onCloseRef = useRef(onClose)
  onConfirmRef.current = onConfirm
  onCloseRef.current = onClose
  const marker = useRef(`TUIMINAL_AGENT_CWD_${crypto.randomUUID().replaceAll("-", "")}`)
  const [error, setError] = useState("")

  const close = () => {
    if (closing.current) return
    closing.current = true
    void processHandle.current?.stop().catch(() => undefined)
    onCloseRef.current()
  }

  useEffect(() => {
    const command = profile
      ? remoteInteractiveSshCommand(profile)
      : createShellTerminalCommand().command
    const handle = startTermAgentsProcess(command, {
      onData(data) {
        terminal.current?.write(data)
        output.current = `${output.current}${decoder.current.decode(data, { stream: true })}`
          .replace(ANSI_SEQUENCE, "")
          .slice(-16_384)
        const match = output.current.match(
          new RegExp(`(?:^|\\r?\\n)${marker.current}:([^\\r\\n]+)`),
        )
        const workingDirectory = match?.[1]?.trim() ?? ""
        const valid = profile ? workingDirectory.startsWith("/") : isAbsolute(workingDirectory)
        if (!valid || closing.current) return
        closing.current = true
        void handle.stop().catch(() => undefined)
        onConfirmRef.current(workingDirectory)
      },
      onExit() {
        if (!closing.current) {
          closing.current = true
          onCloseRef.current()
        }
      },
    })
    processHandle.current = handle
    queueMicrotask(() => terminal.current?.focus())
    return () => {
      closing.current = true
      void handle.stop().catch(() => undefined)
    }
  }, [profile])

  useKeyboard((key) => {
    if (key.name === "escape") {
      consume(key)
      close()
      return
    }
    if (!matchesTerminalMasterKey(key, masterKey)) return
    consume(key)
    setError("")
    const handle = processHandle.current
    if (!handle) {
      setError(translateUi("O terminal ainda não está pronto."))
      return
    }
    const confirmation =
      !profile && process.platform === "win32"
        ? `echo ${marker.current}:%CD%\r\n`
        : `printf '\\n${marker.current}:%s\\n' "$PWD"\n`
    handle.write(confirmation)
  })

  const mode = remote ? "remote" : "local"
  const title = remote ? "ESCOLHA A PASTA REMOTA" : "ESCOLHA A PASTA LOCAL"
  return (
    <ModalSurface
      dialogRef={dialog}
      id={`${mode}-agent-directory-dialog`}
      width={Math.max(1, Math.min(90, dimensions.width - 2))}
      height={Math.max(1, Math.min(28, dimensions.height - 2))}
      zIndex={810}
      borderColor={COLORS.terminal}
      dialogFocusable={false}
      onBackdropPress={close}
    >
      <text
        content={`◆ ${translateUi(title)}${profile ? ` · ${profile.name}` : ""}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
      />
      <text
        content={translateUi("Use cd para entrar na pasta do projeto.")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <TerminalShortcutText
        content={translateUi("[Master Key] confirmar · [Esc] cancelar · exit cancelar").replace(
          "Master Key",
          masterKey,
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      {error && <text content={error} style={{ height: 1, flexShrink: 0, fg: COLORS.danger }} />}
      <embedded-terminal
        ref={terminal}
        id={`${mode}-agent-directory-terminal`}
        maxScrollback={2_000}
        selectable
        onData={(data) => processHandle.current?.write(data)}
        onTerminalResize={(columns, rows) => processHandle.current?.resize(columns, rows)}
        style={{ width: "100%", flexGrow: 1, minHeight: 1 }}
      />
    </ModalSurface>
  )
}
