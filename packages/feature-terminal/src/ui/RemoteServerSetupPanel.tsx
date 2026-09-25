import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { focusedRenderableId } from "@xupon/tuiminal-core/keyboard/scope"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, type TerminalRemoteCodexProfile } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  checkRemoteServerBarrier,
  checkRemoteServerReadiness,
  nextRemoteServerBarrier,
  REMOTE_SERVER_BARRIER_ORDER,
  type RemoteServerBarrierCode,
  type RemoteServerBarrierId,
  type RemoteServerReadinessReport,
} from "../services/remote-server-readiness"

function barrierLabel(id: RemoteServerBarrierId) {
  return id === "githubSsh" ? "GitHub via SSH" : "Codex CLI"
}

function resultMessage(code: RemoteServerBarrierCode) {
  const messages: Record<RemoteServerBarrierCode, string> = {
    ready: "Pronto",
    gitMissing: "Git não está instalado.",
    sshMissing: "O cliente SSH não está instalado no servidor.",
    hostKey: "Confirme a identidade do GitHub no terminal.",
    authentication: "O GitHub ainda não aceitou a chave SSH deste servidor.",
    unreachable: "O servidor não conseguiu alcançar o GitHub.",
    codexMissing: "O Codex CLI ainda não está instalado.",
    codexUnauthenticated: "A conta do Codex ainda não está conectada.",
    invalidProfile: "O perfil remoto é inválido.",
    identityMissing: "A chave privada local não foi encontrada.",
    timeout: "A verificação excedeu o tempo limite.",
    cancelled: "Verificação cancelada.",
    sshUnavailable: "O cliente SSH local não está disponível.",
    failed: "A verificação falhou.",
  }
  return messages[code]
}

function instructions(id: RemoteServerBarrierId, report: RemoteServerReadinessReport | null) {
  if (id === "githubSsh")
    return [
      '1. Crie uma chave: ssh-keygen -t ed25519 -C "seu-email-do-github"',
      "2. Mostre a chave: cat ~/.ssh/id_ed25519.pub",
      "3. Adicione a chave pública no GitHub: Settings → SSH and GPG keys",
      "4. Teste no terminal: ssh -T git@github.com",
    ]
  return report?.codex.code === "codexUnauthenticated"
    ? ["1. Conecte sua conta: codex login --device-auth"]
    : [
        "1. Instale: curl -fsSL https://chatgpt.com/codex/install.sh | sh",
        "2. Conecte sua conta: codex login --device-auth",
      ]
}

export function RemoteServerSetupPanel({
  sessionId,
  profile,
  active,
  onActivateSession,
  onReturnTerminal,
}: {
  sessionId: string
  profile: TerminalRemoteCodexProfile
  active: boolean
  onActivateSession: () => void
  onReturnTerminal: () => void
}) {
  const renderer = useRenderer()
  const view = useRef<BoxRenderable | null>(null)
  const controller = useRef<AbortController | null>(null)
  const [report, setReport] = useState<RemoteServerReadinessReport | null>(null)
  const [current, setCurrent] = useState<RemoteServerBarrierId | null>("githubSsh")
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState("Verificando servidor…")

  useEffect(() => {
    const nextController = new AbortController()
    controller.current = nextController
    setChecking(true)
    void checkRemoteServerReadiness(profile, nextController.signal)
      .then((nextReport) => {
        if (nextController.signal.aborted) return
        const nextBarrier = nextRemoteServerBarrier(nextReport)
        setReport(nextReport)
        setCurrent(nextBarrier)
        setStatus(
          nextBarrier
            ? resultMessage(nextReport[nextBarrier].code)
            : "Servidor pronto para o agente remoto.",
        )
      })
      .catch(() => {
        if (!nextController.signal.aborted) setStatus("Não foi possível verificar o servidor.")
      })
      .finally(() => {
        if (controller.current === nextController) {
          controller.current = null
          setChecking(false)
        }
      })
    return () => {
      nextController.abort()
      if (controller.current === nextController) controller.current = null
    }
  }, [profile])

  const confirm = useCallback(async () => {
    if (checking) return
    if (!current) {
      onReturnTerminal()
      return
    }
    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    setChecking(true)
    setStatus("Verificando etapa atual…")
    try {
      const barrier = await checkRemoteServerBarrier(profile, current, nextController.signal)
      if (nextController.signal.aborted) return
      const nextReport = {
        ...(report ?? {
          githubSsh: { id: "githubSsh", ready: false, code: "failed" },
          codex: { id: "codex", ready: false, code: "failed" },
        }),
        [current]: barrier,
      } as RemoteServerReadinessReport
      setReport(nextReport)
      if (!barrier.ready) {
        setStatus(resultMessage(barrier.code))
        return
      }
      const nextBarrier = nextRemoteServerBarrier(nextReport)
      setCurrent(nextBarrier)
      setStatus(
        nextBarrier
          ? `${barrierLabel(current)} confirmado. Continue para ${barrierLabel(nextBarrier)}.`
          : "Servidor pronto para o agente remoto.",
      )
    } catch {
      if (!nextController.signal.aborted) setStatus("Não foi possível verificar a etapa atual.")
    } finally {
      if (controller.current === nextController) {
        controller.current = null
        setChecking(false)
      }
    }
  }, [checking, current, onReturnTerminal, profile, report])

  useKeyboard((key) => {
    const focused = focusedRenderableId(renderer.currentFocusedRenderable)
    if (!active || key.defaultPrevented || !focused?.startsWith(`remote-server-setup-${sessionId}`))
      return
    if (key.name !== "enter" && key.name !== "return" && key.name !== "escape") return
    key.preventDefault()
    key.stopPropagation()
    if (key.name === "escape") onReturnTerminal()
    else void confirm()
  })

  const step = current
    ? REMOTE_SERVER_BARRIER_ORDER.indexOf(current) + 1
    : REMOTE_SERVER_BARRIER_ORDER.length
  const tutorial = current ? instructions(current, report) : []
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes own keyboard focus and mouse activation.
    <box
      ref={view}
      id={`remote-server-setup-${sessionId}`}
      focusable
      onMouseDown={() => {
        onActivateSession()
        view.current?.focus()
      }}
      style={{ width: "100%", height: "100%", paddingLeft: 1, paddingRight: 1 }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("◆ PREPARAR SERVIDOR")} style={{ fg: COLORS.terminal }} />
        <text
          content={` · ${profile.name} · ${translateUi("ETAPA")} ${step}/${REMOTE_SERVER_BARRIER_ORDER.length}`}
          style={{ fg: COLORS.muted }}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {REMOTE_SERVER_BARRIER_ORDER.map((id) => (
          <text
            key={id}
            content={`${report?.[id].ready ? "●" : id === current ? "◆" : "○"} ${translateUi(barrierLabel(id))}  `}
            style={{
              fg: report?.[id].ready
                ? COLORS.success
                : id === current
                  ? COLORS.terminal
                  : COLORS.muted,
            }}
          />
        ))}
      </box>
      <scrollbox
        id={`remote-server-setup-${sessionId}-tutorial`}
        scrollY
        style={{ width: "100%", flexGrow: 1, minHeight: 1 }}
        verticalScrollbarOptions={{
          trackOptions: { backgroundColor: COLORS.panel, foregroundColor: COLORS.border },
        }}
      >
        {current ? (
          <text
            content={`${translateUi("Configure manualmente no terminal acima")}: ${translateUi(barrierLabel(current))}`}
            style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
          />
        ) : (
          <text
            content={translateUi("Todas as barreiras foram confirmadas.")}
            style={{ height: 1, flexShrink: 0, fg: COLORS.success }}
          />
        )}
        {tutorial.map((line) => (
          <text
            key={line}
            content={translateUi(line)}
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        ))}
      </scrollbox>
      <text
        content={translateUi(status)}
        style={{ height: 1, flexShrink: 0, fg: current ? COLORS.warning : COLORS.success }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton label="[Esc] Terminal" accent={COLORS.terminal} onPress={onReturnTerminal} />
        <InlineButton
          id={`remote-server-setup-${sessionId}-confirm`}
          label={
            checking
              ? "Verificando…"
              : current
                ? "[Enter] Confirmar configuração"
                : "[Enter] Concluir"
          }
          accent={COLORS.terminal}
          disabled={checking}
          onPress={() => void confirm()}
        />
      </box>
    </box>
  )
}
