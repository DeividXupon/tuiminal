import { COLORS, LAYOUT, panelBorder } from "../../../core/settings/theme"
import { translateUi } from "../../../shared/i18n"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../shared/ui/ShortcutText"

const DEMO_ROWS = [
  ["▶ ◆ equipe/api #142", "Cache consistente", "REV ✓  CI ◷  +84/-17"],
  ["  ◇ equipe/web #55", "Nova tela de login", "REV ?  CI ×  +31/-9"],
  ["  ○ equipe/cli #21", "Corrige Unicode", "REV ✓  CI ✓  +8/-3"],
] as const

export function GitTutorialDemo() {
  const noop = () => {}

  return (
    <box style={{ flexGrow: 1, backgroundColor: COLORS.canvas, gap: LAYOUT.gap }}>
      <box
        id="tutorial-git-mode-tabs"
        style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: COLORS.panel }}
      >
        <InlineButton label="[1] GIT · BASE LOCAL" accent={COLORS.git} onPress={noop} />
        <InlineButton label="[2] PR" accent={COLORS.git} active onPress={noop} />
      </box>
      <box
        id="tutorial-git-sections"
        style={{ ...panelBorder(), height: 3, flexShrink: 0, backgroundColor: COLORS.panel }}
      >
        <box style={{ height: 1, flexDirection: "row" }}>
          <InlineButton label="[1] Meus PRs 3" accent={COLORS.git} active onPress={noop} />
          <InlineButton label="[2] Revisar 1" accent={COLORS.git} onPress={noop} />
          <InlineButton label="[3] CI falhando 1" accent={COLORS.git} onPress={noop} />
          <InlineButton label="[+]" accent={COLORS.git} onPress={noop} />
        </box>
        <ShortcutText
          content="[/] is:open author:@me  ·  3 REPOSITÓRIOS · 3/3 PRs · DEMO"
          style={{ fg: COLORS.muted }}
        />
      </box>
      <box style={{ flexGrow: 1, flexDirection: "row", gap: LAYOUT.gap }}>
        <box
          id="tutorial-git-pr-list"
          style={{ ...panelBorder(COLORS.git), width: "52%", backgroundColor: COLORS.panel }}
        >
          <text content={translateUi("PR / TÍTULO")} style={{ fg: COLORS.git }} />
          {DEMO_ROWS.map(([identity, title, status]) => (
            <box key={identity} style={{ height: 2, flexShrink: 0 }}>
              <text content={`${identity} · ${title}`} style={{ fg: COLORS.text }} />
              <text content={`  ${status}`} style={{ fg: COLORS.muted }} />
            </box>
          ))}
        </box>
        <box style={{ ...panelBorder(), flexGrow: 1, backgroundColor: COLORS.panel }}>
          <box id="tutorial-git-preview-tabs" style={{ height: 4, flexShrink: 0 }}>
            <text content="equipe/api #142 · Cache consistente" style={{ fg: COLORS.git }} />
            <text content="ABERTO · main ← feat/cache · 9ab13cd90e" style={{ fg: COLORS.muted }} />
            <box style={{ flexDirection: "row" }}>
              <InlineButton label="VISÃO GERAL" accent={COLORS.git} active onPress={noop} />
              <InlineButton label="CHECKS" accent={COLORS.git} onPress={noop} />
              <InlineButton label="ATIVIDADE" accent={COLORS.git} onPress={noop} />
            </box>
          </box>
          <box id="tutorial-git-actions" style={{ height: 2, flexShrink: 0 }}>
            <box style={{ flexDirection: "row" }}>
              <InlineButton label="[O] Abrir" accent={COLORS.git} onPress={noop} />
              <InlineButton label="[D] Diff" accent={COLORS.git} onPress={noop} />
              <InlineButton label="[?] Ações" accent={COLORS.git} onPress={noop} />
              <InlineButton label="[W] CI" accent={COLORS.git} onPress={noop} />
            </box>
          </box>
          <box id="tutorial-git-diff" style={{ flexGrow: 1, backgroundColor: COLORS.panelRaised }}>
            <text content="@@ -18,2 +18,3 @@ cacheKey" style={{ fg: COLORS.git }} />
            <text content="- return id" style={{ fg: COLORS.danger }} />
            <text content="+ return id.trim()" style={{ fg: COLORS.success }} />
            <text
              content="✓ unit · ◷ integration · deployment protegido"
              style={{ fg: COLORS.muted }}
            />
          </box>
        </box>
      </box>
      <ShortcutText
        content="[J/K] Navegar  [H/L] Foco  [</>] Seção  [[/]] Aba  [P] Layout  [D] Diff  [?] Ações"
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
    </box>
  )
}
