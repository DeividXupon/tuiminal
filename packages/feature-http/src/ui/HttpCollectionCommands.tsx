import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { HttpSourceMode } from "../model/source-mode"
import { isPostmanPath } from "../postman/mutations"

export function HttpCollectionCommands({
  sourceMode,
  selected,
  contentWidth,
  onImport,
  onRun,
  onPostman,
  onStart,
}: {
  sourceMode: HttpSourceMode
  selected: HttpCollectionTreeRow | null
  contentWidth: number
  onImport: () => void
  onRun: () => void
  onPostman: () => void
  onStart: (action: HttpCollectionAction, row: HttpCollectionTreeRow | null) => void
}) {
  const compact = contentWidth < 48
  const folderTarget =
    selected?.kind === "directory" ||
    selected?.kind === "folder" ||
    (selected?.kind === "file" && isPostmanPath(selected.path))
      ? selected
      : null
  return (
    <>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        {sourceMode === "local" ? (
          <InlineButton
            id="http-collection-import-button"
            label={compact ? "[I]" : "[I] Importar"}
            accent={COLORS.http}
            onPress={onImport}
          />
        ) : null}
        <InlineButton
          id="http-collection-runner-button"
          label={compact ? "[R]" : "[R] Rodar"}
          accent={COLORS.http}
          onPress={onRun}
        />
        {sourceMode === "postman" ? (
          <InlineButton
            id="http-postman-open"
            label={compact ? "[O]" : "[O] Postman"}
            accent={COLORS.http}
            onPress={onPostman}
          />
        ) : null}
      </box>
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-create"
          label={compact ? "[Shift+N]" : "[Shift+N] Nova coleção"}
          accent={COLORS.http}
          onPress={() =>
            onStart("create-collection", selected?.kind === "directory" ? selected : null)
          }
        />
        <InlineButton
          id="http-folder-create"
          label={compact ? "[P]" : "[P] Nova pasta"}
          accent={COLORS.http}
          disabled={
            sourceMode === "postman" && selected?.kind !== "file" && selected?.kind !== "folder"
          }
          onPress={() => onStart("create-folder", folderTarget)}
        />
      </box>
      <InlineButton
        id="http-request-create"
        label={compact ? "[N]" : "[N] Nova request"}
        accent={COLORS.http}
        disabled={
          sourceMode === "postman" && !["file", "folder", "request"].includes(selected?.kind ?? "")
        }
        onPress={() => onStart("create-request", selected)}
      />
      {selected ? (
        <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
          <InlineButton
            id="http-collection-rename"
            label="[E] Renomear"
            accent={COLORS.http}
            onPress={() => onStart("rename", selected)}
          />
          <InlineButton
            id="http-collection-delete"
            label="[D] Excluir"
            accent={COLORS.danger}
            onPress={() => onStart("delete", selected)}
          />
        </box>
      ) : null}
      <text
        content={truncateDisplay(
          translateUi("[↑/↓] [J/K] Navegar  [←/→] Recolher/abrir  [Enter] Abrir"),
          contentWidth,
        )}
        style={{ fg: COLORS.muted }}
      />
    </>
  )
}
