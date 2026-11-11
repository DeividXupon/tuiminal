import type { TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { COMPACT_ACTIONS_BREAKPOINT, SQL_SYNTAX_STYLE } from "../rendering/constants"
import { queryAccessHeader, queryResultSummary } from "../rendering/query-presentation"
import { applySqlSyntaxHighlights } from "../rendering/sql-highlight"
import { DatabaseQueryTabs } from "../ui/DatabaseQueryTabs"
import { noop } from "./fixtures"
import { sqlSplitEditorHeight } from "../model/sql-workspace"

const SQL = "SELECT *\nFROM users\nORDER BY id\nLIMIT 100;"
function editorRef(editor: TextareaRenderable | null) {
  if (editor) applySqlSyntaxHighlights(editor, SQL_SYNTAX_STYLE, "sqlite")
}

export function DatabaseTutorialQuery({ width }: { width: number }) {
  const terminal = useTerminalDimensions()
  const compact = width < COMPACT_ACTIONS_BREAKPOINT
  return (
    <box style={{ flexGrow: 1 }}>
      <DatabaseQueryTabs
        tabs={[{ id: "demo", title: "Query users" }]}
        activeTabId="demo"
        availableWidth={width}
        onSelectTab={noop}
        onSwitchTab={noop}
        onNewTab={noop}
        onCloseTab={noop}
      />
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <text
          content={compact ? "◆ SQL" : `${translateUi("◆ EDITOR SQL")} · SQLite`}
          style={{ fg: COLORS.database }}
        />
        <text content={queryAccessHeader(compact, true)} style={{ fg: COLORS.warning }} />
      </box>
      <box
        id="tutorial-db-query-editor"
        style={{
          height: sqlSplitEditorHeight(terminal.height, 40),
          flexShrink: 0,
          overflow: "hidden",
          border: ["bottom"],
          borderColor: COLORS.border,
          backgroundColor: COLORS.canvas,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <line-number
          fg={COLORS.muted}
          bg={COLORS.panel}
          minWidth={3}
          paddingRight={1}
          showLineNumbers
          width="100%"
          height="100%"
        >
          <textarea
            ref={editorRef}
            initialValue={SQL}
            syntaxStyle={SQL_SYNTAX_STYLE}
            width="100%"
            height="100%"
            style={{ backgroundColor: COLORS.canvas, textColor: COLORS.text, wrapMode: "none" }}
          />
        </line-number>
      </box>
      <box style={{ height: 2, flexShrink: 0 }}>
        <box style={{ height: 1, flexDirection: "row" }}>
          {(
            [
              "[?]",
              "[M]",
              compact ? "[Ctrl+A]" : "[Ctrl+A] Executar",
              compact ? "[L]" : "[L] Limpar",
              compact ? "[Ctrl+S]+" : "[Ctrl+S] Salvar favorita",
            ] as const
          ).map((label) => (
            <InlineButton
              key={label}
              label={label}
              accent={label.includes("Ctrl+A") ? COLORS.success : COLORS.database}
              onPress={noop}
            />
          ))}
          {!compact && (
            <>
              <InlineButton label="[Ctrl+F] Favoritas 0" accent={COLORS.database} onPress={noop} />
              <InlineButton label="[V] Mascarar" accent={COLORS.database} onPress={noop} />
              <InlineButton label="[Esc] Voltar" accent={COLORS.muted} onPress={noop} />
            </>
          )}
        </box>
        <box style={{ height: 1, flexDirection: "row" }}>
          {compact && (
            <>
              <InlineButton label="[Ctrl+F]0" accent={COLORS.database} onPress={noop} />
              <InlineButton label="[V]◆" accent={COLORS.database} onPress={noop} />
              <InlineButton label="[Esc]" accent={COLORS.muted} onPress={noop} />
            </>
          )}
          <InlineButton
            label={compact ? "[Ctrl+↑]" : "[Ctrl+↑] Editor +"}
            accent={COLORS.database}
            onPress={noop}
          />
          <InlineButton
            label={compact ? "[Ctrl+↓]" : "[Ctrl+↓] Editor −"}
            accent={COLORS.database}
            onPress={noop}
          />
          <InlineButton
            label={compact ? "[F10] □" : "[F10] Maximizar foco"}
            accent={COLORS.database}
            onPress={noop}
          />
        </box>
      </box>
      <text
        content={translateUi(queryResultSummary(null, compact, false))}
        style={{ height: 1, flexShrink: 0, fg: COLORS.muted }}
      />
      <box style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
        <ShortcutText
          content={compact ? "[Ctrl+A] Executar SQL" : "Escreva SQL acima e execute com [Ctrl+A]"}
          style={{ fg: COLORS.muted }}
        />
      </box>
    </box>
  )
}
