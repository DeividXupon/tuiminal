import { EmbeddedTerminalRenderable, type BoxRenderable } from "@opentui/core"
import { extend, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Button } from "@tuiparts/react/button"
import { useEffect, useRef, useState } from "react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import {
  forceKillOwnedProcessTree,
  OWNED_PROCESS_STOP_GRACE_MS,
  OWNED_PROCESS_STOP_DEADLINE_MS,
  processStopDeadlineError,
  signalOwnedProcessGroup,
} from "@xupon/tuiminal-core/process/owned-process"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { GitBrowser } from "../../model/browser"
import {
  gitBrowserCommand,
  gitBrowserExecutable,
  registerGitBrowserDisposer,
} from "../../services/browser"

extend({ "git-browser-terminal": EmbeddedTerminalRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "git-browser-terminal": typeof EmbeddedTerminalRenderable
  }
}

type TerminalProcess = {
  write: (data: string | Uint8Array) => void
  resize: (columns: number, rows: number) => void
  stop: () => Promise<void>
}

function startBrowser(
  browser: "browsh" | "carbonyl",
  url: string,
  callbacks: {
    columns: number
    rows: number
    onData: (data: Uint8Array) => void
    onExit: (code: number | null) => void
  },
): TerminalProcess {
  const executable = gitBrowserExecutable(browser)
  const [, ...args] = gitBrowserCommand(browser, url)
  const child = Bun.spawn([executable, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    terminal: {
      cols: Math.max(20, callbacks.columns),
      rows: Math.max(5, callbacks.rows),
      name: "xterm-256color",
      data(_terminal, data) {
        callbacks.onData(data)
      },
    },
  })
  const terminal = child.terminal
  if (!terminal) {
    child.kill("SIGTERM")
    throw new Error(translateUi("Não foi possível criar o terminal do navegador."))
  }
  let exited = false
  let stopTimer: ReturnType<typeof setTimeout> | null = null
  let stopping: Promise<void> | null = null
  let unregister: () => void = () => undefined
  void child.exited.then((code) => {
    exited = true
    unregister()
    if (stopTimer) clearTimeout(stopTimer)
    try {
      terminal.close()
    } catch {
      /* The PTY may already be closed. */
    }
    callbacks.onExit(code)
  })
  const handle: TerminalProcess = {
    write(data) {
      if (exited) return
      try {
        terminal.write(data)
      } catch {
        /* Ignore a closing PTY. */
      }
    },
    resize(columns, rows) {
      if (exited) return
      try {
        terminal.resize(Math.max(20, columns), Math.max(5, rows))
      } catch {
        /* Ignore a closing PTY. */
      }
    },
    stop() {
      if (!stopping) {
        stopping = new Promise<void>((resolve, reject) => {
          const deadline = setTimeout(
            () => reject(processStopDeadlineError(browser, child.pid)),
            OWNED_PROCESS_STOP_DEADLINE_MS,
          )
          void child.exited.then(() => {
            clearTimeout(deadline)
            resolve()
          })
        })
        if (!exited) {
          try {
            terminal.write("\u0003")
          } catch {
            /* Ignore a closing PTY. */
          }
          signalOwnedProcessGroup(child.pid, "SIGTERM", () => child.kill("SIGTERM"))
          stopTimer = setTimeout(() => {
            if (!exited) forceKillOwnedProcessTree(child.pid, () => child.kill("SIGKILL"))
          }, OWNED_PROCESS_STOP_GRACE_MS)
        }
      }
      return stopping
    },
  }
  unregister = registerGitBrowserDisposer(() => handle.stop())
  return handle
}

export function GitBrowserTerminal({
  browser,
  url,
  onClose,
}: {
  browser: Extract<GitBrowser, "browsh" | "carbonyl">
  url: string
  onClose: () => void
}) {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const processRef = useRef<TerminalProcess | null>(null)
  const [error, setError] = useState("")
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let owned: TerminalProcess | null = null
    let live = true
    try {
      owned = startBrowser(browser, url, {
        columns: Math.max(20, terminalRef.current?.width ?? 80),
        rows: Math.max(5, terminalRef.current?.height ?? 16),
        onData: (data) => terminalRef.current?.write(data),
        onExit: (code) => {
          if (!live || processRef.current !== owned) return
          processRef.current = null
          setClosed(true)
          if (code !== 0)
            setError(`${browser}: ${translateUi("navegador encerrado com código")} ${code ?? "?"}.`)
        },
      })
      processRef.current = owned
      const timer = setTimeout(() => terminalRef.current?.focus(), 0)
      return () => {
        live = false
        clearTimeout(timer)
        if (processRef.current === owned) processRef.current = null
        if (owned) void owned.stop().catch(() => undefined)
      }
    } catch (cause) {
      setClosed(true)
      setError(
        cause instanceof Error ? cause.message : translateUi("Não foi possível abrir o navegador."),
      )
      const timer = setTimeout(() => dialogRef.current?.focus(), 0)
      return () => clearTimeout(timer)
    }
  }, [browser, url])

  useKeyboard((key) => {
    if (key.ctrl && key.name === "q") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    } else if (
      key.name === "escape" &&
      renderer.currentFocusedRenderable?.id === "git-browser-modal"
    ) {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    }
  })

  const width = Math.max(1, dimensions.width - 2)
  const height = Math.max(1, dimensions.height - 2)
  return (
    <>
      <Button
        onPress={onClose}
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={980}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={981}
        alignItems="center"
        justifyContent="center"
      >
        <box
          ref={dialogRef}
          id="git-browser-modal"
          focusable
          style={{
            width,
            height,
            border: true,
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box
            style={{
              height: 1,
              flexShrink: 0,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <text
              content={truncateDisplay(
                `${browser.toUpperCase()} · ${url}`,
                Math.max(10, width - 24),
              )}
              style={{ fg: COLORS.git }}
            />
            <InlineButton label="[Ctrl+Q] Fechar" accent={COLORS.git} onPress={onClose} />
          </box>
          {error ? <text content={error} style={{ fg: COLORS.danger }} /> : null}
          <git-browser-terminal
            ref={terminalRef}
            id="git-browser-terminal"
            maxScrollback={1_000}
            selectable
            onData={(data) => processRef.current?.write(data)}
            onTerminalResize={(columns, rows) => processRef.current?.resize(columns, rows)}
            onMouseDown={() => terminalRef.current?.focus()}
            style={{ flexGrow: 1, width: "100%", minHeight: 5 }}
          />
          <ShortcutText
            content={translateUi(
              closed ? "Navegador encerrado · [Ctrl+Q] Fechar" : "[Ctrl+Q] Fechar navegador",
            )}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        </box>
      </box>
    </>
  )
}
