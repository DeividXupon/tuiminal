import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { useEffect, useRef, useState } from "react"
import { useAgentProjectPicker } from "../hooks/use-agent-project-picker"
import type { AgentProjectTarget } from "../model/agent-project"
import type { FreeTerminalCommand, TerminalSession } from "../model/sessions"
import {
  type DiscoveredAgentProjects,
  discoverAgentGitProjects,
} from "../services/agent-git-projects"
import { projectName } from "../services/agent-project-recents"
import { FREE_TERMINAL_WORKING_DIRECTORY } from "../services/terminal"
import { AgentFolderBrowser } from "./AgentFolderBrowser"
import { TerminalInlineButton } from "./TerminalShortcut"

type ProjectRow = { path: string; group: string }
function projectRows(
  recent: readonly { path: string }[],
  discovered: readonly string[],
  chosen: string | null,
  initial: string,
) {
  const rows: ProjectRow[] = []
  const seen = new Set<string>()
  const append = (path: string, group: string) => {
    if (!seen.has(path)) {
      rows.push({ path, group })
      seen.add(path)
    }
  }
  if (chosen) append(chosen, "Pasta selecionada")
  for (const project of recent) append(project.path, "Projetos recentes")
  for (const path of discovered) append(path, "Projetos Git encontrados")
  append(initial, "Pasta inicial")
  return rows
}

export function AgentProjectPicker(props: {
  target: AgentProjectTarget
  sessions: readonly TerminalSession[]
  inactive: boolean
  onEnvironment: () => void
  onLaunch: (command: FreeTerminalCommand) => string | undefined
  onCancelLaunch: (id: string) => void
  onClose: () => void
}) {
  const picker = useAgentProjectPicker(props)
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [cursor, setCursorState] = useState<string | null>(null)
  const cursorRef = useRef<string | null>(null)
  const setCursor = (path: string) => {
    cursorRef.current = path
    setCursorState(path)
  }
  const [git, setGit] = useState<DiscoveredAgentProjects>({ paths: [], truncated: false })
  const [findingGit, setFindingGit] = useState(true)
  const [gitError, setGitError] = useState(false)
  const { target } = props
  const initial = target.kind === "local" ? FREE_TERMINAL_WORKING_DIRECTORY : "~"
  const rows = projectRows(picker.recent, git.paths, chosen, initial)
  const selected = Math.max(
    0,
    rows.findIndex((row) => row.path === cursor),
  )
  const destination = rows[selected]?.path ?? initial
  const inactive = props.inactive || browsing
  const locked = picker.launching
  useEffect(() => {
    const controller = new AbortController()
    void discoverAgentGitProjects(
      target,
      [FREE_TERMINAL_WORKING_DIRECTORY],
      controller.signal,
    ).then(
      (result) => {
        if (!controller.signal.aborted) {
          setGit(result)
          setFindingGit(false)
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setGitError(true)
          setFindingGit(false)
        }
      },
    )
    return () => controller.abort()
  }, [target])
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new pane may take focus during launch; the modal retains it until success.
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [picker.pending, inactive])
  useEffect(() => {
    list.current?.scrollChildIntoView(`terminal-dialog-project-row-${selected}`)
  }, [selected])
  const launch = (path?: string) => {
    if (!locked) {
      const destination =
        path ?? rows.find((row) => row.path === cursorRef.current)?.path ?? rows[0]?.path ?? initial
      setChosen(destination)
      setCursor(destination)
      void picker.launch(destination)
    }
  }
  useKeyboard((key) => {
    if (inactive) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      picker.cancel()
      return
    }
    if (locked) {
      key.preventDefault()
      key.stopPropagation()
      return
    }
    if (["up", "down", "j", "k"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      const direction = ["up", "k"].includes(key.name) ? -1 : 1
      const index = Math.max(
        0,
        rows.findIndex((row) => row.path === cursorRef.current),
      )
      setCursor(rows[(index + direction + rows.length) % rows.length]?.path ?? initial)
    } else if (["enter", "return"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      launch()
    } else if (key.name === "p" && !key.ctrl && !key.meta) {
      key.preventDefault()
      key.stopPropagation()
      setBrowsing(true)
    } else if (key.name === "e") {
      key.preventDefault()
      key.stopPropagation()
      props.onEnvironment()
    }
  })
  const width = Math.max(1, Math.min(90, dimensions.width - 2))
  const small = dimensions.height < 16
  const origin =
    target.kind === "local"
      ? translateUi("Local")
      : `${translateUi("Remoto")} · ${target.profile.name}`
  const status =
    [
      picker.error,
      gitError && "Não foi possível procurar projetos Git.",
      findingGit && "Procurando projetos Git…",
      git.truncated && "Busca Git limitada; procure outra pasta.",
      picker.historyError && "Histórico indisponível; escolha uma pasta.",
    ].find(Boolean) || ""
  return (
    <>
      {!browsing && (
        <ModalSurface
          dialogRef={dialog}
          id="terminal-dialog-project-picker"
          width={width}
          height={Math.max(1, Math.min(26, dimensions.height - 2))}
          zIndex={810}
          borderColor={COLORS.terminal}
          onBackdropPress={picker.cancel}
          positionRelative
        >
          {!small && (
            <text
              content={translateUi("Novo agente · Codex")}
              style={{ height: 1, flexShrink: 0, fg: COLORS.terminal }}
            />
          )}
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <TerminalInlineButton
              id="terminal-dialog-project-environment"
              compact
              label="[E] Ambiente"
              disabled={locked}
              onPress={props.onEnvironment}
            />
            <text content={origin} wrapMode="none" style={{ fg: COLORS.focus, flexGrow: 1 }} />
          </box>
          <scrollbox
            ref={list}
            id="terminal-dialog-project-list"
            scrollY
            style={{ flexGrow: 1, minHeight: 0 }}
          >
            {rows.map((row, index) => (
              <box key={row.path} style={{ flexShrink: 0 }}>
                {rows[index - 1]?.group !== row.group && (
                  <text
                    content={translateUi(row.group)}
                    style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
                  />
                )}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: clicking or Enter launches the selected project. */}
                <box
                  id={`terminal-dialog-project-row-${index}`}
                  onMouseDown={() => {
                    if (!locked) launch(row.path)
                  }}
                  style={{
                    height: small ? 1 : 2,
                    flexShrink: 0,
                    backgroundColor: index === selected ? COLORS.panelRaised : COLORS.panel,
                  }}
                >
                  <text
                    content={`${index === selected ? "›" : " "} ${truncateDisplay(projectName(row.path), Math.max(1, width - 6))}`}
                    wrapMode="none"
                    style={{ fg: index === selected ? COLORS.focus : COLORS.text }}
                  />
                  {!small && (
                    <text
                      content={`  ${truncateDisplay(row.path, Math.max(1, width - 6))}`}
                      wrapMode="none"
                      style={{ fg: COLORS.muted }}
                    />
                  )}
                </box>
              </box>
            ))}
          </scrollbox>
          {status && (
            <text
              content={translateUi(status)}
              style={{
                height: 1,
                flexShrink: 0,
                fg: picker.error || gitError ? COLORS.warning : COLORS.muted,
              }}
            />
          )}
          <text
            content={`${origin} · ${projectName(destination)} · ${destination}`}
            wrapMode="none"
            style={{ height: 1, flexShrink: 0, fg: COLORS.focus }}
          />
          <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
            <TerminalInlineButton
              compact
              id="terminal-dialog-project-browse"
              label="[P] Procurar pasta"
              disabled={locked}
              onPress={() => setBrowsing(true)}
            />
            <TerminalInlineButton
              compact
              id="terminal-dialog-project-launch"
              label={locked ? "Iniciando agente…" : "[Enter] Iniciar agente"}
              disabled={locked}
              onPress={() => launch()}
            />
            <TerminalInlineButton
              compact
              id="terminal-dialog-project-back"
              label="[Esc] Voltar"
              onPress={picker.cancel}
            />
          </box>
          <PlasmaLoadingOverlay
            id="terminal-project-launch-loader"
            active={locked}
            label="Iniciando agente…"
            accent={COLORS.terminal}
            background={COLORS.canvas}
          />
        </ModalSurface>
      )}
      {browsing && (
        <AgentFolderBrowser
          target={target}
          origin={origin}
          onClose={() => setBrowsing(false)}
          onSelect={(path) => {
            setChosen(path)
            setCursor(path)
            setBrowsing(false)
          }}
        />
      )}
    </>
  )
}
