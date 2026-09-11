import { EmbeddedTerminalRenderable } from "@opentui/core"
import { extend, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLORS, LAYOUT, panelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import { detectGhCapabilities, type GhCapabilities } from "../../services/github/auth"
import {
  detectGitHubCliInstallPlan,
  type GitHubCliInstallMode,
  type GitHubCliInstallerProcess,
  type GitHubCliInstallPlan,
  startGitHubCliInstaller,
} from "../../services/github/installer"

extend({ "git-gh-installer-terminal": EmbeddedTerminalRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "git-gh-installer-terminal": typeof EmbeddedTerminalRenderable
  }
}

type InstallerStatus = "idle" | "running" | "checking" | "failed" | "ready"
type InstallerStarter = typeof startGitHubCliInstaller

async function installedGhIsReady() {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  const capabilities = await detectGhCapabilities(executable ? { executable } : {})
  return capabilities.supported
}

function statusCopy(status: InstallerStatus) {
  if (status === "running") return "INSTALANDO… interaja com o terminal se solicitado"
  if (status === "checking") return "VALIDANDO A INSTALAÇÃO…"
  if (status === "ready") return "GH INSTALADO · RECARREGANDO…"
  if (status === "failed") return "A instalação não terminou. Revise a saída e tente novamente."
  return "O comando só será executado após sua confirmação."
}

function installMode(capabilities: GhCapabilities): GitHubCliInstallMode {
  return capabilities.reason === "missing" ? "install" : "upgrade"
}

export function GitHubCliRequirementPanel({
  active,
  capabilities,
  onRetry,
  installPlan,
  startInstaller = startGitHubCliInstaller,
  verifyInstallation = installedGhIsReady,
}: {
  active: boolean
  capabilities: GhCapabilities
  onRetry: () => void
  installPlan?: GitHubCliInstallPlan
  startInstaller?: InstallerStarter
  verifyInstallation?: () => Promise<boolean>
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const terminalRef = useRef<EmbeddedTerminalRenderable | null>(null)
  const processRef = useRef<GitHubCliInstallerProcess | null>(null)
  const mountedRef = useRef(true)
  const [status, setStatus] = useState<InstallerStatus>("idle")
  const [error, setError] = useState("")
  const mode = installMode(capabilities)
  const plan = useMemo(() => installPlan ?? detectGitHubCliInstallPlan(mode), [installPlan, mode])
  const sideBySide = terminal.width >= 96 && terminal.height >= 18
  const stacked = !sideBySide && terminal.height >= 30
  const singlePanel = !sideBySide && !stacked
  const showGuide = !singlePanel || status === "idle"
  const showTerminal = !singlePanel || status !== "idle"

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      processRef.current?.stop()
      processRef.current = null
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      terminalRef.current?.write(
        `\u001b[36m$ ${plan.displayCommand}\u001b[0m\r\n\r\n${translateUi("Aguardando [I] Instalar…")}\r\n`,
      )
    }, 0)
    return () => clearTimeout(timeout)
  }, [plan.displayCommand])

  const verifyAndReload = useCallback(async () => {
    if (!mountedRef.current) return
    setStatus("checking")
    try {
      const ready = await verifyInstallation()
      if (!mountedRef.current) return
      if (!ready) {
        setStatus("failed")
        setError("O comando terminou, mas gh 2.40.0 ou mais recente ainda não foi encontrado.")
        return
      }
      setStatus("ready")
      terminalRef.current?.write(
        `\r\n\u001b[32m${translateUi("✓ gh pronto. Recarregando Git…")}\u001b[0m\r\n`,
      )
      onRetry()
    } catch (failure) {
      if (!mountedRef.current) return
      setStatus("failed")
      setError(failure instanceof Error ? failure.message : "Não foi possível validar o gh.")
    }
  }, [onRetry, verifyInstallation])

  const start = useCallback(() => {
    if (!plan.command || status === "running" || status === "checking") return
    setError("")
    setStatus("running")
    terminalRef.current?.write(
      `\r\n\u001b[33m${translateUi("Iniciando o instalador confirmado pelo usuário…")}\u001b[0m\r\n`,
    )
    try {
      processRef.current = startInstaller(plan, {
        columns: Math.max(20, terminalRef.current?.width ?? 80),
        rows: Math.max(5, terminalRef.current?.height ?? 16),
        onData: (data) => terminalRef.current?.write(data),
        onExit: (result) => {
          processRef.current = null
          if (!mountedRef.current || result.stopped) return
          if (result.code === 0) void verifyAndReload()
          else {
            setStatus("failed")
            setError("O instalador terminou sem sucesso. Consulte a saída acima.")
          }
        },
      })
      setTimeout(() => terminalRef.current?.focus(), 0)
    } catch (failure) {
      setStatus("failed")
      setError(
        failure instanceof Error ? failure.message : "Não foi possível iniciar o instalador.",
      )
    }
  }, [plan, startInstaller, status, verifyAndReload])

  useKeyboard((key) => {
    if (!active) return
    const terminalFocused = renderer.currentFocusedRenderable?.id === "git-gh-installer-terminal"
    if (terminalFocused) {
      if (key.name === "escape") {
        key.preventDefault()
        key.stopPropagation()
        terminalRef.current?.blur()
      }
      return
    }
    if (key.name === "i" && status !== "running" && status !== "checking") {
      key.preventDefault()
      key.stopPropagation()
      start()
    } else if (key.name === "r") {
      key.preventDefault()
      key.stopPropagation()
      onRetry()
    }
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
      <box
        visible={showGuide}
        style={{
          ...panelBorder(),
          width: sideBySide ? "43%" : "100%",
          height: stacked ? "50%" : "auto",
          flexGrow: sideBySide || stacked ? 0 : 1,
          minHeight: 9,
          justifyContent: "center",
          backgroundColor: COLORS.panel,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <text
          content={translateUi(
            capabilities.reason === "missing"
              ? "◆ GITHUB CLI NÃO ENCONTRADO"
              : "◆ GITHUB CLI PRECISA SER ATUALIZADO",
          )}
          style={{ fg: COLORS.git }}
        />
        <text
          content={translateUi(
            "gh é a ferramenta oficial do GitHub para usar Pull Requests, Issues e autenticação diretamente no terminal.",
          )}
          style={{ fg: COLORS.text, wrapMode: "word", marginTop: 1 }}
        />
        {singlePanel ? (
          <ShortcutText
            content={translateUi(
              "Confira o comando, pressione [I] e interaja somente se o sistema pedir. A validação e a recarga são automáticas.",
            )}
            style={{ fg: COLORS.muted, wrapMode: "word", marginTop: 1 }}
          />
        ) : (
          <>
            <text
              content={translateUi("1. Confira o comando oficial detectado para seu sistema.")}
              style={{ fg: COLORS.muted, marginTop: 1 }}
            />
            <ShortcutText
              content={translateUi(
                "2. Pressione [I] para instalar; informe sua senha administrativa somente se o sistema pedir.",
              )}
              style={{ fg: COLORS.muted, wrapMode: "word" }}
            />
            <text
              content={translateUi(
                "3. Ao terminar, o Tuiminal valida a versão e recarrega esta tela automaticamente.",
              )}
              style={{ fg: COLORS.muted, wrapMode: "word" }}
            />
          </>
        )}
        <text
          content={translateUi("Depois, o GitHub poderá solicitar: gh auth login")}
          style={{ fg: COLORS.warning, marginTop: 1 }}
        />
        <text
          content={`${translateUi("Método detectado")}: ${translateUi(plan.manager)}`}
          style={{ fg: COLORS.muted, marginTop: 1 }}
        />
        <text
          content={translateUi(plan.displayCommand)}
          style={{
            fg: COLORS.git,
            wrapMode: "word",
            maxHeight: sideBySide ? 5 : singlePanel ? 1 : 2,
          }}
        />
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
          <InlineButton
            id="git-gh-installer-start"
            label={mode === "install" ? "[I] Instalar gh" : "[I] Atualizar gh"}
            accent={COLORS.git}
            disabled={!plan.available || status === "running" || status === "checking"}
            onPress={start}
          />
          <InlineButton
            id="git-gh-installer-retry"
            label="[R] Verificar novamente"
            accent={COLORS.git}
            disabled={status === "running" || status === "checking"}
            onPress={onRetry}
          />
        </box>
        {!plan.available ? (
          <text
            content={`${translateUi("Instalador automático indisponível. Guia oficial")}: ${plan.guideUrl}`}
            style={{ fg: COLORS.warning, wrapMode: "word" }}
          />
        ) : null}
      </box>

      <box
        visible={showTerminal}
        style={{
          ...panelBorder(COLORS.git),
          flexGrow: 1,
          minHeight: 7,
          backgroundColor: COLORS.panel,
        }}
      >
        <box
          style={{
            height: 2,
            flexShrink: 0,
            backgroundColor: COLORS.panelRaised,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text content={translateUi("❯ INSTALAÇÃO DO GH")} style={{ fg: COLORS.git }} />
          <text content={translateUi(statusCopy(status))} style={{ fg: COLORS.muted }} />
        </box>
        <git-gh-installer-terminal
          ref={terminalRef}
          id="git-gh-installer-terminal"
          maxScrollback={2_000}
          selectable
          onData={(data, source) => {
            if (source === "input") processRef.current?.write(data)
          }}
          onTerminalResize={(columns, rows) => processRef.current?.resize(columns, rows)}
          onMouseDown={() => terminalRef.current?.focus()}
          style={{ flexGrow: 1, minHeight: 5, width: "100%" }}
        />
        {error ? (
          <text
            content={translateUi(error)}
            style={{ height: 1, flexShrink: 0, fg: COLORS.danger }}
          />
        ) : null}
        <ShortcutText
          content={translateUi("Clique para interagir · [Esc] libera o foco do terminal")}
          style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
        />
      </box>
    </box>
  )
}
