import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { GitRemoteTutorialStep } from "./remote-steps"

const noop = () => {}
const TABS = ["VISÃO GERAL", "CHECKS", "ATIVIDADE", "COMMITS", "ARQUIVOS"] as const

function TutorialConversation() {
  return (
    <>
      <text content="▶ @alex · 10:20 · 👍 2" style={{ flexShrink: 0, fg: COLORS.git }} />
      <text
        content="Could you add a regression test for this case?"
        style={{ flexShrink: 0, fg: COLORS.text }}
      />
      <box style={{ flexDirection: "row", flexWrap: "wrap", flexShrink: 0 }}>
        <InlineButton label="[E] Nova reação" accent={COLORS.git} onPress={noop} />
        <InlineButton label="[Enter] Responder" accent={COLORS.git} onPress={noop} />
      </box>
      <text content="  ↳ @demo · 10:25" style={{ flexShrink: 0, fg: COLORS.muted }} />
      <text
        content="    Added coverage for keyboard navigation."
        style={{ flexShrink: 0, fg: COLORS.text }}
      />
    </>
  )
}

function TutorialRemoteContent({ step }: { step: GitRemoteTutorialStep }) {
  if (step.view === "activity") return <TutorialConversation />
  if (step.view === "checks")
    return (
      <>
        <text
          content={`✓ tests · GitHub Actions · ${translateUi("success")}`}
          style={{ flexShrink: 0, fg: COLORS.success }}
        />
        <text
          content={`× lint · GitHub Actions · ${translateUi("failure")}`}
          style={{ flexShrink: 0, fg: COLORS.danger }}
        />
        <text
          content={`◷ build · GitHub Actions · ${translateUi("pending")}`}
          style={{ flexShrink: 0, fg: COLORS.warning }}
        />
      </>
    )
  if (step.view === "commits")
    return (
      <>
        <text
          content="▶ ac0d327c51  Fix cache invalidation"
          style={{ flexShrink: 0, fg: COLORS.git }}
        />
        <text content="  @alex · 2026-09-01" style={{ flexShrink: 0, fg: COLORS.muted }} />
        <text
          content="  91c2f061e4  Add regression tests"
          style={{ flexShrink: 0, fg: COLORS.text }}
        />
        <InlineButton label="[Y] copiar SHA · [D] abrir diff" accent={COLORS.git} onPress={noop} />
      </>
    )
  if (step.view === "files")
    return (
      <>
        <text content="src/cache.ts  +3/−1" style={{ flexShrink: 0, fg: COLORS.git }} />
        <text
          content="@@ -18,2 +18,4 @@ invalidate(key)"
          style={{ flexShrink: 0, fg: COLORS.git, bg: COLORS.diffHunkBg }}
        />
        <text
          content="18     − cache.clear()"
          style={{ flexShrink: 0, fg: COLORS.danger, bg: COLORS.diffRemovedBg }}
        />
        <text
          content="   18  + cache.delete(key)"
          style={{ flexShrink: 0, fg: COLORS.success, bg: COLORS.diffAddedBg }}
        />
        <text
          content="   19  + notify(key)"
          style={{ flexShrink: 0, fg: COLORS.success, bg: COLORS.diffAddedBg }}
        />
        <InlineButton label="[V] Unificado" accent={COLORS.git} onPress={noop} />
        <InlineButton label="[Esc] Voltar" accent={COLORS.git} onPress={noop} />
      </>
    )
  return (
    <>
      <text content={translateUi("DESCRIÇÃO")} style={{ flexShrink: 0, fg: COLORS.git }} />
      <text
        content={
          step.tab === "issues"
            ? "Keep keyboard focus visible when switching panes."
            : "Invalidate only the changed cache entry and cover the behavior with tests."
        }
        style={{ flexShrink: 0, fg: COLORS.text }}
      />
      <text
        content={
          step.tab === "issues"
            ? "@demo · → @demo · bug · accessibility"
            : "main ← fix/cache · +32/−11 · @alex"
        }
        style={{ flexShrink: 0, fg: COLORS.muted }}
      />
      {step.tab === "pr" && (
        <text
          content={`${translateUi("REVISÕES SOLICITADAS")}: @demo`}
          style={{ flexShrink: 0, fg: COLORS.muted }}
        />
      )}
      <InlineButton label="[E] Expandir descrição" accent={COLORS.git} onPress={noop} />
    </>
  )
}

export function GitTutorialRemotePreview({
  step,
  targeted,
}: {
  step: GitRemoteTutorialStep
  targeted: boolean
}) {
  const active =
    (
      { checks: "CHECKS", activity: "ATIVIDADE", commits: "COMMITS", files: "ARQUIVOS" } as Record<
        string,
        string
      >
    )[step.view] ?? "VISÃO GERAL"
  const tabs = step.tab === "pr" ? TABS : ["VISÃO GERAL", "ATIVIDADE"]
  return (
    <box
      id={targeted ? step.targetId : "git-tutorial-remote-preview"}
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        paddingX: 1,
        ...focusedPanelBorder(targeted, COLORS.git),
      }}
    >
      <text
        content={`demo/tuiminal #${step.tab === "issues" ? "318 · Keyboard focus" : "142 · Fix cache invalidation"}`}
        style={{ flexShrink: 0, height: 1, truncate: true, fg: COLORS.git }}
      />
      <box style={{ flexShrink: 0, flexDirection: "row", flexWrap: "wrap" }}>
        <InlineButton label="[O] Abrir" accent={COLORS.git} onPress={noop} />
        {step.tab === "inbox" && (
          <>
            <InlineButton label="[Shift+M] Marcar lida" accent={COLORS.git} onPress={noop} />
            <InlineButton label="[B] Salvar" accent={COLORS.git} onPress={noop} />
            <InlineButton label="[D] Concluir" accent={COLORS.git} onPress={noop} />
            <InlineButton label="[U] Parar de acompanhar" accent={COLORS.git} onPress={noop} />
          </>
        )}
      </box>
      <box style={{ flexShrink: 0, flexDirection: "row", flexWrap: "wrap" }}>
        <InlineButton label="[Z←]" accent={COLORS.git} onPress={noop} />
        {tabs.map((tab) => (
          <InlineButton
            key={tab}
            label={translateUi(tab)}
            active={tab === active}
            accent={COLORS.git}
            onPress={noop}
          />
        ))}
        <InlineButton label="[V→]" accent={COLORS.git} onPress={noop} />
      </box>
      <box style={{ flexGrow: 1, minHeight: 0, overflow: "hidden" }}>
        <TutorialRemoteContent step={step} />
      </box>
    </box>
  )
}
