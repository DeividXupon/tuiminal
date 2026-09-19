import type { BoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import {
  type IssueActionAvailability,
  type IssueActionKind,
  issueActionKindForShortcut,
} from "../../model/issue/actions"
import type { IssueSummary } from "../../model/issue/types"
import { GitActionMenuView } from "../shared/GitActionMenuView"

export type IssueActionMenuItem = {
  kind: IssueActionKind
  label: string
  shortcut: string
  availability: IssueActionAvailability
}

export function IssueActionMenuModal({
  item,
  actions,
  onClose,
  onSelect,
}: {
  item: IssueSummary
  actions: IssueActionMenuItem[]
  onClose: () => void
  onSelect: (kind: IssueActionKind) => void
}) {
  const renderer = useRenderer()
  const terminal = useTerminalDimensions()
  const dialogRef = useRef<BoxRenderable | null>(null)
  const [index, setIndex] = useState(0)
  useEffect(() => {
    renderer.currentFocusedRenderable?.blur()
    setIndex(0)
    const timeout = setTimeout(() => dialogRef.current?.focus(), 0)
    return () => clearTimeout(timeout)
  }, [renderer])
  useKeyboard((key) => {
    const shortcutAction = issueActionKindForShortcut(key)
    if (key.name === "escape" || key.name === "?") {
      key.preventDefault()
      key.stopPropagation()
      onClose()
    } else if (shortcutAction) {
      key.preventDefault()
      key.stopPropagation()
      const action = actions.find((candidate) => candidate.kind === shortcutAction)
      if (action?.availability.enabled) onSelect(action.kind)
    } else if (key.name === "j" || key.name === "down") {
      key.preventDefault()
      setIndex((current) => Math.min(actions.length - 1, current + 1))
    } else if (key.name === "k" || key.name === "up") {
      key.preventDefault()
      setIndex((current) => Math.max(0, current - 1))
    } else if (key.name === "enter" || key.name === "return") {
      key.preventDefault()
      const action = actions[index]
      if (action?.availability.enabled) onSelect(action.kind)
    }
  })
  const width = Math.max(48, Math.min(84, terminal.width - 4))
  return (
    <GitActionMenuView
      id="git-issue-action-menu"
      title="◆ AÇÕES DA ISSUE"
      subject={`${item.identity.owner}/${item.identity.repository} #${item.identity.number} · ${item.title}`}
      width={width}
      maxHeight={18}
      actions={actions}
      selectedIndex={index}
      dialogRef={dialogRef}
      onClose={onClose}
      onSelect={onSelect}
    />
  )
}
