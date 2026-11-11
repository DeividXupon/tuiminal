import { useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { GitRemoteTutorialStep } from "./remote-steps"

const noop = () => {}

export function isRemoteTutorialDialog(view: string) {
  return ["search", "create", "review", "actions", "done", "unsubscribe"].includes(view)
}

function DemoField({ label, value }: { label: string; value: string }) {
  return (
    <box style={{ flexShrink: 0 }}>
      <text content={translateUi(label)} style={{ flexShrink: 0, fg: COLORS.muted }} />
      <text
        content={value}
        style={{
          flexShrink: 0,
          height: 1,
          truncate: true,
          fg: COLORS.text,
          bg: COLORS.panelRaised,
        }}
      />
    </box>
  )
}

function DialogContent({ step }: { step: GitRemoteTutorialStep }) {
  if (step.view === "search")
    return (
      <>
        <DemoField label="Buscar" value="is:open review-requested:@me repo:demo/tuiminal" />
        <text content="▶ repo:demo/tuiminal" style={{ flexShrink: 0, fg: COLORS.git }} />
        <text content="  repo:demo/docs" style={{ flexShrink: 0, fg: COLORS.muted }} />
      </>
    )
  if (step.view === "create")
    return (
      <>
        <DemoField label="Repositório (owner/repository)" value="demo/tuiminal" />
        {step.tab === "pr" && (
          <>
            <DemoField label="Branch base (remota)" value="main" />
            <DemoField label="Branch comparada (remota, mesmo repositório)" value="fix/cache" />
          </>
        )}
        <DemoField
          label="Título"
          value={step.tab === "pr" ? "Fix cache invalidation" : "Keyboard focus"}
        />
        <DemoField label="Descrição (Markdown)" value="## Context and test coverage" />
        {step.tab === "pr" && (
          <InlineButton label="[D] Draft: sim" accent={COLORS.git} onPress={noop} />
        )}
      </>
    )
  if (step.view === "review")
    return (
      <>
        <text
          content={translateUi("Aprovar Pull Request")}
          style={{ flexShrink: 0, fg: COLORS.git }}
        />
        <text
          content="demo/tuiminal #142 · ac0d327c51"
          style={{ flexShrink: 0, fg: COLORS.text }}
        />
        <DemoField label="Comentário" value="Reviewed the cache fix and regression tests." />
        <text
          content={translateUi("Nada será executado até a confirmação abaixo.")}
          style={{ flexShrink: 0, fg: COLORS.warning }}
        />
      </>
    )
  if (step.view === "actions")
    return (
      <>
        <text
          content="demo/tuiminal #318 · Keyboard focus"
          style={{ flexShrink: 0, fg: COLORS.text }}
        />
        {[
          ["[A]", "Adicionar responsáveis"],
          ["[Shift+L]", "Editar labels"],
          ["[X]", "Fechar issue"],
          ["[Shift+X]", "Reabrir issue"],
        ].map(([shortcut, label]) => (
          <InlineButton
            key={shortcut}
            label={`${shortcut} ${translateUi(label ?? "")}`}
            accent={COLORS.git}
            disabled={shortcut === "[Shift+X]"}
            onPress={noop}
          />
        ))}
        <text
          content={translateUi("cannot-reopen-issue")}
          style={{ flexShrink: 0, fg: COLORS.muted }}
        />
      </>
    )
  return (
    <>
      <text
        content="demo/tuiminal #142 · Fix cache invalidation"
        style={{ flexShrink: 0, fg: COLORS.text }}
      />
      <text
        content={translateUi(
          step.view === "done"
            ? "A notificação será removida da caixa de entrada do GitHub."
            : "O GitHub deixará de enviar atualizações desta conversa.",
        )}
        style={{ flexShrink: 0, fg: COLORS.warning }}
      />
    </>
  )
}

export function GitTutorialRemoteDialog({ step }: { step: GitRemoteTutorialStep }) {
  const terminal = useTerminalDimensions()
  return (
    <>
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={600}
        backgroundColor="#030509"
        opacity={0.92}
      />
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        zIndex={601}
        alignItems="center"
        justifyContent="center"
      >
        <box
          id={step.targetId}
          style={{
            width: Math.min(76, terminal.width - 4),
            height: Math.min(step.view === "create" ? 17 : 11, terminal.height - 2),
            border: true,
            borderStyle: "rounded",
            borderColor: COLORS.git,
            backgroundColor: COLORS.canvas,
            paddingX: 1,
          }}
        >
          <text
            content={translateUi(step.title)}
            style={{ flexShrink: 0, fg: COLORS.git, height: 1, truncate: true }}
          />
          <text
            content="github.com · @demo"
            style={{ flexShrink: 0, fg: COLORS.muted, height: 1 }}
          />
          <box style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
            <DialogContent step={step} />
          </box>
          <box
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              height: 1,
              flexShrink: 0,
            }}
          >
            <InlineButton label="[Esc] Cancelar" accent={COLORS.git} onPress={noop} />
            <InlineButton
              label={
                step.view === "search" || step.view === "actions"
                  ? "[Enter] Selecionar"
                  : "[Ctrl+S] Confirmar"
              }
              accent={COLORS.git}
              onPress={noop}
            />
          </box>
        </box>
      </box>
    </>
  )
}
