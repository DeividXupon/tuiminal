import { COLORS } from "../../../core/settings/theme"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { ShortcutText } from "../../../shared/ui/ShortcutText"

export function HttpWorkspaceFooter({
  minimum,
  maximized,
  onResize,
  onMaximize,
  onJump,
  onHelp,
  onSave,
  notice,
}: {
  minimum: boolean
  maximized: boolean
  onResize: (direction: -1 | 1) => void
  onMaximize: () => void
  onJump: () => void
  onHelp: () => void
  onSave: () => void
  notice: string
}) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      <ShortcutText
        content={
          notice ||
          (minimum
            ? "[/] URL · [S] enviar"
            : "[/] URL · [M] método · [S] enviar · [C] coleção · [Y] histórico · [Ctrl+N/W] tabs")
        }
        style={{ flexGrow: 1, fg: COLORS.muted }}
      />
      {minimum ? null : (
        <>
          <InlineButton label="[Ctrl+↓]" accent={COLORS.http} onPress={() => onResize(-1)} />
          <InlineButton label="[Ctrl+↑]" accent={COLORS.http} onPress={() => onResize(1)} />
          <InlineButton
            label={maximized ? "[F10] Restaurar" : "[F10] Maximizar"}
            accent={COLORS.http}
            active={maximized}
            onPress={onMaximize}
          />
        </>
      )}
      <InlineButton
        id="http-jump-button"
        label="[Ctrl+O] Ir"
        accent={COLORS.http}
        onPress={onJump}
      />
      <InlineButton
        id="http-save-button"
        label="[Ctrl+S] Salvar"
        accent={COLORS.http}
        onPress={onSave}
      />
      <InlineButton
        id="http-help-button"
        label="[F1] Ajuda"
        accent={COLORS.http}
        onPress={onHelp}
      />
    </box>
  )
}
