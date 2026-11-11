import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import { useEffect, useRef, useState } from "react"
import type { AgentProjectTarget } from "../services/agent-project-directories"
import { AgentEnvironmentRow } from "./AgentEnvironmentRow"
import { TerminalInlineButton, TerminalShortcutText } from "./TerminalShortcut"

const environmentKey = (target: AgentProjectTarget) =>
  target.kind === "local" ? "local" : `remote:${target.profile.id}`

export function AgentProjectEnvironmentDialog({
  profiles,
  loading,
  error,
  onSelect,
  onClose,
  inactive = false,
  target = { kind: "local" },
}: {
  profiles: readonly TerminalRemoteCodexProfile[]
  loading: boolean
  error: string
  onSelect: (target: AgentProjectTarget) => void
  onClose: () => void
  /** Renders without taking focus or keyboard input, as in simulated tutorials. */
  inactive?: boolean
  target?: AgentProjectTarget
}) {
  const dimensions = useTerminalDimensions()
  const dialog = useRef<BoxRenderable | null>(null)
  const list = useRef<ScrollBoxRenderable | null>(null)
  const [cursor, setCursor] = useState(() => environmentKey(target))
  const targets: AgentProjectTarget[] = [
    { kind: "local" },
    ...profiles.map((profile) => ({ kind: "remote" as const, profile })),
  ]
  const selected = Math.max(
    0,
    targets.findIndex((item) => environmentKey(item) === cursor),
  )
  const width = Math.max(1, Math.min(76, dimensions.width - 2))
  const contentWidth = Math.max(1, width - 4)
  const compact = dimensions.height < 18
  const rowHeight = compact ? 1 : 2
  const footerLabels = ["[Esc] Voltar", "[↑/↓] Navegar", "[Enter] Selecionar"]
  const stackedFooter =
    footerLabels.reduce((sum, label) => sum + displayWidth(translateUi(label)) + 2, 2) >
    contentWidth
  const footerHeight = stackedFooter ? 2 : 1
  const height = Math.max(
    1,
    Math.min(
      22,
      dimensions.height - 2,
      2 +
        (compact ? 1 : 3) +
        rowHeight +
        2 +
        Math.max(2, profiles.length * rowHeight) +
        footerHeight +
        Number(!compact),
    ),
  )
  const choose = (index: number) => {
    if (inactive || loading) return
    const target = targets[index]
    if (target) onSelect(target)
  }
  useEffect(() => {
    if (!inactive) dialog.current?.focus()
  }, [inactive])
  // biome-ignore lint/correctness/useExhaustiveDependencies: resizing or replacing rows changes their native scroll geometry.
  useEffect(() => {
    list.current?.scrollChildIntoView(`terminal-dialog-project-environment-${selected}`)
  }, [selected, compact, profiles.length])
  useKeyboard((key) => {
    if (inactive || !["escape", "up", "down", "enter", "return"].includes(key.name)) return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onClose()
    else if (loading) return
    else if (key.name === "up" || key.name === "down") {
      const next =
        targets[(selected + (key.name === "up" ? -1 : 1) + targets.length) % targets.length]
      if (next) setCursor(environmentKey(next))
    } else choose(selected)
  })
  return (
    <ModalSurface
      dialogRef={dialog}
      id="terminal-dialog-project-environments"
      width={width}
      height={height}
      zIndex={830}
      borderColor={COLORS.terminal}
      onBackdropPress={() => {
        if (!inactive) onClose()
      }}
    >
      <text
        content={truncateDisplay(translateUi("Ambiente de execução"), contentWidth)}
        wrapMode="none"
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      {!compact && (
        <text
          content={translateUi("Escolha onde iniciar o agente.")}
          style={{ height: 1, marginBottom: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      )}
      <AgentEnvironmentRow
        target={{ kind: "local" }}
        index={0}
        selected={selected === 0}
        current={target.kind === "local"}
        compact={compact}
        width={contentWidth}
        disabled={loading || inactive}
        onPress={() => choose(0)}
      />
      <box
        style={{
          height: 1,
          marginTop: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text
          content={`${translateUi("Remoto")} · ${profiles.length}`}
          style={{ fg: COLORS.muted }}
        />
        <text content="~/.ssh/config" style={{ fg: COLORS.muted }} />
      </box>
      <box style={{ position: "relative", flexGrow: 1, minHeight: 0 }}>
        <scrollbox
          ref={list}
          id="terminal-dialog-project-environment-list"
          scrollY
          style={{ flexGrow: 1, minHeight: 0 }}
        >
          {profiles.map((profile, index) => (
            <AgentEnvironmentRow
              key={profile.id}
              target={{ kind: "remote", profile }}
              index={index + 1}
              selected={selected === index + 1}
              current={target.kind === "remote" && target.profile.id === profile.id}
              compact={compact}
              width={contentWidth - 1}
              disabled={loading || inactive}
              onPress={() => choose(index + 1)}
            />
          ))}
          {!loading && !profiles.length && !error && (
            <box style={{ height: 2, flexShrink: 0 }}>
              <text
                content={translateUi("Nenhum alias SSH encontrado.")}
                style={{ fg: COLORS.muted }}
              />
              {!compact && (
                <text
                  content={translateUi("Adicione um Host em ~/.ssh/config.")}
                  style={{ fg: COLORS.muted }}
                />
              )}
            </box>
          )}
          {error && (
            <text
              content={translateUi(error)}
              wrapMode="word"
              style={{ flexShrink: 0, fg: COLORS.warning }}
            />
          )}
        </scrollbox>
        <PlasmaLoadingOverlay
          id="terminal-environment-loader"
          active={loading}
          label="Carregando ~/.ssh/config…"
          accent={COLORS.terminal}
          background={COLORS.canvas}
        />
      </box>
      <box
        id="terminal-dialog-project-environment-footer"
        style={{ height: footerHeight, marginTop: compact ? 0 : 1, flexShrink: 0 }}
      >
        {stackedFooter && (
          <TerminalShortcutText
            content={translateUi("[↑/↓] Navegar")}
            style={{ height: 1, fg: COLORS.muted }}
          />
        )}
        <box style={{ height: 1, flexDirection: "row", justifyContent: "space-between" }}>
          <TerminalInlineButton
            id="terminal-dialog-project-environment-cancel"
            compact
            label="[Esc] Voltar"
            disabled={inactive}
            onPress={onClose}
          />
          {!stackedFooter && (
            <TerminalShortcutText
              content={translateUi("[↑/↓] Navegar")}
              style={{ height: 1, fg: COLORS.muted }}
            />
          )}
          <TerminalInlineButton
            id="terminal-dialog-project-environment-select"
            compact
            label="[Enter] Selecionar"
            accent={COLORS.terminal}
            disabled={loading || inactive}
            onPress={() => choose(selected)}
          />
        </box>
      </box>
    </ModalSurface>
  )
}
