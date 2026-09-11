import { EmbeddedTerminalRenderable } from "@opentui/core"
import { extend } from "@opentui/react"
import type { RefObject } from "react"
import { COLORS, panelBorder } from "../../../../core/settings/theme"
import { translateUi } from "../../../../shared/i18n"
import { InlineButton } from "../../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../../shared/ui/ShortcutText"
import type { GitHubCliGuidedTerminalProcess } from "../../services/github/installer"
import type {
  GitHubGuidanceCopy,
  GitHubGuidanceMode,
  GitHubGuidanceStatus,
} from "./github-guidance-copy"

extend({ "git-gh-guidance-terminal": EmbeddedTerminalRenderable })

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "git-gh-guidance-terminal": typeof EmbeddedTerminalRenderable
  }
}

function statusCopy(status: GitHubGuidanceStatus, copy: GitHubGuidanceCopy) {
  if (status === "checking") return copy.checking
  if (status === "ready") return copy.ready
  if (status === "failed") return copy.unavailable
  return copy.waiting
}

export function GitHubGuidanceGuide({
  copy,
  mode,
  singlePanel,
  visible,
  sideBySide,
  stacked,
  command,
  commandAvailable,
  metadata,
  guideUrl,
  status,
  message,
  terminalClosed,
  onCopy,
  onOpenTerminal,
  onVerify,
}: {
  copy: GitHubGuidanceCopy
  mode: GitHubGuidanceMode
  singlePanel: boolean
  visible: boolean
  sideBySide: boolean
  stacked: boolean
  command: string
  commandAvailable: boolean
  metadata: string
  guideUrl: string
  status: GitHubGuidanceStatus
  message: string
  terminalClosed: boolean
  onCopy: () => void
  onOpenTerminal: () => void
  onVerify: () => void
}) {
  return (
    <box
      visible={visible}
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
      <text content={translateUi(copy.title)} style={{ fg: COLORS.git }} />
      <text
        content={translateUi(copy.description)}
        style={{ fg: COLORS.text, wrapMode: "word", marginTop: 1 }}
      />
      {singlePanel ? (
        <ShortcutText
          content={translateUi(copy.compactGuide)}
          style={{ fg: COLORS.muted, wrapMode: "word", marginTop: 1 }}
        />
      ) : (
        <box style={{ marginTop: 1 }}>
          {copy.steps.map((step) => (
            <ShortcutText
              key={step}
              content={translateUi(step)}
              style={{ fg: COLORS.muted, wrapMode: "word" }}
            />
          ))}
        </box>
      )}
      {mode === "authenticate" ? (
        <text
          content={translateUi(
            "O Tuiminal não lê nem guarda seu token; o login acontece somente no gh e no GitHub.",
          )}
          style={{ fg: COLORS.warning, marginTop: 1, wrapMode: "word" }}
        />
      ) : (
        <text
          content={translateUi("Depois da instalação, autentique com o passo guiado do Tuiminal.")}
          style={{ fg: COLORS.warning, marginTop: 1 }}
        />
      )}
      <text content={translateUi(metadata)} style={{ fg: COLORS.muted, marginTop: 1 }} />
      <text
        content={translateUi(command)}
        style={{
          fg: COLORS.git,
          wrapMode: "word",
          maxHeight: sideBySide ? 5 : singlePanel ? 1 : 2,
        }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row", marginTop: 1 }}>
        <InlineButton
          id="git-gh-guidance-copy"
          label="[C] Copiar comando"
          accent={COLORS.git}
          disabled={!commandAvailable}
          onPress={onCopy}
        />
        <InlineButton
          id="git-gh-guidance-open"
          label={terminalClosed ? "[Enter] Reabrir terminal" : "[Enter] Usar terminal"}
          accent={COLORS.git}
          onPress={onOpenTerminal}
        />
        <InlineButton
          id="git-gh-guidance-retry"
          label="[R] Verificar novamente"
          accent={COLORS.git}
          disabled={status === "checking" || status === "ready"}
          onPress={onVerify}
        />
      </box>
      {!commandAvailable ? (
        <text
          content={`${translateUi("Comando automático indisponível. Guia oficial")}: ${guideUrl}`}
          style={{ fg: COLORS.warning, wrapMode: "word" }}
        />
      ) : null}
      {message ? (
        <text
          content={translateUi(message)}
          style={{ fg: status === "failed" ? COLORS.danger : COLORS.muted, wrapMode: "word" }}
        />
      ) : null}
    </box>
  )
}

export function GitHubGuidanceTerminal({
  copy,
  status,
  terminalClosed,
  visible,
  terminalRef,
  processRef,
}: {
  copy: GitHubGuidanceCopy
  status: GitHubGuidanceStatus
  terminalClosed: boolean
  visible: boolean
  terminalRef: RefObject<EmbeddedTerminalRenderable | null>
  processRef: RefObject<GitHubCliGuidedTerminalProcess | null>
}) {
  return (
    <box
      visible={visible}
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
        <text content={translateUi(copy.terminalTitle)} style={{ fg: COLORS.git }} />
        <text content={translateUi(statusCopy(status, copy))} style={{ fg: COLORS.muted }} />
      </box>
      <git-gh-guidance-terminal
        ref={terminalRef}
        id="git-gh-guidance-terminal"
        maxScrollback={2_000}
        selectable
        onData={(data) => processRef.current?.write(data)}
        onTerminalResize={(columns, rows) => processRef.current?.resize(columns, rows)}
        onMouseDown={() => terminalRef.current?.focus()}
        style={{ flexGrow: 1, minHeight: 5, width: "100%" }}
      />
      <ShortcutText
        content={translateUi(
          terminalClosed
            ? "Mini terminal encerrado · [Enter] reabre · [Esc] libera o foco"
            : "Digite ou cole o comando aqui · [Esc] libera o foco do terminal",
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
