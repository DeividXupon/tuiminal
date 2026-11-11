import { decodePasteBytes, KeyEvent } from "@opentui/core"
import { usePaste, useRenderer } from "@opentui/react"
import { useEffect, useRef } from "react"
import { pastedHttpBodyFiles } from "../services/body-file-drop"

export function useHttpFileDrop(
  prefix: string,
  enabled: boolean,
  onDrop: (paths: string[] | null) => void,
) {
  const renderer = useRenderer()
  const pending = useRef("")
  const firstKey = useRef<KeyEvent | null>(null)
  const replaying = useRef(false)
  const rawPathChunk = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const current = useRef(onDrop)
  current.current = onDrop
  const ownsFocus = () => enabled && renderer.currentFocusedRenderable?.id.startsWith(prefix)
  const clear = () => {
    clearTimeout(timer.current)
    pending.current = ""
    firstKey.current = null
  }
  const flush = () => {
    const value = pending.current
    const first = firstKey.current
    clear()
    if (!value || !ownsFocus()) return
    if (value.length === 1 && first) {
      // A lone slash is the URL shortcut, not a dropped path.
      replaying.current = true
      try {
        renderer.keyInput.emit("keypress", new KeyEvent(first))
      } finally {
        replaying.current = false
      }
      return
    }
    const paths = pastedHttpBodyFiles(value)
    if (paths) current.current(paths)
  }
  usePaste((event) => {
    if (!ownsFocus()) return
    event.preventDefault()
    event.stopPropagation()
    clear()
    current.current(pastedHttpBodyFiles(decodePasteBytes(event.bytes)))
  })
  const handler = useRef<(key: KeyEvent) => void>(() => {})
  handler.current = (key) => {
    if (replaying.current || !ownsFocus() || key.defaultPrevented) return
    if (pending.current && ["return", "enter"].includes(key.name)) {
      key.preventDefault()
      key.stopPropagation()
      flush()
      return
    }
    if (
      key.ctrl ||
      key.meta ||
      key.option ||
      [...key.sequence].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      !key.sequence
    ) {
      clear()
      return
    }
    // Some terminals send a dragged file path as ordinary text instead of bracketed paste.
    // Only a path prefix starts capture; ordinary shortcut letters pass through immediately.
    const startsPath = rawPathChunk.current || /^[/~'"\\]/.test(key.sequence)
    if (!pending.current && (key.source !== "raw" || !startsPath)) return
    firstKey.current ??= key
    key.preventDefault()
    key.stopPropagation()
    pending.current += key.sequence
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 150)
  }
  useEffect(() => {
    // A full raw drop can start with a drive letter or file://; a lone letter is a shortcut.
    const observeInput = (chunk: Buffer | string) => {
      rawPathChunk.current = /^\s*["']?(?:file:\/\/|[a-z]:[\\/]|\/|~\/|\\\\)/i.test(
        chunk.toString(),
      )
    }
    const handleKey = (key: KeyEvent) => handler.current(key)
    // Capture the rest of a raw path before workspace/global shortcuts see its letters.
    renderer.stdin.prependListener("data", observeInput)
    renderer.keyInput.prependListener("keypress", handleKey)
    return () => {
      renderer.stdin.off("data", observeInput)
      renderer.keyInput.off("keypress", handleKey)
      clearTimeout(timer.current)
    }
  }, [renderer])
}
