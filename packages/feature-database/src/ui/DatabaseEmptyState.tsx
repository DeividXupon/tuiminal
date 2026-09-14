import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export function DatabaseEmptyState({
  compact,
  terminalWidth,
  onOpenConnections,
}: {
  compact: boolean
  terminalWidth: number
  onOpenConnections: () => void
}) {
  return (
    <box
      id="tutorial-db-empty"
      style={{
        width: Math.max(1, Math.min(70, terminalWidth - 4)),
        ...panelBorder(COLORS.database),
        backgroundColor: COLORS.panel,
        padding: compact ? 1 : 2,
      }}
    >
      <text content="◆ BANCO DE DADOS" style={{ fg: COLORS.database }} />
      <text
        content="Nenhuma conexão configurada"
        style={{ fg: COLORS.text, marginTop: compact ? 0 : 1 }}
      />
      <text
        content={
          compact
            ? "Adicione um banco para explorar tabelas e registros."
            : "Adicione um banco para explorar schemas, tabelas, colunas, índices e registros."
        }
        style={{ fg: COLORS.muted }}
      />
      <box
        style={{
          marginTop: compact ? 0 : 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text content="MySQL  ·  PostgreSQL  ·  SQLite  ·  MCP" style={{ fg: COLORS.database }} />
        {compact ? null : <text content="◇ leitura somente" style={{ fg: COLORS.success }} />}
      </box>
      <box style={{ marginTop: compact ? 0 : 1, flexDirection: "row" }}>
        <InlineButton
          id="tutorial-db-empty-add"
          label="[C] Criar nova / conexões"
          accent={COLORS.database}
          onPress={onOpenConnections}
        />
      </box>
      {compact ? null : (
        <text
          content="As senhas podem ser guardadas no gerenciador seguro do sistema."
          style={{ fg: COLORS.muted, marginTop: 1 }}
        />
      )}
    </box>
  )
}
