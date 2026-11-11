import { CliRenderEvents, type InputRenderable } from "@opentui/core"
import { createPortal, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState, type RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText"
import {
  useHttpVariableInspection,
  type HttpVariableTarget,
} from "../hooks/use-http-variable-inspection"
import type { HttpCompletionKey, HttpVariableSuggestion } from "../model/variable-completion"
import {
  prepareHttpVariableEdit,
  type HttpVariableEditContext,
  type HttpVariableSave,
} from "../services/variable-edit"
import { HTTP_VARIABLE_BADGES } from "./http-variable-badges"

type Inspector = HttpVariableTarget & {
  requestId: string
  variable: HttpVariableSuggestion
  value: string
  save: () => Promise<HttpVariableSave>
  busy: boolean
  error: string
}
export function HttpVariableInspector({
  active,
  context,
  suggestions,
  keyRef,
}: {
  active: boolean
  context: HttpVariableEditContext | null
  suggestions: HttpVariableSuggestion[]
  keyRef: RefObject<((key: HttpCompletionKey) => boolean) | null>
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const [item, setItem] = useState<Inspector | null>(null)
  const current = useRef(item)
  const input = useRef<InputRenderable | null>(null)
  const alive = useRef(true)
  const live = useRef({ active, requestId: context?.request.id })
  live.current = { active, requestId: context?.request.id }
  const dismissed = useRef("")
  const publish = (next: Inspector | null) => {
    current.current = next
    setItem(next)
  }
  const restore = (owner: Inspector) => {
    if (
      !owner.editor.isDestroyed &&
      live.current.active &&
      live.current.requestId === owner.requestId
    )
      owner.editor.focus()
  }
  async function save(owner: Inspector) {
    publish({ ...owner, busy: true, error: "" })
    try {
      const persist = await owner.save()
      await persist(owner.value)
      return true
    } catch (error) {
      if (alive.current) {
        publish({
          ...owner,
          busy: false,
          error: error instanceof Error ? error.message : String(error),
        })
        input.current?.focus()
      }
      return false
    }
  }
  async function finish(returnFocus: boolean) {
    const owner = current.current
    if (!owner || owner.busy) return
    if (owner.value !== owner.variable.value && !(await save(owner))) return
    if (!alive.current) return
    dismissed.current = `${owner.editor.id}:${owner.token.row}:${owner.token.start}`
    const restoreFocus =
      returnFocus &&
      (renderer.currentFocusedRenderable === input.current || !renderer.currentFocusedRenderable)
    publish(null)
    if (restoreFocus) restore(owner)
  }
  const leave = () => {
    if (!current.current) dismissed.current = ""
    if (renderer.currentFocusedRenderable?.id === "http-variable-value-input") return
    if (current.current?.error) return
    if (current.current) void finish(false)
  }
  useHttpVariableInspection({
    active,
    requestId: context?.request.id ?? "",
    leave,
    show: (target) => {
      if (!context || current.current?.busy || current.current?.error || input.current?.focused)
        return
      const identity = `${target.editor.id}:${target.token.row}:${target.token.start}`
      if (dismissed.current === identity) return
      const variable = suggestions.find((entry) => entry.name === target.token.name)
      if (!variable || !["environment", "global", "collection"].includes(variable.scope)) return
      let prepared: Promise<HttpVariableSave> | undefined
      const save = () =>
        (prepared ??= prepareHttpVariableEdit(context, variable).catch((error) => {
          prepared = undefined
          throw error
        }))
      void save().catch(() => {}) // Present read failures when the user attempts to save.
      publish({
        ...target,
        requestId: context.request.id,
        variable,
        value: variable.value,
        save,
        busy: false,
        error: "",
      })
    },
  })
  keyRef.current = (key) => {
    const owner = current.current
    if (!active || !owner) return false
    const editing = renderer.currentFocusedRenderable?.id === "http-variable-value-input"
    if (key.name === "escape" || (editing && (key.name === "return" || key.name === "tab"))) {
      key.preventDefault()
      key.stopPropagation()
      void finish(true)
      return true
    }
    if (!editing && key.name === "down" && !key.ctrl && !key.meta && !key.option) {
      key.preventDefault()
      key.stopPropagation()
      input.current?.focus()
      return true
    }
    if (editing) {
      // Native input owns text keys; prevent workspace commands from interpreting them.
      return true
    }
    dismissed.current = ""
    leave()
    return false
  }
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      keyRef.current = null
    }
  }, [keyRef])
  useEffect(() => {
    const check = () => {
      if (
        current.current &&
        input.current &&
        !input.current.focused &&
        current.current.value !== current.current.variable.value
      )
        void finish(false)
    }
    renderer.on(CliRenderEvents.FRAME, check)
    return () => {
      renderer.off(CliRenderEvents.FRAME, check)
    }
  })
  if (!item || !active) return null
  const width = Math.min(54, terminal.width)
  const height = item.error ? 4 : 3
  const top = item.y + 1 + height <= terminal.height ? item.y + 1 : Math.max(0, item.y - height)
  const badge = HTTP_VARIABLE_BADGES[item.variable.scope]
  return createPortal(
    <box
      id="http-variable-inspector"
      position="absolute"
      left={Math.max(0, Math.min(item.x, terminal.width - width))}
      top={top}
      width={width}
      height={height}
      zIndex={160}
      backgroundColor={COLORS.panelRaised}
    >
      <text content={truncateDisplay(item.variable.name, width)} fg={COLORS.text} height={1} />
      <box flexDirection="row" height={1}>
        <text content={badge.label} bg={badge.background} fg="#ffffff" width={1} />
        <input
          id="http-variable-value-input"
          ref={input}
          value={item.value}
          onInput={(value) => {
            const owner = current.current
            if (owner && !owner.busy) publish({ ...owner, value })
          }}
          onKeyDown={(event) => {
            if (current.current?.busy) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          width={Math.max(1, width - 2)}
          marginLeft={1}
          textColor={COLORS.text}
          focusedTextColor={COLORS.text}
          backgroundColor={COLORS.canvas}
          focusedBackgroundColor={COLORS.canvas}
        />
      </box>
      {item.error ? (
        <text
          content={truncateDisplay(translateUi(item.error), width)}
          fg={COLORS.danger}
          height={1}
        />
      ) : null}
      <ShortcutText
        content={item.busy ? "Salvando..." : "[↓] Editar · [Esc] Salvar e sair"}
        fg={COLORS.muted}
        height={1}
      />
    </box>,
    renderer.root,
    null,
    "http-variable-inspector",
  )
}
