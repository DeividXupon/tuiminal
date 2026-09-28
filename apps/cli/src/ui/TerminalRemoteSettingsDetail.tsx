import { RGBA, type BoxRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { blendTextColor } from "@xupon/tuiminal-core/ui/text-shimmer"
import { useCallback, useEffect, useRef, useState } from "react"
import { ConfigurationDetailHeader } from "./ConfigurationDetailHeader"
import { TerminalRemoteActionBar, type TerminalRemoteStatus } from "./TerminalRemoteActionBar"
import { TerminalRemoteProfileList } from "./TerminalRemoteProfileList"
import { TerminalRemoteReadinessPanel } from "./TerminalRemoteReadinessPanel"
import { TerminalRemoteSettingsPreview } from "./TerminalRemoteSettingsPreview"
import {
  remoteProfileKeyAction,
  resultMessage,
  type TerminalRemoteSettingsDetailProps,
} from "./terminal-remote-settings"

export function TerminalRemoteSettingsDetail({
  profiles,
  activeProfileId,
  notice,
  compact,
  contentWidth,
  onBack,
  onListProfiles,
  onActivateProfile,
  onTest,
  onCheckReadiness,
  onConfigureServer,
}: TerminalRemoteSettingsDetailProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dense = terminal.height <= 20
  const [availableProfiles, setAvailableProfiles] = useState(profiles)
  const [selectedId, setSelectedId] = useState(activeProfileId ?? profiles[0]?.id ?? "")
  const [status, setStatus] = useState<TerminalRemoteStatus>(null)
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [checkingReadiness, setCheckingReadiness] = useState(false)
  const [readiness, setReadiness] = useState<Awaited<ReturnType<typeof onCheckReadiness>> | null>(
    null,
  )
  const [formFocused, setFormFocused] = useState(
    () =>
      focusedRenderableId(renderer.currentFocusedRenderable)?.startsWith(
        "configuration-terminal-remote-",
      ) ?? false,
  )
  const view = useRef<BoxRenderable | null>(null)
  const profileScroll = useRef<ScrollBoxRenderable | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const operationController = useRef<AbortController | null>(null)
  const formOwnedFocus = useRef(formFocused)
  const enteringForm = useRef(false)
  const highlight = blendTextColor(RGBA.fromHex(COLORS.panel), RGBA.fromHex(COLORS.terminal), 0.22)

  const cancelOperation = useCallback(() => {
    operationController.current?.abort()
    operationController.current = null
    setTesting(false)
    setCheckingReadiness(false)
  }, [])
  const loadProfiles = useCallback(async () => {
    loadController.current?.abort()
    cancelOperation()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setStatus({ message: translateUi("Carregando ~/.ssh/config…") })
    setReadiness(null)
    try {
      const discovered = await onListProfiles(controller.signal)
      if (controller.signal.aborted) return
      setAvailableProfiles(discovered)
      setSelectedId((current) =>
        discovered.some((profile) => profile.id === current)
          ? current
          : (discovered.find((profile) => profile.id === activeProfileId)?.id ??
            discovered[0]?.id ??
            ""),
      )
      setStatus(
        discovered.length
          ? { message: translateUi("Hosts SSH carregados de ~/.ssh/config."), ok: true }
          : {
              message: translateUi("Nenhum Host explícito foi encontrado em ~/.ssh/config."),
            },
      )
    } catch {
      if (!controller.signal.aborted)
        setStatus({ message: translateUi("Não foi possível ler ~/.ssh/config."), ok: false })
    } finally {
      if (loadController.current === controller) {
        loadController.current = null
        setLoading(false)
      }
    }
  }, [activeProfileId, cancelOperation, onListProfiles])

  useEffect(() => {
    void loadProfiles()
    return () => {
      loadController.current?.abort()
      operationController.current?.abort()
    }
  }, [loadProfiles])
  useEffect(() => {
    profileScroll.current?.scrollChildIntoView(
      `configuration-terminal-remote-profile-${selectedId}`,
    )
  }, [selectedId])
  useEffect(() => {
    const update = () => {
      const focusedId = focusedRenderableId(renderer.currentFocusedRenderable)
      const ownsForm = focusedId?.startsWith("configuration-terminal-remote-") ?? false
      if (focusedId === "configuration-terminal-remote-view" && !formOwnedFocus.current)
        enteringForm.current = true
      formOwnedFocus.current = ownsForm
      setFormFocused(ownsForm)
    }
    update()
    renderer.on("focused_renderable", update)
    return () => {
      renderer.off("focused_renderable", update)
    }
  }, [renderer])

  const selectedProfile = availableProfiles.find((profile) => profile.id === selectedId) ?? null
  const focusView = useCallback(() => view.current?.focus(), [])
  const leaveForm = useCallback(() => {
    cancelOperation()
    onBack()
    const navigationTarget =
      renderer.root.findDescendantById("configuration-section-remoteConnection") ??
      renderer.root.findDescendantById("configuration-category-open")
    navigationTarget?.focus()
  }, [cancelOperation, onBack, renderer])
  const selectProfile = useCallback(
    (profile: TerminalRemoteCodexProfile) => {
      cancelOperation()
      setSelectedId(profile.id)
      setStatus(null)
      setReadiness(null)
      focusView()
    },
    [cancelOperation, focusView],
  )
  const moveProfile = useCallback(
    (direction: -1 | 1) => {
      if (!availableProfiles.length) return
      const current = Math.max(
        0,
        availableProfiles.findIndex((profile) => profile.id === selectedId),
      )
      const next =
        availableProfiles[
          (current + direction + availableProfiles.length) % availableProfiles.length
        ]
      if (next) setSelectedId(next.id)
    },
    [availableProfiles, selectedId],
  )
  const activateProfile = useCallback(() => {
    if (!selectedProfile) return
    onActivateProfile(selectedProfile)
    setStatus({ message: translateUi("Perfil remoto ativo."), ok: true })
  }, [onActivateProfile, selectedProfile])
  const test = useCallback(async () => {
    if (!selectedProfile) return
    operationController.current?.abort()
    const controller = new AbortController()
    operationController.current = controller
    setTesting(true)
    setStatus({ message: translateUi("Testando conexão SSH…") })
    try {
      const result = await onTest(selectedProfile, controller.signal)
      if (!controller.signal.aborted)
        setStatus({ message: translateUi(resultMessage(result)), ok: result.ok })
    } catch {
      if (!controller.signal.aborted)
        setStatus({ message: translateUi("O teste de conexão SSH falhou."), ok: false })
    } finally {
      if (operationController.current === controller) {
        operationController.current = null
        setTesting(false)
      }
    }
  }, [onTest, selectedProfile])
  const verifyReadiness = useCallback(async () => {
    if (!selectedProfile) return
    operationController.current?.abort()
    const controller = new AbortController()
    operationController.current = controller
    setCheckingReadiness(true)
    setStatus({ message: translateUi("Verificando servidor…") })
    try {
      const report = await onCheckReadiness(selectedProfile, controller.signal)
      if (controller.signal.aborted) return
      setReadiness(report)
      const ready = report.githubSsh.ready && report.codex.ready
      setStatus({
        message: translateUi(
          ready ? "Servidor pronto para o agente remoto." : "O servidor precisa ser configurado.",
        ),
        ok: ready,
      })
    } catch {
      if (!controller.signal.aborted)
        setStatus({ message: translateUi("Não foi possível verificar o servidor."), ok: false })
    } finally {
      if (operationController.current === controller) {
        operationController.current = null
        setCheckingReadiness(false)
      }
    }
  }, [onCheckReadiness, selectedProfile])
  const configureServer = useCallback(() => {
    if (!selectedProfile) return
    cancelOperation()
    onConfigureServer(selectedProfile)
  }, [cancelOperation, onConfigureServer, selectedProfile])

  useKeyboard((key) => {
    if (key.defaultPrevented || !formFocused) return
    if (enteringForm.current) {
      enteringForm.current = false
      if (key.name === "enter" || key.name === "return") return
    }
    const action = remoteProfileKeyAction(key, loading || testing || checkingReadiness)
    if (!action) return
    key.preventDefault()
    key.stopPropagation()
    const handlers: Record<typeof action, () => void> = {
      activate: activateProfile,
      close: leaveForm,
      previous: () => moveProfile(-1),
      next: () => moveProfile(1),
      reload: () => void loadProfiles(),
      test: () => void test(),
      verify: () => void verifyReadiness(),
      configure: configureServer,
    }
    handlers[action]()
  })

  return (
    <box
      ref={view}
      id="configuration-terminal-remote-view"
      focusable
      style={{ width: "100%", height: "100%", flexGrow: 1 }}
    >
      {formFocused ? (
        <ConfigurationDetailHeader
          section="remoteConnection"
          notice={notice}
          hint="[J/K/↑/↓] navegar · [Enter/A] ativar · [Esc] voltar"
          compact={compact}
          contentWidth={contentWidth}
        />
      ) : (
        <TerminalRemoteSettingsPreview
          profiles={profiles}
          activeProfileId={activeProfileId}
          notice={notice}
          compact={compact}
          contentWidth={contentWidth}
        />
      )}
      {formFocused ? (
        <box
          id="configuration-terminal-remote-form"
          style={{ width: "100%", flexGrow: 1, minHeight: 1 }}
        >
          {dense ? null : (
            <text
              content={translateUi(
                "O Tuiminal usa aliases Host de ~/.ssh/config; usuário, porta e identidade ficam no OpenSSH.",
              )}
              style={{ flexShrink: 0, fg: COLORS.muted }}
            />
          )}
          <TerminalRemoteProfileList
            profiles={availableProfiles}
            activeProfileId={activeProfileId}
            cursorProfileId={selectedId}
            loading={loading}
            dense={dense}
            highlight={highlight}
            scrollRef={profileScroll}
            onSelect={selectProfile}
          />
          <TerminalRemoteReadinessPanel
            report={readiness}
            checking={checkingReadiness}
            dense={dense}
          />
          <TerminalRemoteActionBar
            contentWidth={contentWidth}
            dense={dense}
            status={status}
            loading={loading}
            testing={testing}
            checkingReadiness={checkingReadiness}
            hasSelection={Boolean(selectedProfile)}
            onBack={leaveForm}
            onReload={() => void loadProfiles()}
            onActivate={activateProfile}
            onTest={() => void test()}
            onVerify={() => void verifyReadiness()}
            onConfigure={configureServer}
          />
        </box>
      ) : null}
    </box>
  )
}
