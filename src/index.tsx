import { createCliRenderer } from "@opentui/core"
import {
  createRoot,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { Button } from "@tuiparts/react/button"
import { Tabs } from "@tuiparts/react/tabs"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react"
import { DatabaseViewer } from "./components/DatabaseViewer"
import { GitViewer } from "./components/GitViewer"
import { closeDatabaseConnection } from "./database"

type TimerMode = "focus" | "break"

const INITIAL_DURATIONS: Record<TimerMode, number> = {
  focus: 25 * 60,
  break: 5 * 60,
}

const COLORS = {
  canvas: "#080b10",
  panel: "#0f141c",
  panelRaised: "#171e29",
  border: "#263143",
  muted: "#8290a3",
  text: "#f3f6fa",
  focus: "#ff7a90",
  break: "#64d8ff",
  database: "#a78bfa",
  git: "#f7c873",
  success: "#5ee6a8",
}

const MOTION_FRAMES = ["◐", "◓", "◑", "◒"]
const BIG_DIGITS: Record<string, [string, string, string]> = {
  "0": ["╭─╮", "│ │", "╰─╯"],
  "1": [" ╷ ", " │ ", " ╵ "],
  "2": ["╶─╮", "╭─╯", "╰─╴"],
  "3": ["╶─╮", " ╶┤", "╶─╯"],
  "4": ["╷ ╷", "╰─┤", "  ╵"],
  "5": ["╭─╴", "╰─╮", "╶─╯"],
  "6": ["╭─╴", "├─╮", "╰─╯"],
  "7": ["╶─╮", "  │", "  ╵"],
  "8": ["╭─╮", "├─┤", "╰─╯"],
  "9": ["╭─╮", "╰─┤", "╶─╯"],
  ":": ["   ", " • ", " • "],
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`
}

function BigTimer({ value, accent }: { value: string; accent: string }) {
  const lines = [0, 1, 2].map((row) =>
    value
      .split("")
      .map((character) => BIG_DIGITS[character]?.[row] ?? "   ")
      .join(" "),
  )

  return (
    <box style={{ alignItems: "center" }}>
      {lines.map((line, index) => (
        <text key={index} content={line} style={{ fg: accent }} />
      ))}
    </box>
  )
}

function ActionButton({
  label,
  shortcut,
  accent,
  onPress,
  buttonRef,
}: {
  label: string
  shortcut: string
  accent: string
  onPress: () => void
  buttonRef: Ref<ButtonRenderable>
}) {
  return (
    <Button
      ref={buttonRef}
      onPress={onPress}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      marginRight={1}
    >
      {(state) => (
        <box
          style={{
            flexDirection: "row",
            backgroundColor: state.pressed
              ? accent
              : state.focused
                ? COLORS.panelRaised
                : COLORS.panel,
            border: true,
            borderStyle: "rounded",
            borderColor: state.focused ? accent : COLORS.border,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text
            content={`${label}  ${shortcut}`}
            style={{ fg: state.pressed ? COLORS.canvas : COLORS.text }}
          />
        </box>
      )}
    </Button>
  )
}

function Pomodoro({ active }: { active: boolean }) {
  const terminal = useTerminalDimensions()
  const [mode, setMode] = useState<TimerMode>("focus")
  const [durations, setDurations] = useState(INITIAL_DURATIONS)
  const [remaining, setRemaining] = useState(INITIAL_DURATIONS.focus)
  const [running, setRunning] = useState(false)
  const [completedSessions, setCompletedSessions] = useState(0)
  const [motionFrame, setMotionFrame] = useState(0)
  const buttonRefs = useRef<Array<ButtonRenderable | null>>([])
  const focusedButton = useRef(0)

  const accent = mode === "focus" ? COLORS.focus : COLORS.break
  const total = durations[mode]
  const elapsedRatio = total === 0 ? 0 : (total - remaining) / total
  const progressWidth = Math.max(12, Math.min(48, terminal.width - 20))
  const filledCells = Math.round(progressWidth * elapsedRatio)
  const progressHead = running ? (motionFrame % 2 === 0 ? "◆" : "◇") : "◆"
  const progress =
    filledCells > 0
      ? `${"━".repeat(Math.max(0, filledCells - 1))}${progressHead}${"─".repeat(
          progressWidth - filledCells,
        )}`
      : `${progressHead}${"─".repeat(progressWidth - 1)}`

  const sessionMarks = useMemo(() => {
    const currentSet =
      completedSessions === 0 ? 0 : ((completedSessions - 1) % 4) + 1
    return Array.from({ length: 4 }, (_, index) =>
      index < currentSet ? "●" : "○",
    ).join("  ")
  }, [completedSessions])

  const toggleRunning = useCallback(() => {
    setRunning((current) => !current)
  }, [])

  const reset = useCallback(() => {
    setRunning(false)
    setRemaining(durations[mode])
  }, [durations, mode])

  const changeMode = useCallback(
    (nextMode?: TimerMode) => {
      const target = nextMode ?? (mode === "focus" ? "break" : "focus")
      setMode(target)
      setRemaining(durations[target])
      setRunning(false)
    },
    [durations, mode],
  )

  const adjustMinutes = useCallback(
    (delta: number) => {
      if (running) return

      const nextDuration = Math.min(
        90 * 60,
        Math.max(60, durations[mode] + delta * 60),
      )
      setDurations((current) => ({ ...current, [mode]: nextDuration }))
      setRemaining(nextDuration)
    },
    [durations, mode, running],
  )

  useEffect(() => {
    if (!running) return

    const interval = setInterval(() => {
      setRemaining((current) => {
        if (current > 1) return current - 1

        if (mode === "focus") {
          setCompletedSessions((count) => count + 1)
        }

        const nextMode = mode === "focus" ? "break" : "focus"
        setMode(nextMode)
        setRunning(false)
        return durations[nextMode]
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [durations, mode, running])

  useEffect(() => {
    if (!running) {
      setMotionFrame(0)
      return
    }

    const interval = setInterval(() => {
      setMotionFrame((current) => (current + 1) % MOTION_FRAMES.length)
    }, 180)

    return () => clearInterval(interval)
  }, [running])

  useEffect(() => {
    if (active) buttonRefs.current[0]?.focus()
  }, [active])

  useKeyboard((key) => {
    if (!active) return

    switch (key.name) {
      case "p":
        toggleRunning()
        break
      case "r":
        reset()
        break
      case "s":
      case "m":
        changeMode()
        break
      case "+":
      case "=":
        adjustMinutes(1)
        break
      case "-":
        adjustMinutes(-1)
        break
      case "t":
        if (!running) setRemaining(Math.min(10, durations[mode]))
        break
      case "tab": {
        key.preventDefault()
        const direction = key.shift ? -1 : 1
        focusedButton.current =
          (focusedButton.current + direction + buttonRefs.current.length) %
          buttonRefs.current.length
        buttonRefs.current[focusedButton.current]?.focus()
        break
      }
    }
  })

  return (
    <box
      style={{
        flexGrow: 1,
        backgroundColor: COLORS.canvas,
        alignItems: "center",
        justifyContent: "center",
        padding: 1,
      }}
    >
      <box
        style={{
          width: Math.min(70, Math.max(42, terminal.width - 4)),
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.border,
          backgroundColor: COLORS.panel,
          padding: 1,
        }}
      >
        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 1,
          }}
        >
          <text
            content={mode === "focus" ? "FOCO PROFUNDO" : "RECUPERAÇÃO"}
            style={{ fg: accent }}
          />
          <text
            content={
              running
                ? `${MOTION_FRAMES[motionFrame]} SESSÃO ATIVA`
                : "◇ PRONTO"
            }
            style={{ fg: running ? COLORS.success : COLORS.muted }}
          />
        </box>

        <box
          style={{
            alignItems: "center",
            border: true,
            borderStyle: "rounded",
            borderColor: accent,
            backgroundColor: COLORS.panelRaised,
            marginBottom: 1,
          }}
        >
          <text
            content={mode === "focus" ? "TEMPO DE FOCO" : "PAUSA"}
            style={{ fg: accent }}
          />
          <BigTimer value={formatTime(remaining)} accent={accent} />
          <text content={progress} style={{ fg: accent }} />
        </box>

        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 1,
          }}
        >
          <text
            content={`Sessões  ${sessionMarks}`}
            style={{ fg: COLORS.muted }}
          />
          <text
            content={`${completedSessions} concluída${completedSessions === 1 ? "" : "s"}`}
            style={{ fg: COLORS.muted }}
          />
        </box>

        <box style={{ flexDirection: "row", justifyContent: "center" }}>
          <ActionButton
            label={running ? "Pausar" : "Iniciar"}
            shortcut="[p]"
            accent={accent}
            onPress={toggleRunning}
            buttonRef={(button) => {
              buttonRefs.current[0] = button
            }}
          />
          <ActionButton
            label="Reiniciar"
            shortcut="[r]"
            accent={accent}
            onPress={reset}
            buttonRef={(button) => {
              buttonRefs.current[1] = button
            }}
          />
          <ActionButton
            label="Pular"
            shortcut="[s]"
            accent={accent}
            onPress={() => changeMode()}
            buttonRef={(button) => {
              buttonRefs.current[2] = button
            }}
          />
        </box>

        <box
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 1,
          }}
        >
          <text
            content="[+/-] duração  [m] modo  [t] teste 10s"
            style={{ fg: COLORS.muted }}
          />
          <text content="[q] sair" style={{ fg: COLORS.muted }} />
        </box>
      </box>
    </box>
  )
}

type AppTab = "pomodoro" | "database" | "git"

function NavigationTab({
  value,
  label,
  shortcut,
}: {
  value: AppTab
  label: string
  shortcut: string
}) {
  return (
    <Tabs.Tab value={value}>
      {(state) => (
        <text
          content={` ${state.selected ? "◆" : "◇"} ${label} ${shortcut} `}
          style={{
            fg: state.selected ? COLORS.text : COLORS.muted,
            bg: state.selected ? COLORS.panelRaised : COLORS.canvas,
          }}
        />
      )}
    </Tabs.Tab>
  )
}

function App() {
  const renderer = useRenderer()
  const [activeTab, setActiveTab] = useState<AppTab>("pomodoro")

  const quit = useCallback(async () => {
    await closeDatabaseConnection()
    renderer.destroy()
  }, [renderer])

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      void quit()
      return
    }

    const editingSearch = renderer.currentFocusedRenderable?.id === "table-search"
    if (editingSearch) return

    switch (key.name) {
      case "1":
        setActiveTab("pomodoro")
        break
      case "2":
        setActiveTab("database")
        break
      case "3":
        setActiveTab("git")
        break
      case "q":
      case "escape":
        void quit()
        break
    }
  })

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as AppTab)}
      flexGrow={1}
      backgroundColor={COLORS.canvas}
    >
      <box
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text content="◆ TUIMINAL" style={{ fg: COLORS.text }} />
        <Tabs.List flexDirection="row" gap={1}>
          <NavigationTab value="pomodoro" label="Pomo" shortcut="[1]" />
          <NavigationTab value="database" label="Banco" shortcut="[2]" />
          <NavigationTab value="git" label="Git" shortcut="[3]" />
        </Tabs.List>
        <text content="[1–3] MUDAR  [Q] SAIR" style={{ fg: COLORS.muted }} />
      </box>

      <Tabs.Panel value="pomodoro" flexGrow={1} keepMounted>
        <Pomodoro active={activeTab === "pomodoro"} />
      </Tabs.Panel>
      <Tabs.Panel value="database" flexGrow={1} keepMounted>
        <DatabaseViewer active={activeTab === "database"} />
      </Tabs.Panel>
      <Tabs.Panel value="git" flexGrow={1} keepMounted>
        <GitViewer active={activeTab === "git"} />
      </Tabs.Panel>
    </Tabs.Root>
  )
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
})

createRoot(renderer).render(<App />)
