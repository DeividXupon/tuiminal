import { CliRenderEvents, type TextareaRenderable } from "@opentui/core"
import { createPortal, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import type { HttpCompletionKey, HttpVariableSuggestion } from "../model/variable-completion"
import type { HttpVariableContext } from "../model/types"
import { httpVariableSuggestions } from "../services/variable-suggestions"
import { useHttpVariableCompletion } from "../hooks/use-http-variable-completion"

import { HTTP_VARIABLE_BADGES } from "./http-variable-badges"
import { HttpVariableInspector } from "./HttpVariableInspector"
import type { HttpWorkspaceAction } from "../model/workspace"
import type { HttpVariableEditContext } from "../services/variable-edit"

export function HttpVariableCompletion({
  active,
  request,
  project,
  dispatch,
  session,
  variables,
  keyRef,
}: {
  request: HttpVariableEditContext["request"] | undefined
  dispatch: (action: HttpWorkspaceAction) => void
  project: HttpVariableEditContext["project"]
  session: HttpVariableEditContext["session"]
  active: boolean
  variables: HttpVariableContext
  keyRef: RefObject<((key: HttpCompletionKey) => boolean) | null>
}) {
  const requestId = request?.id ?? ""
  const editContext = request
    ? {
        project,
        session,
        request,
        onCollectionSave: (path: string, beforeHash: string, sourceHash: string) =>
          dispatch({ type: "rebase-collection-variable", path, beforeHash, sourceHash }),
      }
    : null
  const completionRef = useRef<((key: HttpCompletionKey) => boolean) | null>(null)
  const inspectionRef = useRef<((key: HttpCompletionKey) => boolean) | null>(null)
  keyRef.current = (key) => inspectionRef.current?.(key) || completionRef.current?.(key) || false
  useEffect(
    () => () => {
      keyRef.current = null
    },
    [keyRef],
  )
  const suggestions = httpVariableSuggestions(variables)
  const { candidate, index, complete } = useHttpVariableCompletion({
    active: active && Boolean(requestId),
    requestId,
    suggestions,
    keyRef: completionRef,
  })
  return (
    <>
      <HttpVariableInspector
        active={active}
        context={editContext}
        suggestions={suggestions}
        keyRef={inspectionRef}
      />
      {candidate ? (
        <VariableMenu
          editor={candidate.editor}
          suggestions={candidate.suggestions.flatMap(
            (name) => suggestions.find((v) => v.name === name) ?? [],
          )}
          index={index}
          complete={complete}
        />
      ) : null}
    </>
  )
}
function VariableMenu({
  editor,
  suggestions,
  index,
  complete,
}: {
  editor: TextareaRenderable
  suggestions: HttpVariableSuggestion[]
  index: number
  complete: (index: number) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const readAnchor = useCallback(
    () => ({
      x: editor.screenX + editor.visualCursor.visualCol,
      y: editor.screenY + editor.visualCursor.visualRow,
    }),
    [editor],
  )
  const [anchor, setAnchor] = useState(readAnchor)
  useEffect(() => {
    const update = () => {
      if (editor.isDestroyed) return
      const next = readAnchor()
      setAnchor((old) => (old.x === next.x && old.y === next.y ? old : next))
    }
    renderer.on(CliRenderEvents.FRAME, update)
    return () => {
      renderer.off(CliRenderEvents.FRAME, update)
    }
  }, [editor, renderer, readAnchor])
  const width = Math.min(40, terminal.width)
  const rows = Math.max(1, Math.min(4, terminal.height - 2))
  const start = Math.max(0, index - rows + 1)
  const visible = suggestions.slice(start, start + rows)
  const height = visible.length + 2
  const left = Math.max(0, Math.min(anchor.x, terminal.width - width))
  const top =
    anchor.y + 1 + height <= terminal.height ? anchor.y + 1 : Math.max(0, anchor.y - height)
  return createPortal(
    <box
      id="http-variable-suggestions"
      position="absolute"
      left={left}
      top={top}
      width={width}
      height={height}
      zIndex={150}
      backgroundColor={COLORS.panelRaised}
    >
      {visible.map((variable, row) => {
        const selected = row + start === index
        const badge = HTTP_VARIABLE_BADGES[variable.scope]
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: Suggestions retain native editor focus; arrows and Tab provide keyboard access.
          <box
            key={variable.name}
            id={`http-url-variable-${variable.name}`}
            height={selected ? 2 : 1}
            flexShrink={0}
            backgroundColor={selected ? COLORS.diffModifiedBg : COLORS.panelRaised}
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              complete(start + row)
            }}
          >
            <box height={1} flexDirection="row">
              <text content={selected ? "▌" : " "} fg={COLORS.http} width={1} />
              <text content={badge.label} bg={badge.background} fg="#ffffff" width={1} />
              <text content={` ${truncateDisplay(variable.name, width - 3)}`} fg={COLORS.text} />
            </box>
            {selected ? (
              <box height={1} flexDirection="row">
                <text content="▌" fg={COLORS.http} width={1} />
                <text
                  id="http-variable-selected-value"
                  content={truncateDisplay(
                    variable.value.replace(/\r\n|\r|\n/g, " ↵ ").replace(/\t/g, "  ") || '""',
                    width - 1,
                  )}
                  fg={COLORS.muted}
                />
              </box>
            ) : null}
          </box>
        )
      })}
      <ShortcutText content="[↑/↓] Escolher · [Tab] Completar" height={1} fg={COLORS.muted} />
    </box>,
    renderer.root,
    null,
    "http-variable-suggestions",
  )
}
