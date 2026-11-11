import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ModalSurface } from "@xupon/tuiminal-core/ui/ModalSurface"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import { useRef } from "react"
import { DatabaseConnectionList } from "../ui/DatabaseConnectionList"
import { noop, type TutorialState } from "./fixtures"

function Connections() {
  const ref = useRef<ScrollBoxRenderable | null>(null)
  return (
    <>
      <box
        style={{
          height: 2,
          flexShrink: 0,
          flexDirection: "row",
          justifyContent: "space-between",
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <text content={`◆ ${translateUi("CONEXÕES DE BANCO")}`} style={{ fg: COLORS.database }} />
        <InlineButton label="[Esc] Fechar" accent={COLORS.database} onPress={noop} />
      </box>
      <DatabaseConnectionList
        items={[
          {
            id: "tutorial",
            name: "Loja Demo",
            driver: "sqlite",
            source: "saved",
            filename: "./tutorial_store.sqlite",
            ssl: false,
            writeEnabled: true,
          },
        ]}
        selectedIndex={0}
        deleteConfirmationId={null}
        busy={false}
        notice=""
        discoveringExternal={false}
        listRef={ref}
        onCreate={noop}
        onRefresh={noop}
        onActivate={noop}
        onEdit={noop}
        onDelete={noop}
      />
    </>
  )
}

function ExportSelection() {
  return (
    <>
      <box style={{ height: 3, flexShrink: 0, border: ["bottom"], borderColor: COLORS.border }}>
        <box style={{ height: 1, flexDirection: "row", justifyContent: "space-between" }}>
          <text content={translateUi("◆ EXPORTAR SELEÇÃO")} style={{ fg: COLORS.database }} />
          <text content={translateUi("2 linha(s)")} style={{ fg: COLORS.muted }} />
        </box>
        <text content="main.users" style={{ fg: COLORS.muted }} />
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {["CSV", "TSV", "JSON"].map((format, index) => (
          <InlineButton
            key={format}
            label={`[${index + 1}] ${format}`}
            accent={COLORS.database}
            active={index === 0}
            onPress={noop}
          />
        ))}
      </box>
      <box style={{ flexGrow: 1, backgroundColor: COLORS.panel, paddingLeft: 1 }}>
        {[
          "id,name,email,role,active,password,created_at",
          "101,Ana Lima,ana@example.test,admin,1,demo-only,2026-08-21 14:32:08",
          "102,Bruno Reis,bruno@example.test,viewer,1,demo-only,2026-08-21 14:32:08",
        ].map((line, index) => (
          <text
            key={line}
            content={line}
            wrapMode="none"
            style={{ height: 1, flexShrink: 0, fg: index ? COLORS.muted : COLORS.database }}
          />
        ))}
      </box>
      <box style={{ height: 3, flexShrink: 0, border: ["top"], borderColor: COLORS.border }}>
        <text
          content={translateUi(
            "Exporte somente as linhas marcadas e as colunas do resultado atual.",
          )}
          style={{ height: 1, fg: COLORS.muted }}
        />
        <box style={{ height: 1, flexDirection: "row", justifyContent: "space-between" }}>
          <InlineButton label="[Esc] Fechar" accent={COLORS.muted} onPress={noop} />
          <InlineButton label="[C/Enter] Copiar" accent={COLORS.database} onPress={noop} />
          <InlineButton label="[S] Salvar arquivo" accent={COLORS.success} onPress={noop} />
        </box>
      </box>
    </>
  )
}

const CHANGES = [
  {
    kind: "UPDATE",
    description: "role",
    sql: 'UPDATE "users" SET "role" = ? WHERE "id" = ?;',
    parameters: '$1="editor"  $2=102',
    color: "warning",
  },
  {
    kind: "DELETE",
    description: "id",
    sql: 'DELETE FROM "users" WHERE "id" = ?;',
    parameters: "$1=104",
    color: "danger",
  },
  {
    kind: "INSERT",
    description: "id, name, email",
    sql: 'INSERT INTO "users" ("id", "name", "email") VALUES (?, ?, ?);',
    parameters: '$1=107  $2="Gabi Dias"  $3="gabi@example.test"',
    color: "runner",
  },
] as const

function Review({ width }: { width: number }) {
  const compact = width < 88
  return (
    <>
      <box
        style={{
          height: compact ? 2 : 3,
          flexShrink: 0,
          border: ["bottom"],
          borderColor: COLORS.border,
        }}
      >
        <box style={{ height: 1, flexDirection: "row", justifyContent: "space-between" }}>
          <text content={translateUi("◆ REVISAR ALTERAÇÕES SQL")} style={{ fg: COLORS.warning }} />
          <text content={translateUi("0/3 aprovadas")} style={{ fg: COLORS.muted }} />
        </box>
        {!compact && (
          <text
            content={translateUi("Nenhum comando foi executado. Selecione o que deseja aplicar.")}
            style={{ fg: COLORS.muted }}
          />
        )}
      </box>
      <scrollbox scrollY viewportCulling style={{ flexGrow: 1 }}>
        {CHANGES.map((change, index) => (
          <box
            key={change.kind}
            style={{
              height: 5,
              flexShrink: 0,
              paddingLeft: 1,
              backgroundColor:
                index === 0 ? COLORS.panelRaised : index % 2 ? COLORS.panelAlt : COLORS.panel,
            }}
          >
            <box style={{ height: 1, flexDirection: "row" }}>
              <text
                content={`◇ ${change.kind}`}
                style={{ width: compact ? 10 : 13, fg: COLORS.muted }}
              />
              <text content="main.users" style={{ fg: COLORS.text }} />
            </box>
            <text
              content={`${translateUi("Alteração")}: ${change.description}`}
              style={{ fg: COLORS.muted }}
            />
            <text
              content={truncateDisplay(change.sql, width - 8)}
              style={{ fg: COLORS[change.color] }}
            />
            <text
              content={truncateDisplay(change.parameters, width - 8)}
              style={{ fg: COLORS.muted }}
            />
            <text content={translateUi("não aprovado")} style={{ fg: COLORS.border }} />
          </box>
        ))}
      </scrollbox>
      <box style={{ height: 3, flexShrink: 0, border: ["top"], borderColor: COLORS.border }}>
        <ShortcutText
          content={
            compact
              ? "[↑↓] navegar · [Enter] aprovar · [Ctrl+S] executar"
              : "[↑↓] navegar · [Enter/Space] aprovar · [A] todos · [Ctrl+S] executar"
          }
          style={{ height: 1, fg: COLORS.muted }}
        />
        <box style={{ height: 1, flexDirection: "row", justifyContent: "flex-end" }}>
          <InlineButton
            label={compact ? "[A] Todos" : "[A] Aprovar todos"}
            accent={COLORS.database}
            onPress={noop}
          />
          <InlineButton
            label={compact ? "[Ctrl+S] 0" : "[Ctrl+S] Executar 0"}
            accent={COLORS.success}
            disabled
            onPress={noop}
          />
        </box>
      </box>
    </>
  )
}

// Only the presentation is mounted: live dialogs own keyboard, storage and connections.
const DIALOG_SIZES = {
  connections: [84, 8, 14, 4],
  review: [118, 2, 28, 0],
  export: [96, 2, 23, 2],
} as const

export function DatabaseTutorialDialogs({ state }: { state: TutorialState }) {
  const terminal = useTerminalDimensions()
  if (!state.dialog) return null
  const connections = state.dialog === "connections"
  const review = state.dialog === "review"
  const [maxWidth, horizontalInset, maxHeight, verticalInset] = DIALOG_SIZES[state.dialog]
  const width = Math.max(1, Math.min(maxWidth, terminal.width - horizontalInset))
  const height = Math.max(1, Math.min(maxHeight, terminal.height - verticalInset))
  return (
    <ModalSurface
      id={
        connections
          ? "tutorial-db-connections"
          : review
            ? "tutorial-db-review"
            : "tutorial-db-export"
      }
      width={width}
      height={height}
      zIndex={920}
      borderColor={review ? COLORS.warning : COLORS.database}
      horizontalPadding={connections && width >= 58 ? 2 : 1}
      backdropOpacity={connections ? 0.88 : 0.92}
      dialogFocusable={false}
      onBackdropPress={noop}
    >
      {connections ? <Connections /> : review ? <Review width={width} /> : <ExportSelection />}
    </ModalSurface>
  )
}
