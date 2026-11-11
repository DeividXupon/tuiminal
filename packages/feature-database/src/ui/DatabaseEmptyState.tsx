import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS, panelBorder } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export function DatabaseEmptyState({
  compact,
  terminalWidth,
  onOpenConnections,
  onOpenActions,
  discoveringExternal = false,
  hasExternalCandidates = false,
  hasExternalWarnings = false,
}: {
  compact: boolean
  terminalWidth: number
  onOpenActions?: (() => void) | undefined
  onOpenConnections: () => void
  discoveringExternal?: boolean
  hasExternalCandidates?: boolean
  hasExternalWarnings?: boolean
}) {
  const title = discoveringExternal
    ? "Lendo configurações de banco…"
    : hasExternalCandidates
      ? "Conexões externas encontradas"
      : hasExternalWarnings
        ? "Revise os avisos de descoberta em Conexões."
        : "Nenhuma conexão configurada"
  const description = discoveringExternal
    ? "MySQL · ~/.my.cnf · mysql_config_editor · PostgreSQL · ~/.pg_service.conf · ~/.pgpass"
    : hasExternalCandidates
      ? "Abra Conexões para completar os campos ausentes."
      : compact
        ? "Adicione um banco para explorar tabelas e registros."
        : "Adicione um banco para explorar schemas, tabelas, colunas, índices e registros."
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
      <text content={translateUi("◆ BANCO DE DADOS")} style={{ fg: COLORS.database }} />
      <text content={translateUi(title)} style={{ fg: COLORS.text, marginTop: compact ? 0 : 1 }} />
      <text content={translateUi(description)} style={{ fg: COLORS.muted }} />
      <box
        style={{
          marginTop: compact ? 0 : 1,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <text content="MySQL  ·  PostgreSQL  ·  SQLite  ·  MCP" style={{ fg: COLORS.database }} />
        {compact ? null : (
          <text content={translateUi("◇ leitura somente")} style={{ fg: COLORS.success }} />
        )}
      </box>
      <box style={{ marginTop: compact ? 0 : 1, flexDirection: "row" }}>
        {onOpenActions ? (
          <InlineButton
            id="database-action-palette-open"
            label="[?] Ações"
            accent={COLORS.database}
            onPress={onOpenActions}
          />
        ) : null}
        <InlineButton
          id="tutorial-db-empty-add"
          label="[C] Conexões"
          accent={COLORS.database}
          onPress={onOpenConnections}
        />
      </box>
      {compact ? null : (
        <text
          content={translateUi("As senhas podem ser guardadas no gerenciador seguro do sistema.")}
          style={{ fg: COLORS.muted, marginTop: 1 }}
        />
      )}
    </box>
  )
}
