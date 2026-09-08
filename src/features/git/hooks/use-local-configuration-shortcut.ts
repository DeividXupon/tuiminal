import { useKeyboard } from "@opentui/react"

export function useLocalConfigurationShortcut(active: boolean, onOpen?: (() => void) | undefined) {
  useKeyboard((key) => {
    if (!active || !onOpen || !key.ctrl || key.name !== "p") return
    key.preventDefault()
    key.stopPropagation()
    onOpen()
  })
}
