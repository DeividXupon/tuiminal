import { Button } from "@tuiparts/react/button"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"

export function HttpEnvironmentChoice({
  name,
  production,
  current,
  selected,
  index,
  width,
  onSelect,
  onEdit,
  onDelete,
}: {
  name: string | null
  production: boolean
  current: boolean
  selected: boolean
  index: number
  width: number
  onSelect: (name: string | null) => void
  onEdit: (name: string) => void
  onDelete: (name: string) => void
}) {
  const edit = width < 60 ? "[E]" : "[E] Editar"
  const remove = width < 60 ? "[D]" : "[D] Excluir"
  const actionsWidth = name
    ? displayWidth(translateUi(edit)) + displayWidth(translateUi(remove)) + 4
    : 0
  const background = selected ? COLORS.diffModifiedBg : index % 2 ? COLORS.canvas : COLORS.panel
  const color = production ? COLORS.danger : selected ? COLORS.http : COLORS.text
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row", backgroundColor: background }}>
      <box style={{ flexGrow: 1, minWidth: 0, overflow: "hidden" }}>
        <Button
          id={`http-environment-choice-${name ?? "none"}`}
          height={1}
          width="100%"
          onPress={() => onSelect(name)}
        >
          <text
            content={truncateDisplay(
              ` ${current ? "◆" : "◇"} ${name ?? translateUi("Sem ambiente")}${production ? " · PROD" : ""}`,
              Math.max(1, width - actionsWidth - 1),
            )}
            wrapMode="none"
            style={{ height: 1, fg: color }}
          />
        </Button>
      </box>
      {name && (
        <>
          <InlineButton
            id={`http-environment-edit-${name}`}
            label={edit}
            accent={COLORS.http}
            onPress={() => onEdit(name)}
          />
          <InlineButton
            id={`http-environment-delete-${name}`}
            label={remove}
            accent={COLORS.danger}
            onPress={() => onDelete(name)}
          />
        </>
      )}
    </box>
  )
}
