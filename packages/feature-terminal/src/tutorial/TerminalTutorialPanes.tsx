import { pathToFiletype } from "@opentui/core"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, getUiSettings } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { NativeDiff } from "@xupon/tuiminal-core/ui/NativeDiff"
import { type ReactNode, useMemo } from "react"
import type { RemoteProjectSyncStatus } from "../model/remote-project-sync"
import { prepareLiveDiffPatch, recentDiffLines } from "../rendering/live-diff-hunks"
import { decoratedLineColors } from "../rendering/live-diff-line-colors"
import { liveDiffUnwrappedHeight, liveDiffWrappedHeight } from "../rendering/live-diff-table"
import { terminalShortcutColor } from "../rendering/terminal-shortcut"
import { remoteServerSetupInstructions } from "../services/remote-server-setup"
import type { AgentMessageDetailView } from "../ui/AgentMessageDetails"
import { AgentMessageHistoryPanel } from "../ui/AgentMessageHistoryPanel"
import { LiveDiffFileTable } from "../ui/LiveDiffFileTable"
import { LiveDiffInfo } from "../ui/LiveDiffInfo"
import { TerminalPaneMetadata } from "../ui/TerminalContextTags"
import {
  TUTORIAL_ADMIN_PROJECT,
  TUTORIAL_BASELINE_PATCH,
  TUTORIAL_PATCH,
  tutorialHistory,
  tutorialLiveDiffFiles,
} from "./TerminalTutorialAgentFixtures"
import {
  TUTORIAL_PROFILE,
  TUTORIAL_PROJECT,
  tutorialRepositoryContext,
} from "./TerminalTutorialFixtures"

const noop = () => {}
type Tone = "text" | "muted" | "success" | "warning" | "danger" | "terminal" | "focus" | "git"
export type TutorialOutputLine = readonly [text: string, tone?: Tone]

const t = translateUi

export function tutorialOutput(
  kind: "dev" | "lazygit" | "codex" | "remote" | "setup",
): TutorialOutputLine[] {
  if (kind === "dev")
    return [
      ["❯ bun run dev", "terminal"],
      ["$ vite --port 5173", "muted"],
      [""],
      ["  VITE ready in 412 ms", "success"],
      ["  ➜  Local:   http://localhost:5173/", "focus"],
      ["  ➜  Network: use --host to expose", "muted"],
      [""],
      ["12:04:31 [vite] hmr update /src/carrinho/Resumo.tsx", "muted"],
      ["12:05:02 [vite] hmr update /src/frete/calcular.ts", "muted"],
      ["12:05:40 [vite] page reload src/cupom/aplicar.ts", "muted"],
    ]
  if (kind === "lazygit")
    return [
      ["╭ Status ─────────────", "git"],
      ["  lojinha → feat/cupom ↑2", "text"],
      ["╭ Files ──────────────", "git"],
      ["   M src/frete/calcular.ts", "warning"],
      ["  ?? src/cupom/aplicar.ts", "danger"],
      ["╭ Branches ───────────", "git"],
      ["  * feat/cupom", "success"],
      ["    main", "muted"],
      ["╭ Commits ────────────", "git"],
      ["  a1b2c3d frete: arredonda centavos", "text"],
      ["  9f8e7d6 carrinho: resumo do pedido", "muted"],
    ]
  if (kind === "codex")
    return [
      [">_ Codex · ~/projetos/lojinha · feat/cupom", "terminal"],
      [""],
      [`› ${t("adiciona um teste para CEP inválido e roda tudo")}`, "text"],
      [""],
      [`• ${t("Lendo")} src/frete/calcular.ts`, "muted"],
      [`• ${t("Editando")} src/frete/calcular.ts (+9 −2)`, "warning"],
      [`• ${t("Rodando")} bun test tests/frete.test.ts`, "muted"],
      [`  ✓ ${t("42 testes passaram")}`, "success"],
      [""],
      [`◦ ${t("Trabalhando")} (32s · esc ${t("para interromper")})`, "focus"],
    ]
  if (kind === "remote")
    return [
      [">_ Codex · vps-staging:/srv/lojinha · main", "terminal"],
      [""],
      [`› ${t("o worker de e-mails reinicia sem parar no servidor")}`, "text"],
      [""],
      [`• ${t("Lendo")} /etc/systemd/system/lojinha-worker.service`, "muted"],
      [`• ${t("Rodando")} journalctl -u lojinha-worker -n 50`, "muted"],
      ["  error: SMTP_HOST is not set", "danger"],
      [`• ${t("Editando")} .env.example (+1)`, "warning"],
      [""],
      [`◦ ${t("Trabalhando")} (1m 12s · esc ${t("para interromper")})`, "focus"],
    ]
  return [
    ["deploy@vps-staging:~$ ssh -T git@github.com", "text"],
    ["git@github.com: Permission denied (publickey).", "danger"],
    ['deploy@vps-staging:~$ ssh-keygen -t ed25519 -C "dev@exemplo.dev"', "text"],
    ["Generating public/private ed25519 key pair.", "muted"],
    ["deploy@vps-staging:~$ █", "text"],
  ]
}

export function FakeTerminalOutput({ lines }: { lines: readonly TutorialOutputLine[] }) {
  return (
    <box style={{ flexGrow: 1, minHeight: 1, overflow: "hidden", backgroundColor: COLORS.canvas }}>
      {lines.map(([text, tone = "text"], index) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed simulated output never reorders.
          key={index}
          content={text || " "}
          wrapMode="none"
          style={{ height: 1, flexShrink: 0, fg: COLORS[tone] }}
        />
      ))}
    </box>
  )
}

/** One simulated PTY with the real metadata strip above it. */
export function TutorialPane({
  id,
  metadataId,
  sessionId,
  width,
  lines,
  origin,
  sync,
  remote = false,
  plain = false,
  children,
}: {
  id?: string
  metadataId?: string
  sessionId: string
  width: number
  lines: readonly TutorialOutputLine[]
  origin?: "local" | "remote"
  sync?: RemoteProjectSyncStatus
  remote?: boolean
  /** Generic SSH shells do not claim a repository context. */
  plain?: boolean
  children?: ReactNode
}) {
  return (
    <box
      {...(id ? { id } : {})}
      style={{ flexGrow: 1, flexBasis: 0, minWidth: 1, minHeight: 1, overflow: "hidden" }}
    >
      {!plain && (
        <box {...(metadataId ? { id: metadataId } : {})} style={{ height: 1, flexShrink: 0 }}>
          <TerminalPaneMetadata
            sessionId={sessionId}
            context={tutorialRepositoryContext(remote)}
            sync={sync}
            agentOrigin={origin}
            masterKey={getUiSettings().terminalMasterKey}
            active
            covered={false}
            availableWidth={width}
            onActivate={noop}
          />
        </box>
      )}
      <FakeTerminalOutput lines={lines} />
      {children}
    </box>
  )
}

export function TutorialHistory({
  id,
  sessionId,
  now,
  detail,
}: {
  id: string
  sessionId: string
  now: number
  detail?: AgentMessageDetailView
}) {
  const messages = useMemo(() => tutorialHistory(now), [now])
  return (
    <box id={id} style={{ height: detail ? "60%" : "34%", flexShrink: 0, minHeight: 6 }}>
      <AgentMessageHistoryPanel
        key={detail ?? "table"}
        sessionId={sessionId}
        messages={messages}
        active={false}
        focusRequest={0}
        initialDetailView={detail ?? null}
        onClose={noop}
        onReturnTerminal={noop}
        onActivateSession={noop}
        onDetailModeChange={noop}
      />
    </box>
  )
}

export function tutorialLiveDiffWidth(paneWidth: number) {
  return Math.max(Math.min(27, paneWidth), Math.round(paneWidth * 0.48) - 14)
}

export function TutorialLiveDiff({
  id,
  sessionId,
  width,
  height,
  now,
  codeFocused,
}: {
  id: string
  sessionId: string
  width: number
  height: number
  now: number
  codeFocused: boolean
}) {
  const files = useMemo(() => tutorialLiveDiffFiles(now), [now])
  const selected = files[0] ?? null
  const contentWidth = Math.max(1, width - 1)
  const { patch, separatorLines, highlighted } = useMemo(() => {
    const prepared = prepareLiveDiffPatch(TUTORIAL_PATCH)
    const baseline = prepareLiveDiffPatch(TUTORIAL_BASELINE_PATCH).patch
    return {
      patch: prepared.patch,
      separatorLines: new Set(prepared.separatorLines),
      highlighted: new Set(
        recentDiffLines(baseline, prepared.patch)
          .filter((line) => line.kind === "added")
          .map((line) => line.line),
      ),
    }
  }, [])
  const lineColors = useMemo(
    () => decoratedLineColors(patch, highlighted, separatorLines, { ...COLORS }),
    [highlighted, patch, separatorLines],
  )
  const previewWidth = codeFocused ? contentWidth + 30 : contentWidth
  const shortcutColor = terminalShortcutColor(true, true)
  return (
    <box
      id={id}
      style={{
        width,
        flexShrink: 0,
        minHeight: 1,
        border: ["left"],
        borderColor: BRAND_COLOR,
        backgroundColor: COLORS.canvas,
      }}
    >
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text wrapMode="none">
          <span fg={COLORS.terminal}>{translateUi("Live Diff")}</span>
          <span fg={COLORS.muted}>{` · ${translateUi("Show auto")}: `}</span>
          <span fg={COLORS.success}>true</span>
        </text>
        <InlineButton compact label="×" onPress={noop} />
      </box>
      <box
        id="tutorial-terminal-live-diff-code"
        style={{ flexGrow: 1, minHeight: 1, width: "100%", position: "relative" }}
      >
        <box
          style={{
            position: "absolute",
            top: 0,
            left: codeFocused ? -30 : 0,
            width: previewWidth,
            height: "100%",
            overflow: "hidden",
            backgroundColor: COLORS.canvas,
            ...(codeFocused ? { zIndex: 40 } : {}),
          }}
        >
          <NativeDiff
            patch={patch}
            filetype={pathToFiletype(selected?.path ?? "") ?? "text"}
            height={
              codeFocused
                ? liveDiffWrappedHeight(patch, previewWidth)
                : liveDiffUnwrappedHeight(patch)
            }
            wrapMode={codeFocused ? "char" : "none"}
            lineColors={lineColors}
            hiddenLineNumbers={separatorLines}
          />
        </box>
      </box>
      <box id="tutorial-terminal-live-diff-files" style={{ flexShrink: 0 }}>
        <LiveDiffFileTable
          sessionId={sessionId}
          files={files}
          selected={selected}
          now={now}
          error=""
          active
          onSelect={noop}
          onFocus={noop}
          height={Math.max(4, Math.min(files.length + 1, Math.round(height * 0.3)))}
        />
      </box>
      <box id="tutorial-terminal-live-diff-info" style={{ flexShrink: 0 }}>
        <LiveDiffInfo
          sessionId={sessionId}
          width={contentWidth}
          files={files}
          roots={[TUTORIAL_PROJECT, TUTORIAL_ADMIN_PROJECT]}
          selectedProject={TUTORIAL_PROJECT}
          hiddenRoots={[TUTORIAL_ADMIN_PROJECT]}
          onSelectProject={noop}
          onAddProject={noop}
          lastProject={TUTORIAL_PROJECT}
          error=""
          showDiffAuto
          codeFocused={codeFocused}
          shortcutColor={shortcutColor}
        />
      </box>
    </box>
  )
}

/** Static copy of the remote setup guide; the real one checks the server over SSH. */
export function TutorialSetupGuide({ width }: { width: number }) {
  const instructions = remoteServerSetupInstructions("githubSsh", null)
  return (
    <box
      id="tutorial-terminal-remote-setup"
      style={{
        height: Math.min(12, instructions.length + 6),
        flexShrink: 0,
        border: ["top"],
        borderColor: BRAND_COLOR,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: COLORS.canvas,
      }}
    >
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={translateUi("◆ PREPARAR SERVIDOR")} style={{ fg: COLORS.terminal }} />
        <text
          content={` · ${TUTORIAL_PROFILE.name} · ${translateUi("ETAPA")} 1/2`}
          style={{ fg: COLORS.muted }}
        />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <text content={`◆ ${translateUi("GitHub via SSH")}  `} style={{ fg: COLORS.terminal }} />
        <text content={`○ ${translateUi("Codex CLI")}`} style={{ fg: COLORS.muted }} />
      </box>
      <text
        content={truncateDisplay(
          `${translateUi("Configure manualmente no terminal acima")}: ${translateUi("GitHub via SSH")}`,
          Math.max(1, width - 2),
        )}
        style={{ height: 1, flexShrink: 0, fg: COLORS.text }}
      />
      <box style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
        {instructions.map((line) => (
          <text
            key={line}
            content={translateUi(line)}
            wrapMode="none"
            style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
          />
        ))}
      </box>
      <text
        content={translateUi("O GitHub ainda não aceitou a chave SSH deste servidor.")}
        style={{ height: 1, flexShrink: 0, fg: COLORS.warning }}
      />
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton label="[Esc] Terminal" accent={COLORS.terminal} onPress={noop} />
        <InlineButton
          label="[Enter] Confirmar configuração"
          accent={COLORS.terminal}
          onPress={noop}
        />
      </box>
    </box>
  )
}
