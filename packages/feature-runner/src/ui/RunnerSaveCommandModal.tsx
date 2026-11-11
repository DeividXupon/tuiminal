import type { BoxRenderable, InputRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { RunnerSaveCommandView } from "./RunnerSaveCommandView"

export type RunnerCommandSaveInput = {
  label: string
  command: string
  interactive: boolean
}

type RunnerSaveCommandModalProps = {
  open: boolean
  command: string
  availableWidth: number
  onClose: () => void
  onSave: (input: RunnerCommandSaveInput) => void
}

export function RunnerSaveCommandModal({
  open,
  command,
  availableWidth,
  onClose,
  onSave,
}: RunnerSaveCommandModalProps) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const nameRef = useRef<InputRenderable | null>(null)
  const nameValueRef = useRef("")
  const [name, setName] = useState("")
  const [interactive, setInteractive] = useState(false)

  const submit = useCallback(() => {
    const label = nameValueRef.current.trim()
    const normalizedCommand = command.trim()
    if (!label || !normalizedCommand) return
    onSave({ label, command: normalizedCommand, interactive })
  }, [command, interactive, onSave])

  const toggleInteractive = useCallback(() => {
    setInteractive((current) => !current)
  }, [])

  useEffect(() => {
    if (!open) return
    renderer.currentFocusedRenderable?.blur()
    nameValueRef.current = ""
    setName("")
    setInteractive(false)
    const timeout = setTimeout(() => nameRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [open, renderer])

  useKeyboard((key) => {
    if (!open) return
    if (key.name === "escape") {
      key.preventDefault()
      key.stopPropagation()
      if (renderer.currentFocusedRenderable?.id === "runner-save-command-name") {
        nameRef.current?.blur()
        dialogRef.current?.focus()
        return
      }
      onClose()
    } else if (key.ctrl && key.name === "p") {
      key.preventDefault()
      key.stopPropagation()
      toggleInteractive()
    } else if (key.ctrl && key.name === "s") {
      key.preventDefault()
      key.stopPropagation()
      submit()
    }
  })

  if (!open) return null

  const width = Math.max(1, Math.min(88, availableWidth - 2))
  const height = Math.max(1, Math.min(19, terminal.height - 2))
  const compact = width < 64
  const contentWidth = Math.max(8, width - 6)

  return (
    <RunnerSaveCommandView
      {...{
        dialogRef,
        width,
        height,
        onClose,
        command,
        contentWidth,
        nameRef,
        name,
        nameValueRef,
        setName,
        submit,
        interactive,
        toggleInteractive,
        compact,
      }}
    />
  )
}
