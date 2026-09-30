import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useEffect, useRef } from "react"
import type { RemoteCodexUpdateGuide } from "../model/remote-codex"

export function RemoteCodexUpdatePanel({
  sessionId,
  guide,
  profileName,
  active,
  terminalStatus,
  onActivateSession,
  onReturnTerminal,
  onRetry,
}: {
  sessionId: string
  guide: RemoteCodexUpdateGuide
  profileName: string
  active: boolean
  terminalStatus: string
  onActivateSession: () => void
  onReturnTerminal: () => void
  onRetry: (flowId: number) => void
}) {
  const renderer = useRenderer()
  const view = useRef<BoxRenderable | null>(null)
  const focusRevision = `${terminalStatus}:${guide.error}:${guide.report.localVersion}:${guide.report.remoteVersion}:${guide.report.reason}`
  useEffect(() => {
    if (!active || guide.checking || !focusRevision) return undefined
    const timer = setTimeout(() => view.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [active, focusRevision, guide.checking])
  useKeyboard((key) => {
    const focused = focusedRenderableId(renderer.currentFocusedRenderable)
    if (
      !active ||
      key.defaultPrevented ||
      focused !== `remote-codex-update-${sessionId}` ||
      !["escape", "enter", "return"].includes(key.name)
    )
      return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onReturnTerminal()
    else if (!guide.checking) onRetry(guide.flowId)
  })
  const remote = guide.side === "remote"
  const openCode = guide.report.providerId === "opencode"
  const detected = remote ? guide.report.remoteVersion : guide.report.localVersion
  const showInstaller = remote || process.platform !== "win32"
  const title = openCode ? "◆ ATUALIZAR OPENCODE" : "◆ ATUALIZAR CODEX"
  const upgradeCommand = openCode ? "opencode upgrade" : "codex update"
  const installer = openCode
    ? "curl -fsSL https://opencode.ai/v2/install | bash"
    : "curl -fsSL https://chatgpt.com/codex/install.sh | sh"
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: this companion panel owns its keyboard scope.
    <box
      ref={view}
      id={`remote-codex-update-${sessionId}`}
      focusable
      onMouseDown={() => {
        onActivateSession()
        view.current?.focus()
      }}
      style={{ width: "100%", height: "100%", paddingLeft: 1, paddingRight: 1 }}
    >
      <text
        content={`${translateUi(title)} · ${remote ? profileName : translateUi("Local")}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
      />
      <text
        content={`${translateUi("Versão detectada")}: ${detected ?? translateUi("não detectada")}`}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <text content={upgradeCommand} style={{ height: 1, flexShrink: 0, fg: COLORS.text }} />
      {showInstaller && (
        <text content={installer} style={{ height: 1, flexShrink: 0, fg: COLORS.muted }} />
      )}
      <text
        content={translateUi(
          "Execute manualmente no terminal acima; nenhum comando será preenchido.",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ flexGrow: 1 }} />
      {guide.error && (
        <text content={translateUi(guide.error)} style={{ height: 1, fg: COLORS.warning }} />
      )}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton label="[Esc] Terminal" accent={COLORS.terminal} onPress={onReturnTerminal} />
        <InlineButton
          id={`remote-codex-update-${sessionId}-retry`}
          label={guide.checking ? "Validando…" : "[Enter] Revalidar e tentar novamente"}
          accent={COLORS.warning}
          disabled={guide.checking}
          onPress={() => onRetry(guide.flowId)}
        />
      </box>
    </box>
  )
}
