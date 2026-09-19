import type { InputRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionTreeRow } from "../model/collection-tree"
import type { PostmanWorkspace } from "../postman/api"
import type { HttpSourceMode } from "../model/source-mode"

function heading(action: HttpCollectionAction) {
  if (action === "delete") return "EXCLUIR"
  if (action === "rename") return "RENOMEAR"
  return "CRIAR"
}

function targetName(row: HttpCollectionTreeRow | null) {
  if (!row) return translateUi("RAIZ")
  if (row.kind === "request") return row.item.request.name
  return row.kind === "folder" ? row.folderPath : row.path
}

function canApply(
  action: HttpCollectionAction,
  name: string,
  destination: "tuiminal" | "postman",
  activeWorkspace: PostmanWorkspace | null,
  workspaces: PostmanWorkspace[],
) {
  if (action !== "delete" && !name.trim()) return false
  return (
    action !== "create-collection" ||
    destination !== "postman" ||
    Boolean(activeWorkspace || workspaces.length)
  )
}

export function HttpCollectionActionForm({
  action,
  row,
  name,
  contentWidth,
  onNameChange,
  onApply,
  onCancel,
  destination,
  workspaces,
  activeWorkspace,
  workspaceIndex,
  onWorkspaceChange,
  workspaceError,
  sourceMode,
}: {
  action: HttpCollectionAction
  row: HttpCollectionTreeRow | null
  name: string
  contentWidth: number
  onNameChange: (name: string) => void
  onApply: (name?: string) => void
  onCancel: () => void
  destination: "tuiminal" | "postman"
  workspaces: PostmanWorkspace[]
  activeWorkspace: PostmanWorkspace | null
  workspaceIndex: number
  onWorkspaceChange: (index: number) => void
  workspaceError: string
  sourceMode: HttpSourceMode
}) {
  const inputRef = useRef<InputRenderable | null>(null)
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (
      action !== "create-collection" ||
      renderer.currentFocusedRenderable?.id !== "http-collection-name-input"
    )
      return
    if (
      destination === "postman" &&
      !activeWorkspace &&
      workspaces.length &&
      (key.name === "up" || key.name === "down")
    ) {
      key.preventDefault()
      key.stopPropagation()
      onWorkspaceChange(
        (workspaceIndex + (key.name === "down" ? 1 : -1) + workspaces.length) % workspaces.length,
      )
    }
  })
  useEffect(() => {
    if (action === "delete") return
    const timer = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(timer)
  }, [action])
  return (
    <box id="http-collection-action-form" style={{ flexShrink: 0 }}>
      <text
        content={truncateDisplay(
          `${translateUi(heading(action))} · ${targetName(row)}`,
          contentWidth,
        )}
        style={{ fg: action === "delete" ? COLORS.danger : COLORS.http }}
      />
      {action === "delete" ? (
        <text
          content={translateUi("Confirme a exclusão deste item e de seu conteúdo.")}
          style={{ fg: COLORS.warning }}
        />
      ) : (
        <input
          ref={inputRef}
          id="http-collection-name-input"
          value={name}
          placeholder={translateUi("Nome")}
          onInput={onNameChange}
          onKeyDown={(event) => {
            if (event.name === "return" || event.name === "enter") {
              event.preventDefault()
              event.stopPropagation()
              onApply(inputRef.current?.value)
            }
            if (event.name === "escape") {
              event.preventDefault()
              event.stopPropagation()
              onCancel()
            }
          }}
          onMouseDown={() => inputRef.current?.focus()}
          style={{ backgroundColor: COLORS.canvas, focusedBackgroundColor: COLORS.panelRaised }}
        />
      )}
      {action === "create-collection" ? (
        <>
          <text
            content={translateUi(sourceMode === "postman" ? "Origem: Postman" : "Origem: Tuiminal")}
            style={{ fg: COLORS.muted }}
          />
          {destination === "postman" ? (
            activeWorkspace ? (
              <text
                content={truncateDisplay(activeWorkspace.name, contentWidth)}
                style={{ fg: COLORS.text }}
              />
            ) : workspaces.length ? (
              <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
                <InlineButton
                  id="http-collection-workspace-previous"
                  label="[↑]"
                  accent={COLORS.http}
                  onPress={() =>
                    onWorkspaceChange((workspaceIndex - 1 + workspaces.length) % workspaces.length)
                  }
                />
                <text
                  content={truncateDisplay(
                    workspaces[workspaceIndex]?.name ?? "",
                    Math.max(4, contentWidth - 12),
                  )}
                  style={{ fg: COLORS.text }}
                />
                <InlineButton
                  id="http-collection-workspace-next"
                  label="[↓]"
                  accent={COLORS.http}
                  onPress={() => onWorkspaceChange((workspaceIndex + 1) % workspaces.length)}
                />
              </box>
            ) : (
              <text
                content={translateUi(workspaceError || "Carregando workspaces Postman…")}
                style={{ fg: COLORS.warning }}
              />
            )
          ) : null}
        </>
      ) : null}
      <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
        <InlineButton
          id="http-collection-action-apply"
          label={action === "delete" ? "[Enter] Excluir" : "[Enter] Salvar"}
          accent={action === "delete" ? COLORS.danger : COLORS.http}
          disabled={!canApply(action, name, destination, activeWorkspace, workspaces)}
          onPress={() => onApply(inputRef.current?.value)}
        />
        <InlineButton
          id="http-collection-action-cancel"
          label="Cancelar"
          accent={COLORS.http}
          onPress={onCancel}
        />
      </box>
    </box>
  )
}
