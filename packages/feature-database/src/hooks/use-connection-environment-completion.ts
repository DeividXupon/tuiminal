import {
  type InputRenderable,
  type KeyEvent,
  RenderableEvents,
  ScrollBoxRenderable,
} from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react"
import { connectionEnvironmentCompletion } from "../model/connection-environment"
import { connectionEnvironmentNames } from "../services/connection-environment"

function changesCompletionContext(key: KeyEvent) {
  return (
    key.ctrl ||
    key.meta ||
    (key.shift && key.name === "tab") ||
    ["left", "right", "home", "end"].includes(key.name)
  )
}

export function useConnectionEnvironmentCompletion(
  inputRef: RefObject<InputRenderable | null>,
  onInput: (value: string) => void,
  maxLength: number,
) {
  const renderer = useRenderer()
  const [candidate, setCandidate] =
    useState<ReturnType<typeof connectionEnvironmentCompletion>>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const candidateRef = useRef(candidate)
  const selectedRef = useRef(0)
  const clear = () => {
    candidateRef.current = null
    setCandidate(null)
  }
  useEffect(() => {
    if (!candidate) return
    const timer = setTimeout(() => {
      const input = inputRef.current
      let parent = input?.parent
      while (parent && !(parent instanceof ScrollBoxRenderable)) parent = parent.parent
      if (input && parent instanceof ScrollBoxRenderable) {
        parent.scrollChildIntoView(`${input.id}-environment-suggestions`)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [candidate, inputRef])

  const accept = (index: number) => {
    const input = inputRef.current
    const current = candidateRef.current
    const name = current?.suggestions[index]
    if (!input || !current || !name) return
    const next = `${input.value.slice(0, current.start)}{${name}}${input.value.slice(current.end)}`
    if ([...next].length > maxLength) return
    input.value = next
    input.cursorOffset = current.start + name.length + 2
    onInput(next)
    clear()
    input.focus()
  }
  const onKey = useEffectEvent((key: KeyEvent) => {
    if (key.defaultPrevented || !inputRef.current?.focused || !candidateRef.current) return
    if (key.name === "escape") clear()
    else if ((key.name === "tab" && !key.shift) || key.name === "return")
      accept(selectedRef.current)
    else if (key.name === "down" || key.name === "up") {
      const length = candidateRef.current.suggestions.length
      selectedRef.current = (selectedRef.current + (key.name === "down" ? 1 : length - 1)) % length
      setSelectedIndex(selectedRef.current)
    } else {
      // Cursor movement or focus shortcuts must not apply a stale replacement range.
      if (changesCompletionContext(key)) clear()
      return
    }
    key.preventDefault()
    key.stopPropagation()
  })
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const detach = () => renderer.keyInput.off("keypress", onKey)
    const onFocus = () => {
      detach()
      // Completion must consume Tab/Enter/Esc before the modal handles them.
      renderer.keyInput.prependListener("keypress", onKey)
    }
    const onBlur = () => {
      detach()
      candidateRef.current = null
      setCandidate(null)
    }
    input.on(RenderableEvents.FOCUSED, onFocus)
    input.on(RenderableEvents.BLURRED, onBlur)
    if (input.focused) onFocus()
    return () => {
      detach()
      input.off(RenderableEvents.FOCUSED, onFocus)
      input.off(RenderableEvents.BLURRED, onBlur)
    }
  }, [inputRef, renderer])
  const first = Math.max(0, selectedIndex - 4)
  return {
    visible: Boolean(candidate && inputRef.current?.focused),
    suggestions: candidate?.suggestions.slice(first, first + 5) ?? [],
    selectedIndex: selectedIndex - first,
    accept: (index: number) => accept(index + first),
    onInput: (value: string) => {
      onInput(value)
      const next = connectionEnvironmentCompletion(
        value,
        inputRef.current?.cursorOffset ?? value.length,
        connectionEnvironmentNames(),
      )
      candidateRef.current = next
      selectedRef.current = 0
      setSelectedIndex(0)
      setCandidate(next)
    },
  }
}
