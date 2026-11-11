import { decodePasteBytes, type KeyEvent } from "@opentui/core"
import { usePaste, useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef } from "react"
import { isAgentDropPath } from "../model/agent-file-drop"

function isTextKey(key: KeyEvent) {
  return key.sequence && !(key.ctrl || key.meta || key.option || /[\p{Cc}]/u.test(key.sequence))
}

/** Capture bracketed paste and file-manager drops sent as ordinary terminal keys. */
export function useAgentFilePaste(options: {
  enabled: () => boolean
  busy: () => boolean
  paste: (text: string) => void
  replay: (keys: readonly KeyEvent[]) => void
}) {
  const renderer = useRenderer()
  const current = useRef(options)
  current.current = options
  const pending = useRef<KeyEvent[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clear = useCallback(() => {
    clearTimeout(timer.current)
    pending.current = []
  }, [])
  usePaste((event) => {
    if (!current.current.enabled()) return
    const text = decodePasteBytes(event.bytes)
    if (!current.current.busy() && !/^[\s"']*(?:\/|~\/|file:\/\/|[a-z]:[\\/]|\\\\)/iu.test(text))
      return
    event.preventDefault()
    event.stopPropagation()
    clear()
    if (!current.current.busy()) current.current.paste(text)
  })
  useEffect(() => {
    let rawPath = false
    const raw = (chunk: Buffer | string) => {
      rawPath = isAgentDropPath(chunk.toString().trimStart().replace(/^["']/u, ""))
    }
    const flush = () => {
      const keys = pending.current
      clear()
      if (!current.current.enabled() || !keys.length) return
      if (keys.length === 1 && keys[0]?.sequence.length === 1) current.current.replay(keys)
      else current.current.paste(keys.map((key) => key.sequence).join(""))
    }
    const handleKey = (key: KeyEvent) => {
      if (!current.current.enabled() || key.defaultPrevented || current.current.busy()) return
      if (!isTextKey(key)) {
        current.current.replay(pending.current)
        clear()
        return
      }
      if (
        !pending.current.length &&
        (key.source !== "raw" || !(rawPath || /^[/~'"\\]/u.test(key.sequence)))
      )
        return
      key.preventDefault()
      key.stopPropagation()
      pending.current.push(key)
      clearTimeout(timer.current)
      if (pending.current.length > 32_768) {
        current.current.replay(pending.current)
        clear()
      } else timer.current = setTimeout(flush, 120)
    }
    renderer.stdin.prependListener("data", raw)
    renderer.keyInput.prependListener("keypress", handleKey)
    return () => {
      renderer.stdin.off("data", raw)
      renderer.keyInput.off("keypress", handleKey)
      clear()
    }
  }, [clear, renderer])
}
