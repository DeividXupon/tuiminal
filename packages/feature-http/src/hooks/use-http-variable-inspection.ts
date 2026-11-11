import {
  CliRenderEvents,
  TextareaRenderable,
  type MouseEvent,
  type Renderable,
} from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"
import { httpVariableInput } from "../model/variable-completion"
import {
  applyHttpVariableHighlights,
  clearHttpVariableHighlights,
  mouseVariable,
  variableAt,
  type HttpVariableToken,
} from "../ui/http-variable-rendering"

export type HttpVariableTarget = {
  editor: TextareaRenderable
  token: HttpVariableToken
  x: number
  y: number
}
export function useHttpVariableInspection({
  active,
  requestId,
  show,
  leave,
}: {
  active: boolean
  requestId: string
  show: (target: HttpVariableTarget) => void
  leave: () => void
}) {
  const renderer = useRenderer()
  const handlers = useRef({ show, leave })
  handlers.current = { show, leave }
  useEffect(() => {
    if (!active) return
    const editors = new Map<
      TextareaRenderable,
      { tokens: HttpVariableToken[]; cleanup: () => void }
    >()
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = ""
    let caret = ""
    let disposed = false
    function cancel() {
      clearTimeout(timer)
      pending = ""
      handlers.current.leave()
    }
    function schedule(
      editor: TextareaRenderable,
      token: HttpVariableToken | undefined,
      x: number,
      y: number,
      identity: string,
    ) {
      if (!token) return cancel()
      const key = `${editor.id}:${token.row}:${token.start}:${identity}`
      if (key === pending) return
      clearTimeout(timer)
      pending = key
      handlers.current.leave()
      timer = setTimeout(() => {
        if (!editor.isDestroyed && pending === key) handlers.current.show({ editor, token, x, y })
      }, 1000)
    }
    function insideTooltip(event: MouseEvent) {
      const popup = renderer.root.findDescendantById("http-variable-inspector")
      return (
        popup &&
        event.x >= popup.screenX &&
        event.x < popup.screenX + popup.width &&
        event.y >= popup.screenY &&
        event.y < popup.screenY + popup.height
      )
    }
    function attach(editor: TextareaRenderable) {
      const entry = {
        tokens: applyHttpVariableHighlights(editor, editor.plainText),
        cleanup: () => {},
      }
      const update = () => {
        entry.tokens = applyHttpVariableHighlights(editor, editor.plainText)
        caret = ""
      }
      const move = (event: MouseEvent) => {
        const token = mouseVariable(editor, entry.tokens, event.x, event.y)
        schedule(editor, token, event.x, event.y, "mouse")
      }
      editor.onMouseMove = move
      editor.onMouseOver = move
      editor.onMouseOut = (event) => {
        if (!insideTooltip(event)) cancel()
      }
      const cursorChanged = () =>
        queueMicrotask(() => {
          if (!disposed) updateCaret()
        })
      editor.editBuffer.on("content-changed", update)
      editor.editBuffer.on("cursor-changed", cursorChanged)
      editor.on("focused", cursorChanged)
      editor.on("blurred", cursorChanged)
      entry.cleanup = () => {
        editor.editBuffer.off("content-changed", update)
        editor.editBuffer.off("cursor-changed", cursorChanged)
        editor.off("focused", cursorChanged)
        editor.off("blurred", cursorChanged)
        if (!editor.isDestroyed) {
          editor.onMouseMove = undefined
          editor.onMouseOver = undefined
          editor.onMouseOut = undefined
          clearHttpVariableHighlights(editor)
        }
      }
      editors.set(editor, entry)
    }
    function visit(node: Renderable, seen: Set<TextareaRenderable>) {
      if (!node.visible || node.isDestroyed) return
      if (node instanceof TextareaRenderable && httpVariableInput(node.id)) {
        seen.add(node)
        if (!editors.has(node)) attach(node)
      }
      for (const child of node.getChildren()) visit(child, seen)
    }
    function refreshEditors() {
      const seen = new Set<TextareaRenderable>()
      visit(renderer.root, seen)
      for (const [editor, entry] of editors)
        if (!seen.has(editor)) {
          entry.cleanup()
          editors.delete(editor)
        }
    }
    function updateCaret() {
      const focused = renderer.currentFocusedRenderable
      if (focused?.id === "http-variable-value-input") return
      const editor = focused instanceof TextareaRenderable ? focused : null
      const identity = `${requestId}:${editor?.id}:${editor?.cursorOffset}`
      if (identity === caret) return
      caret = identity
      const entry = editor && editors.get(editor)
      if (!entry || !editor) return cancel()
      const cursor = editor.logicalCursor
      schedule(
        editor,
        variableAt(entry.tokens, cursor.row, cursor.col),
        editor.screenX + editor.visualCursor.visualCol,
        editor.screenY + editor.visualCursor.visualRow,
        identity,
      )
    }
    function update() {
      refreshEditors()
      updateCaret()
    }
    renderer.on(CliRenderEvents.FRAME, update)
    update()
    return () => {
      disposed = true
      clearTimeout(timer)
      renderer.off(CliRenderEvents.FRAME, update)
      for (const entry of editors.values()) entry.cleanup()
    }
  }, [active, requestId, renderer])
}
