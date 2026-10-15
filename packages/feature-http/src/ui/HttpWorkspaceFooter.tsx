import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"

function httpSaveLabel(compact: boolean, postmanRequest: boolean) {
  if (compact) return "[Ctrl+S]"
  return postmanRequest ? "[Ctrl+S] Salvar no Postman" : "[Ctrl+S] Salvar"
}

export function HttpWorkspaceFooter({
  availableWidth,
  minimum,
  narrow,
  readOnly,
  maximized,
  onResize,
  onMaximize,
  onJump,
  onHelp,
  onSave,
  onPushPostman,
  postmanRequest,
  notice,
  responseJsonTree,
}: {
  availableWidth: number
  minimum: boolean
  narrow: boolean
  readOnly: boolean
  maximized: boolean
  onResize: (direction: -1 | 1) => void
  onMaximize: () => void
  onJump: () => void
  onHelp: () => void
  onSave: () => void
  onPushPostman: () => void
  postmanRequest: boolean
  notice: string
  responseJsonTree: boolean
}) {
  const compactControls = narrow || availableWidth < 150
  const maximizeLabel = compactControls
    ? "[F10]"
    : maximized
      ? "[F10] Restaurar"
      : "[F10] Maximizar"
  const jumpLabel = compactControls ? "[Ctrl+O]" : "[Ctrl+O] Ir"
  const saveLabel = httpSaveLabel(compactControls, postmanRequest)
  const postmanLabel = compactControls ? "[Ctrl+P]" : "[Ctrl+P] Postman"
  const helpLabel = compactControls ? "[F1]" : "[F1] Ajuda"
  const controlLabels = [
    ...(minimum ? [] : ["[Ctrl+↓]", "[Ctrl+↑]", maximizeLabel]),
    jumpLabel,
    saveLabel,
    ...(postmanRequest ? [postmanLabel] : []),
    helpLabel,
  ]
  const controlsWidth = controlLabels.reduce(
    (total, label) => total + displayWidth(translateUi(label)) + 2,
    0,
  )
  const copy =
    notice ||
    (responseJsonTree
      ? "[↑/↓] blocos JSON · [←/→/Enter] recolher/expandir · [Tab/H/L] painéis"
      : readOnly
        ? "SOMENTE LEITURA · RECURSO .HTTP NÃO SUPORTADO"
        : minimum
          ? "[Tab/H/L] painéis · [/] URL · [S] enviar"
          : "[Tab/H/L] painéis · [/] URL · [M] método · [S] enviar · [C] coleção · [Y] histórico")
  const copyWidth = Math.max(1, availableWidth - controlsWidth)

  return (
    <box
      id="http-workspace-footer"
      style={{ height: 1, flexShrink: 0, flexDirection: "row", overflow: "hidden" }}
    >
      <ShortcutText
        id="http-workspace-footer-copy"
        content={truncateDisplay(translateUi(copy), copyWidth)}
        style={{ width: copyWidth, flexShrink: 0, overflow: "hidden", fg: COLORS.muted }}
      />
      {minimum ? null : (
        <>
          <InlineButton
            id="http-split-decrease"
            label="[Ctrl+↓]"
            accent={COLORS.http}
            onPress={() => onResize(-1)}
          />
          <InlineButton
            id="http-split-increase"
            label="[Ctrl+↑]"
            accent={COLORS.http}
            onPress={() => onResize(1)}
          />
          <InlineButton
            id="http-maximize-button"
            label={maximizeLabel}
            accent={COLORS.http}
            active={maximized}
            onPress={onMaximize}
          />
        </>
      )}
      <InlineButton
        id="http-jump-button"
        label={jumpLabel}
        accent={COLORS.http}
        disabled={readOnly}
        onPress={onJump}
      />
      <InlineButton
        id="http-save-button"
        label={saveLabel}
        accent={COLORS.http}
        disabled={readOnly}
        onPress={onSave}
      />
      {postmanRequest ? (
        <InlineButton
          id="http-postman-push-button"
          label={postmanLabel}
          accent={COLORS.http}
          disabled={readOnly}
          onPress={onPushPostman}
        />
      ) : null}
      <InlineButton id="http-help-button" label={helpLabel} accent={COLORS.http} onPress={onHelp} />
    </box>
  )
}
