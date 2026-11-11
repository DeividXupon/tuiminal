import { basename } from "node:path"
import { BorderChars, type BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { type RefObject, useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import { resolveHttpBodyFiles } from "../services/body-file"
import { useHttpFileDrop } from "../hooks/use-http-file-drop"
import { chooseHttpBodyFiles } from "../services/native-file-picker"

const DOTTED_BORDER = { ...BorderChars.rounded, horizontal: "┄", vertical: "┆" }

export function HttpBodyFile({
  requestId,
  path,
  focused,
  compact,
  multipart = false,
  onFocus,
  onChange,
}: {
  requestId: string
  path: string
  focused: boolean
  compact: boolean
  multipart?: boolean
  onFocus: () => void
  onChange: (paths: string[]) => void
}) {
  const renderer = useRenderer()
  const drop = useRef<BoxRenderable | null>(null)
  const operation = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const prefix = `http-body-file-${requestId}`
  useEffect(() => {
    if (focused && !multipart) drop.current?.focus()
  }, [focused, multipart])
  useEffect(() => () => operation.current?.abort(), [])

  function select(value: string[]) {
    try {
      const selected = resolveHttpBodyFiles(value, HTTP_WORKING_DIRECTORY)
      setError("")
      onChange(selected)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }
  function focusDrop() {
    onFocus()
    drop.current?.focus()
  }
  function remove() {
    if (operation.current) return
    setError("")
    onChange([])
    focusDrop()
  }
  async function choose() {
    if (operation.current) return
    focusDrop()
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    setError("")
    try {
      const selected = await chooseHttpBodyFiles(controller.signal)
      if (!controller.signal.aborted && selected) select(selected)
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        if (renderer.currentFocusedRenderable?.id.startsWith(prefix)) drop.current?.focus()
      }
      operation.current = null
    }
  }
  useHttpFileDrop(prefix, focused, (value) => {
    if (operation.current) return
    if (value) select(value)
    else setError("Solte arquivos ou cole seus caminhos completos.")
  })
  useKeyboard((key) => {
    const id = renderer.currentFocusedRenderable?.id ?? ""
    if (
      !focused ||
      !id.startsWith(prefix) ||
      key.defaultPrevented ||
      key.ctrl ||
      key.meta ||
      key.option
    )
      return
    if (key.name === "tab") {
      key.preventDefault()
      key.stopPropagation()
      const ids = [`${prefix}-drop`, `${prefix}-choose`, ...(path ? [`${prefix}-remove`] : [])]
      const index = (ids.indexOf(id) + (key.shift ? ids.length - 1 : 1)) % ids.length
      renderer.root.findDescendantById(ids[index] ?? ids[0] ?? "")?.focus()
    } else if (["return", "enter"].includes(key.name) && id === `${prefix}-drop`) {
      key.preventDefault()
      key.stopPropagation()
      void choose()
    } else if (key.name === "backspace" && path) {
      key.preventDefault()
      key.stopPropagation()
      remove()
    }
  })

  return (
    <box
      id={prefix}
      flexGrow={multipart ? 0 : 1}
      flexShrink={multipart ? 0 : 1}
      minHeight={0}
      paddingTop={compact || multipart ? 0 : 1}
      gap={compact || multipart ? 0 : 1}
    >
      <box flexDirection="row" flexWrap="wrap" flexShrink={0}>
        <InlineButton
          id={`${prefix}-choose`}
          label={
            busy
              ? "Abrindo seletor…"
              : multipart
                ? "[Enter] Adicionar arquivos"
                : "[Enter] Escolher arquivos"
          }
          accent={COLORS.http}
          disabled={busy}
          onPress={() => void choose()}
        />
        {path ? (
          <InlineButton
            id={`${prefix}-remove`}
            label="[Backspace] Remover"
            disabled={busy}
            onPress={remove}
          />
        ) : null}
      </box>
      <HttpBodyFileDrop
        drop={drop}
        prefix={prefix}
        path={path}
        focused={focused}
        compact={compact}
        multipart={multipart}
        onFocus={focusDrop}
      />
      {error ? (
        <text
          id={`${prefix}-error`}
          content={translateUi(error)}
          fg={COLORS.danger}
          flexShrink={0}
        />
      ) : null}
    </box>
  )
}

function HttpBodyFileDrop({
  drop,
  prefix,
  path,
  focused,
  compact,
  multipart,
  onFocus,
}: {
  drop: RefObject<BoxRenderable | null>
  prefix: string
  path: string
  focused: boolean
  compact: boolean
  multipart: boolean
  onFocus: () => void
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: native focusable drop target owns paste and Enter; the chooser button provides the same action.
    <box
      ref={drop}
      id={`${prefix}-drop`}
      focusable
      onMouseDown={onFocus}
      onMouseDrop={onFocus}
      flexGrow={multipart ? 0 : 1}
      height={multipart ? (compact ? 1 : 3) : "auto"}
      minHeight={multipart && compact ? 1 : 3}
      border={multipart && compact ? ["left", "right"] : true}
      customBorderChars={DOTTED_BORDER}
      borderColor={focused ? COLORS.http : COLORS.border}
      backgroundColor={COLORS.canvas}
      alignItems="center"
      justifyContent="center"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <text
        content={path ? basename(path) : translateUi("SOLTE ARQUIVOS AQUI")}
        fg={path ? COLORS.text : COLORS.http}
        width="100%"
        height={compact || multipart ? 1 : "auto"}
        wrapMode="word"
      />
      {!compact && !multipart ? (
        <text
          content={path || translateUi("ou cole os caminhos completos")}
          fg={COLORS.muted}
          width="100%"
          wrapMode="word"
        />
      ) : null}
    </box>
  )
}
