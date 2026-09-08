import { ShortcutText } from "../../shared/ui/ShortcutText"
import { basename } from "node:path"
import { EmbeddedTerminalRenderable, type InputRenderable } from "@opentui/core"
import { extend, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { notifyTerminalExit, useTerminalNotifications } from "./hooks/use-terminal-notifications"
import {
  FREE_TERMINAL_WORKING_DIRECTORY,
  createFreeTerminalCommand,
  createShellTerminalCommand,
  startFreeTerminalProcess,
  type FreeTerminalCommand,
  type FreeTerminalKind,
  type FreeTerminalProcessHandle,
} from "./services/terminal"
import { translateUi } from "../../shared/i18n/index"
import { COLORS } from "../../core/settings/theme"
import { InlineButton } from "../../shared/ui/InlineButton"
import {
  compactTerminalText,
  terminalFooterLayout,
  terminalStatusColor,
  terminalStatusMarker,
} from "./rendering/presentation"

extend({ "embedded-terminal": EmbeddedTerminalRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "embedded-terminal": typeof EmbeddedTerminalRenderable
  }
}

type FreeTerminalSessionStatus = "starting" | "running" | "exited" | "failed"
type FreeTerminalViewMode = "section" | "single"
type TerminalRow = 0 | 1
type TerminalColumn = 0 | 1

type FreeTerminalSession = FreeTerminalCommand & {
  id: string
  sectionId: string
  row: TerminalRow
  column: TerminalColumn
  title: string
  status: FreeTerminalSessionStatus
  pid: number | null
  exitCode: number | null
  startedAt: number
}

type TerminalPlacement = {
  sectionId: string
  row: TerminalRow
  column: TerminalColumn
}

type TerminalPaneLayout = {
  top: 0 | "50%"
  left: 0 | "50%"
  width: "50%" | "100%"
  height: "50%" | "100%"
  borderTop: boolean
  borderLeft: boolean
}

type TerminalPaneProps = {
  session: FreeTerminalSession
  ordinal: number
  active: boolean
  visible: boolean
  layout: TerminalPaneLayout
  onActivate: (id: string) => void
  onReady: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onGone: (id: string, terminal: EmbeddedTerminalRenderable) => void
  onInput: (id: string, data: Uint8Array) => void
  onResize: (id: string, columns: number, rows: number) => void
  onRestart: (id: string) => void
  onClose: (id: string) => void
}

const MAX_SESSIONS = 12
const MAX_TERMINALS_PER_SECTION = 4
const MAX_SCROLLBACK_LINES = 5_000

function comparePanePosition(first: FreeTerminalSession, second: FreeTerminalSession) {
  return first.row - second.row || first.column - second.column
}

function normalizeSectionLayout(sessions: FreeTerminalSession[], sectionId: string) {
  const inSection = sessions.filter((session) => session.sectionId === sectionId)
  if (!inSection.length) return sessions

  const top = inSection.filter((session) => session.row === 0)
  const bottom = inSection.filter((session) => session.row === 1)
  const rows = top.length ? [top, bottom] : [bottom, []]
  const positions = new Map<string, { row: TerminalRow; column: TerminalColumn }>()

  rows.forEach((rowSessions, row) => {
    rowSessions.forEach((session, column) => {
      positions.set(session.id, {
        row: row as TerminalRow,
        column: Math.min(column, 1) as TerminalColumn,
      })
    })
  })

  return sessions.map((session) => {
    const position = positions.get(session.id)
    return position ? { ...session, ...position } : session
  })
}

function TerminalPane({
  session,
  ordinal,
  active,
  visible,
  layout,
  onActivate,
  onReady,
  onGone,
  onInput,
  onResize,
  onRestart,
  onClose,
}: TerminalPaneProps) {
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const borders: Array<"top" | "left"> = []
  if (visible && layout.borderTop) borders.push("top")
  if (visible && layout.borderLeft) borders.push("left")

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    onReady(session.id, terminal)
    return () => onGone(session.id, terminal)
  }, [onGone, onReady, session.id])

  return (
    <box
      visible={visible}
      style={{
        position: "absolute",
        top: visible ? layout.top : 0,
        left: visible ? layout.left : 0,
        width: visible ? layout.width : 1,
        height: visible ? layout.height : 1,
        minWidth: visible ? 18 : 1,
        minHeight: visible ? 4 : 1,
        border: borders,
        borderStyle: "single",
        borderColor: COLORS.border,
        backgroundColor: COLORS.panel,
        overflow: "hidden",
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 1,
          backgroundColor: active ? COLORS.panelRaised : COLORS.panel,
        }}
      >
        <text
          content={`${terminalStatusMarker(session.status)} ${ordinal}:${session.shortLabel} ${compactTerminalText(session.title, 16)}${session.pid ? ` · ${session.pid}` : ""}`}
          style={{ fg: active ? terminalStatusColor(session) : COLORS.muted }}
        />
        <box style={{ flexDirection: "row" }}>
          <InlineButton label="↻" accent={session.accent} onPress={() => onRestart(session.id)} />
          <InlineButton label="×" accent={COLORS.danger} onPress={() => onClose(session.id)} />
        </box>
      </box>
      <embedded-terminal
        ref={terminalRef}
        id={`free-terminal-${session.id}`}
        maxScrollback={MAX_SCROLLBACK_LINES}
        selectable
        onData={(data) => onInput(session.id, data)}
        onTerminalResize={(columns, rows) => onResize(session.id, columns, rows)}
        onMouseDown={() => onActivate(session.id)}
        style={{
          width: "100%",
          height: "auto",
          minHeight: 1,
          flexGrow: 1,
          flexShrink: 1,
        }}
      />
    </box>
  )
}

export function FreeTerminal({ active }: { active: boolean }) {
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const customInputRef = useRef<InputRenderable | null>(null)
  const terminalRefs = useRef(new Map<string, EmbeddedTerminalRenderable>())
  const processHandles = useRef(new Map<string, FreeTerminalProcessHandle>())
  const sessionCommands = useRef(new Map<string, FreeTerminalCommand>())
  const terminalSizes = useRef(new Map<string, { columns: number; rows: number }>())
  const generations = useRef(new Map<string, number>())
  const kindSequences = useRef(new Map<FreeTerminalKind, number>())
  const sessionSequence = useRef(0)
  const sectionSequence = useRef(0)
  const activeRef = useRef(active)
  const activeSessionRef = useRef<string | null>(null)
  const leaderRef = useRef(false)
  const [sessions, setSessions] = useState<FreeTerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<FreeTerminalViewMode>("section")
  const [customCommand, setCustomCommand] = useState("")
  const [notice, setNotice] = useState(
    "Crie uma seção; os terminais continuam vivos ao trocar de tab.",
  )
  const [leaderActive, setLeaderActive] = useState(false)
  const notify = useTerminalNotifications(notice)

  const sectionIds = useMemo(() => {
    const ids: string[] = []
    const seen = new Set<string>()
    for (const session of sessions) {
      if (seen.has(session.sectionId)) continue
      seen.add(session.sectionId)
      ids.push(session.sectionId)
    }
    return ids
  }, [sessions])
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const currentSectionId = activeSession?.sectionId ?? activeSectionId ?? sectionIds[0] ?? null
  const currentSectionIndex = currentSectionId ? sectionIds.indexOf(currentSectionId) : -1
  const currentSectionSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.sectionId === currentSectionId)
        .sort(comparePanePosition),
    [currentSectionId, sessions],
  )
  const topRowSessions = currentSectionSessions.filter((session) => session.row === 0)
  const bottomRowSessions = currentSectionSessions.filter((session) => session.row === 1)
  const visibleSessionIds = useMemo(() => {
    if (viewMode === "single") {
      return activeSessionId ? [activeSessionId] : []
    }
    return currentSectionSessions.map((session) => session.id)
  }, [activeSessionId, currentSectionSessions, viewMode])
  const paneLayouts = useMemo(() => {
    const layouts = new Map<string, TerminalPaneLayout>()
    if (viewMode === "single" && activeSessionId) {
      layouts.set(activeSessionId, {
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        borderTop: false,
        borderLeft: false,
      })
      return layouts
    }

    const hasBottomRow = bottomRowSessions.length > 0
    for (const session of currentSectionSessions) {
      const rowSessions = session.row === 0 ? topRowSessions : bottomRowSessions
      const columnIndex = rowSessions.findIndex((candidate) => candidate.id === session.id)
      const splitRow = rowSessions.length === 2
      layouts.set(session.id, {
        top: session.row === 1 ? "50%" : 0,
        left: splitRow && columnIndex === 1 ? "50%" : 0,
        width: splitRow ? "50%" : "100%",
        height: hasBottomRow ? "50%" : "100%",
        borderTop: session.row === 1,
        borderLeft: splitRow && columnIndex === 1,
      })
    }
    return layouts
  }, [activeSessionId, bottomRowSessions, currentSectionSessions, topRowSessions, viewMode])
  const activeIndex = sessions.findIndex((session) => session.id === activeSessionId)
  const runningCount = sessions.filter((session) => session.status === "running").length
  const activeRowCount = activeSession
    ? currentSectionSessions.filter((session) => session.row === activeSession.row).length
    : 0
  const canSplitRight = Boolean(
    activeSession &&
      currentSectionSessions.length < MAX_TERMINALS_PER_SECTION &&
      activeRowCount < 2,
  )
  const canSplitDown = Boolean(
    activeSession &&
      activeSession.row === 0 &&
      currentSectionSessions.length < MAX_TERMINALS_PER_SECTION &&
      bottomRowSessions.length === 0,
  )
  const pageCount = Math.max(1, sectionIds.length)
  const compact = dimensions.width < 106
  const footerLayout = terminalFooterLayout(dimensions.width - 2)

  activeRef.current = active
  activeSessionRef.current = activeSessionId

  const updateSession = useCallback((id: string, update: Partial<FreeTerminalSession>) => {
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, ...update } : session)),
    )
  }, [])

  const focusTerminal = useCallback((id: string | null) => {
    if (!id || !activeRef.current) return
    queueMicrotask(() => terminalRefs.current.get(id)?.focus())
  }, [])

  const activateSession = useCallback(
    (id: string) => {
      const session = sessions.find((candidate) => candidate.id === id)
      if (!session) return
      setActiveSessionId(id)
      setActiveSectionId(session.sectionId)
      focusTerminal(id)
    },
    [focusTerminal, sessions],
  )

  const startSession = useCallback(
    (id: string, clear = false) => {
      const command = sessionCommands.current.get(id)
      const embeddedTerminal = terminalRefs.current.get(id)
      if (!command || !embeddedTerminal) return

      const previous = processHandles.current.get(id)
      if (previous) {
        generations.current.set(id, (generations.current.get(id) ?? 0) + 1)
        previous.stop()
        processHandles.current.delete(id)
      }

      if (clear) embeddedTerminal.write("\u001bc")
      embeddedTerminal.write(
        `\u001b[38;2;130;144;163m◆ ${command.displayCommand}  ·  ${FREE_TERMINAL_WORKING_DIRECTORY}\u001b[0m\r\n`,
      )
      updateSession(id, {
        status: "starting",
        pid: null,
        exitCode: null,
        startedAt: Date.now(),
      })

      const generation = (generations.current.get(id) ?? 0) + 1
      generations.current.set(id, generation)
      const size = terminalSizes.current.get(id)
      let handle: FreeTerminalProcessHandle | null = null

      try {
        handle = startFreeTerminalProcess(command.command, {
          cwd: FREE_TERMINAL_WORKING_DIRECTORY,
          columns: size?.columns ?? Math.max(40, dimensions.width - 4),
          rows: size?.rows ?? Math.max(10, dimensions.height - 6),
          onData(data) {
            if (generations.current.get(id) !== generation) return
            terminalRefs.current.get(id)?.write(data)
          },
          onExit(result) {
            if (generations.current.get(id) !== generation) return
            if (processHandles.current.get(id) === handle) {
              processHandles.current.delete(id)
            }
            const failed = result.code !== 0 && !result.stopped
            terminalRefs.current
              .get(id)
              ?.write(
                `\r\n\u001b[${failed ? "38;2;255;107;107" : "38;2;130;144;163"}m` +
                  `◆ ${translateUi("sessão encerrada")}${result.code === null ? "" : ` · ${translateUi("código")} ${result.code}`}\u001b[0m\r\n`,
              )
            updateSession(id, {
              status: failed ? "failed" : "exited",
              pid: null,
              exitCode: result.code,
            })
            notifyTerminalExit(notify, command.label, result)
          },
        })
        processHandles.current.set(id, handle)
        updateSession(id, { status: "running", pid: handle.pid })
        setNotice(`${command.label} iniciado em ${basename(FREE_TERMINAL_WORKING_DIRECTORY)}.`)
        if (activeSessionRef.current === id) focusTerminal(id)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Não foi possível iniciar a sessão."
        embeddedTerminal.write(`\u001b[38;2;255;107;107m× ${message}\u001b[0m\r\n`)
        updateSession(id, { status: "failed", pid: null, exitCode: 1 })
        setNotice(`Erro: ${message}`)
      }
    },
    [dimensions.height, dimensions.width, focusTerminal, notify, updateSession],
  )

  const terminalReady = useCallback(
    (id: string, terminal: EmbeddedTerminalRenderable) => {
      terminalRefs.current.set(id, terminal)
      terminalSizes.current.set(id, {
        columns: Math.max(20, terminal.width),
        rows: Math.max(5, terminal.height),
      })
      if (!processHandles.current.has(id)) startSession(id)
      if (activeSessionRef.current === id) focusTerminal(id)
    },
    [focusTerminal, startSession],
  )

  const terminalGone = useCallback((id: string, terminal: EmbeddedTerminalRenderable) => {
    if (terminalRefs.current.get(id) === terminal) {
      terminalRefs.current.delete(id)
    }
  }, [])

  const terminalInput = useCallback((id: string, data: Uint8Array) => {
    processHandles.current.get(id)?.write(data)
  }, [])

  const terminalResize = useCallback((id: string, columns: number, rows: number) => {
    terminalSizes.current.set(id, { columns, rows })
    processHandles.current.get(id)?.resize(columns, rows)
  }, [])

  const launchCommand = useCallback(
    (command: FreeTerminalCommand, placement: TerminalPlacement) => {
      if (sessions.length >= MAX_SESSIONS) {
        setNotice(`Limite de ${MAX_SESSIONS} terminais nesta execução.`)
        return
      }
      const sectionSize = sessions.filter(
        (session) => session.sectionId === placement.sectionId,
      ).length
      if (sectionSize >= MAX_TERMINALS_PER_SECTION) {
        setNotice("Esta seção já possui quatro terminais.")
        return
      }

      sessionSequence.current += 1
      const number = (kindSequences.current.get(command.kind) ?? 0) + 1
      kindSequences.current.set(command.kind, number)
      const id = `${command.kind}-${Date.now()}-${sessionSequence.current}`
      const session: FreeTerminalSession = {
        ...command,
        ...placement,
        id,
        title: `${command.label} ${number}`,
        status: "starting",
        pid: null,
        exitCode: null,
        startedAt: Date.now(),
      }
      sessionCommands.current.set(id, command)
      setSessions((current) => [...current, session])
      setActiveSessionId(id)
      setActiveSectionId(placement.sectionId)
      setViewMode("section")
      setNotice(`Abrindo ${command.displayCommand}…`)
      focusTerminal(id)
    },
    [focusTerminal, sessions],
  )

  const pendingCommand = useCallback(() => {
    const value = customCommand.trim()
    return value ? createFreeTerminalCommand(value) : createShellTerminalCommand()
  }, [customCommand])

  const clearPendingCommand = useCallback(() => {
    if (customCommand.trim()) setCustomCommand("")
  }, [customCommand])

  const launchSection = useCallback(() => {
    if (sessions.length >= MAX_SESSIONS) {
      setNotice(`Limite de ${MAX_SESSIONS} terminais nesta execução.`)
      return
    }
    sectionSequence.current += 1
    const sectionId = `section-${Date.now()}-${sectionSequence.current}`
    launchCommand(pendingCommand(), { sectionId, row: 0, column: 0 })
    clearPendingCommand()
  }, [clearPendingCommand, launchCommand, pendingCommand, sessions.length])

  const splitRight = useCallback(() => {
    if (!activeSession || !canSplitRight) {
      setNotice("A linha ativa já atingiu o limite de dois terminais.")
      return
    }
    launchCommand(pendingCommand(), {
      sectionId: activeSession.sectionId,
      row: activeSession.row,
      column: 1,
    })
    clearPendingCommand()
  }, [activeSession, canSplitRight, clearPendingCommand, launchCommand, pendingCommand])

  const splitDown = useCallback(() => {
    if (!activeSession || !canSplitDown) {
      setNotice("A seção já possui uma divisão horizontal.")
      return
    }
    launchCommand(pendingCommand(), {
      sectionId: activeSession.sectionId,
      row: 1,
      column: 0,
    })
    clearPendingCommand()
  }, [activeSession, canSplitDown, clearPendingCommand, launchCommand, pendingCommand])

  const submitCommand = useCallback(() => {
    if (!customCommand.trim()) {
      setNotice("Digite um comando ou use os botões com o shell padrão.")
      customInputRef.current?.focus()
      return
    }
    launchSection()
  }, [customCommand, launchSection])

  const closeSession = useCallback(
    (id: string) => {
      const index = sessions.findIndex((session) => session.id === id)
      const removed = sessions[index]
      if (!removed) return

      generations.current.set(id, (generations.current.get(id) ?? 0) + 1)
      processHandles.current.get(id)?.stop()
      processHandles.current.delete(id)
      sessionCommands.current.delete(id)
      terminalSizes.current.delete(id)

      const remaining = normalizeSectionLayout(
        sessions.filter((session) => session.id !== id),
        removed.sectionId,
      )
      const currentActive = remaining.find((session) => session.id === activeSessionRef.current)
      const next = currentActive ?? remaining[Math.min(index, remaining.length - 1)] ?? null
      setSessions(remaining)
      setActiveSessionId(next?.id ?? null)
      setActiveSectionId(next?.sectionId ?? null)
      setNotice(next ? `Terminal fechado · foco em ${next.title}.` : "Nenhum terminal ativo.")
      if (next) focusTerminal(next.id)
    },
    [focusTerminal, sessions],
  )

  const restartSession = useCallback(
    (id: string) => {
      setActiveSessionId(id)
      startSession(id, true)
      focusTerminal(id)
    },
    [focusTerminal, startSession],
  )

  const moveSession = useCallback(
    (delta: number) => {
      if (!sessions.length) return
      const current = Math.max(0, activeIndex)
      const nextIndex = (current + delta + sessions.length) % sessions.length
      const next = sessions[nextIndex]
      if (next) activateSession(next.id)
    },
    [activateSession, activeIndex, sessions],
  )

  const changeSection = useCallback(
    (delta: number) => {
      if (!sectionIds.length) return
      const current = Math.max(0, currentSectionIndex)
      const nextIndex = (current + delta + sectionIds.length) % sectionIds.length
      const sectionId = sectionIds[nextIndex]
      if (!sectionId) return
      const next = sessions
        .filter((session) => session.sectionId === sectionId)
        .sort(comparePanePosition)[0]
      if (!next) return
      setActiveSectionId(sectionId)
      setActiveSessionId(next.id)
      focusTerminal(next.id)
    },
    [currentSectionIndex, focusTerminal, sectionIds, sessions],
  )

  const toggleViewMode = useCallback(() => {
    setViewMode((current) => (current === "single" ? "section" : "single"))
    focusTerminal(activeSessionRef.current)
  }, [focusTerminal])

  const focusVisiblePane = useCallback(
    (index: number) => {
      const id = visibleSessionIds[index]
      if (id) activateSession(id)
    },
    [activateSession, visibleSessionIds],
  )

  useEffect(() => {
    if (!leaderActive) return
    const timeout = setTimeout(() => {
      leaderRef.current = false
      setLeaderActive(false)
    }, 5000)
    return () => clearTimeout(timeout)
  }, [leaderActive])

  useEffect(() => {
    if (active) {
      focusTerminal(activeSessionRef.current)
      return
    }
    for (const terminal of terminalRefs.current.values()) terminal.blur()
    leaderRef.current = false
    setLeaderActive(false)
  }, [active, focusTerminal])

  useKeyboard((key) => {
    if (!active) return
    const focusedId = renderer.currentFocusedRenderable?.id
    const terminalFocused = focusedId?.startsWith("free-terminal-") ?? false
    const customInputFocused = focusedId === "terminal-command-input"

    if (customInputFocused && key.name === "escape") {
      key.preventDefault()
      customInputRef.current?.blur()
      setNotice("Comando liberado. Pressione / para editar novamente.")
      return
    }

    if (key.ctrl && key.name === "b") {
      key.preventDefault()
      key.stopPropagation()
      if (leaderRef.current) {
        processHandles.current.get(activeSessionRef.current ?? "")?.write("\u0002")
        leaderRef.current = false
        setLeaderActive(false)
      } else {
        leaderRef.current = true
        setLeaderActive(true)
        setNotice("Prefixo: [C] seção · [V] lado · [S] abaixo · [N/P] terminal · [/] seção")
      }
      return
    }

    if (leaderRef.current) {
      key.preventDefault()
      key.stopPropagation()
      leaderRef.current = false
      setLeaderActive(false)
      switch (key.name) {
        case "c":
          launchSection()
          break
        case "v":
        case "right":
          splitRight()
          break
        case "s":
        case "down":
          splitDown()
          break
        case "n":
          moveSession(1)
          break
        case "p":
          moveSession(-1)
          break
        case "m":
        case "f":
          toggleViewMode()
          break
        case "x":
          if (activeSessionRef.current) closeSession(activeSessionRef.current)
          break
        case "r":
          if (activeSessionRef.current) restartSession(activeSessionRef.current)
          break
        case "1":
        case "2":
        case "3":
        case "4":
          focusVisiblePane(Number(key.name) - 1)
          break
        case "[":
          changeSection(-1)
          break
        case "]":
          changeSection(1)
          break
        case "g":
        case "escape":
          terminalRefs.current.get(activeSessionRef.current ?? "")?.blur()
          setNotice("Terminal liberado: use [@] [#] [$] [%] [^] para trocar de ferramenta.")
          break
      }
      return
    }

    if (terminalFocused || customInputFocused) return
    switch (key.name) {
      case "/":
        customInputRef.current?.focus()
        break
      case "m":
        toggleViewMode()
        break
      case "n":
        moveSession(1)
        break
      case "p":
        moveSession(-1)
        break
      case "[":
        changeSection(-1)
        break
      case "]":
        changeSection(1)
        break
      case "r":
        if (activeSessionId) restartSession(activeSessionId)
        break
    }
  })

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
      }}
    >
      <box
        id="terminal-footer"
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panel,
        }}
      >
        <box style={{ flexDirection: "row", alignItems: "center" }}>
          <text content="❯ FREE TERMINAL" style={{ fg: COLORS.terminal }} />
          <text
            content={`  ${basename(FREE_TERMINAL_WORKING_DIRECTORY)}`}
            style={{ fg: COLORS.text }}
          />
          {!compact && (
            <text
              content={`  ${runningCount}/${sessions.length} vivas · até 4 por seção`}
              style={{ fg: runningCount ? COLORS.terminal : COLORS.muted }}
            />
          )}
        </box>
        <box style={{ flexDirection: "row", alignItems: "center" }}>
          <InlineButton
            label={viewMode === "single" ? "▣ Foco" : compact ? "▦ Grade" : "▦ Seção 2×2"}
            accent={COLORS.terminal}
            active={viewMode === "single"}
            disabled={!sessions.length}
            onPress={toggleViewMode}
          />
          <InlineButton
            label="‹"
            accent={COLORS.terminal}
            disabled={sectionIds.length <= 1}
            onPress={() => changeSection(-1)}
          />
          <text
            content={` ${Math.max(1, currentSectionIndex + 1)}/${pageCount} `}
            style={{ fg: COLORS.muted }}
          />
          <InlineButton
            label="›"
            accent={COLORS.terminal}
            disabled={sectionIds.length <= 1}
            onPress={() => changeSection(1)}
          />
        </box>
      </box>

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 1,
          paddingRight: 1,
          gap: 1,
          backgroundColor: COLORS.panel,
        }}
      >
        <text content="CMD" style={{ fg: COLORS.muted }} />
        <input
          ref={customInputRef}
          id="terminal-command-input"
          value={customCommand}
          placeholder="comando opcional · vazio abre seu shell"
          onInput={setCustomCommand}
          onMouseDown={() => customInputRef.current?.focus()}
          onSubmit={submitCommand}
          width={Math.max(18, Math.min(42, dimensions.width - (compact ? 34 : 58)))}
          style={{
            backgroundColor: COLORS.panelRaised,
            focusedBackgroundColor: COLORS.panelRaised,
            textColor: COLORS.text,
            focusedTextColor: COLORS.text,
            cursorColor: COLORS.terminal,
          }}
        />
        <InlineButton
          label={compact ? "+ Seção" : "+ Nova seção"}
          accent={COLORS.terminal}
          disabled={sessions.length >= MAX_SESSIONS}
          onPress={launchSection}
        />
        <InlineButton
          label={compact ? "│+" : "│ Split lado"}
          accent={COLORS.terminal}
          disabled={!canSplitRight}
          onPress={splitRight}
        />
        <InlineButton
          label={compact ? "─+" : "─ Split baixo"}
          accent={COLORS.terminal}
          disabled={!canSplitDown}
          onPress={splitDown}
        />
      </box>

      <box
        style={{
          flexGrow: 1,
          position: "relative",
          border: ["top"],
          borderStyle: "single",
          borderColor: COLORS.border,
          overflow: "hidden",
        }}
      >
        {!sessions.length ? (
          <box
            style={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: COLORS.panel,
            }}
          >
            <text content="❯_" style={{ fg: COLORS.terminal }} />
            <text content="TERMINAIS LIVRES EM SEÇÕES 2 × 2" style={{ fg: COLORS.text }} />
            <text
              content="+ Nova seção · │+ split ao lado · ─+ split abaixo"
              style={{ fg: COLORS.muted }}
            />
            <text
              content="digite um comando ou deixe vazio para abrir seu shell"
              style={{ fg: COLORS.terminal }}
            />
          </box>
        ) : null}

        {sessions.map((session, index) => (
          <TerminalPane
            key={session.id}
            session={session}
            ordinal={index + 1}
            active={session.id === activeSessionId}
            visible={visibleSessionIds.includes(session.id)}
            layout={
              paneLayouts.get(session.id) ?? {
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                borderTop: false,
                borderLeft: false,
              }
            }
            onActivate={activateSession}
            onReady={terminalReady}
            onGone={terminalGone}
            onInput={terminalInput}
            onResize={terminalResize}
            onRestart={restartSession}
            onClose={closeSession}
          />
        ))}
      </box>

      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: COLORS.panel,
        }}
      >
        <text
          id="terminal-footer-notice"
          content={compactTerminalText(notice, footerLayout.noticeWidth)}
          style={{
            width: footerLayout.noticeWidth,
            flexShrink: 0,
            overflow: "hidden",
            fg: leaderActive ? COLORS.warning : COLORS.muted,
          }}
        />
        <box style={{ width: 1, flexShrink: 0 }} />
        <ShortcutText
          id="terminal-footer-help"
          content={footerLayout.help}
          style={{ width: footerLayout.helpWidth, flexShrink: 0, fg: COLORS.muted }}
        />
      </box>
    </box>
  )
}
