import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import type { HttpEnvironmentTabs } from "./use-http-environment-tabs"
import type { HttpKey } from "../model/keyboard-types"

const deltas: Record<string, number> = { up: -1, k: -1, down: 1, j: 1 }
function nextSelection(key: HttpKey, current: number, count: number) {
  if (key.name === "home") return 0
  if (key.name === "end") return count - 1
  if (key.name === "tab") return (current + (key.shift ? -1 : 1) + count) % count
  const delta = deltas[key.name]
  return delta === undefined ? null : Math.max(0, Math.min(count - 1, current + delta))
}

export function useHttpEnvironmentNavigation(
  environments: HttpEnvironmentTabs,
  rows: Array<{ key: string; name: string }>,
  active: boolean,
  menu: { menuOpen: boolean; openMenu: (index: number) => void },
) {
  const renderer = useRenderer()
  const [selection, setSelection] = useState(() =>
    Math.max(
      0,
      rows.findIndex((row) => row.key === environments.active?.key),
    ),
  )
  const targets = [
    ...rows.map((_, i) => `http-environment-entry-${i}`),
    "http-environment-new",
    "http-environment-refresh",
    "http-environment-none",
  ]
  function select(index: number) {
    const next = Math.max(0, Math.min(targets.length - 1, index))
    setSelection(next)
    const id = targets[next]!
    renderer.root.findDescendantById(id)?.focus()
    const scroll = renderer.root.findDescendantById("http-collection-scroll") as
      | ScrollBoxRenderable
      | undefined
    scroll?.scrollChildIntoView(id)
  }
  const wasActive = useRef(false)
  const entryFocus = useRef((_followDocument: boolean) => {})
  entryFocus.current = (followDocument) => {
    const current = rows.findIndex((row) => row.key === environments.active?.key)
    select(followDocument && current >= 0 ? current : selection)
  }
  useEffect(() => {
    const entering = active && !wasActive.current
    wasActive.current = active
    if (!active || environments.pending || menu.menuOpen) return
    const timer = setTimeout(() => entryFocus.current(entering), 0)
    return () => clearTimeout(timer)
  }, [active, environments.pending, menu.menuOpen])
  function handleKey(key: HttpKey, current: number, action: boolean) {
    const next = nextSelection(key, current, targets.length)
    if (key.name === "a" && current > 0 && current < rows.length) menu.openMenu(current)
    else if (["enter", "return"].includes(key.name) && action) menu.openMenu(current)
    else if (next !== null) select(next)
    else if (key.name === "n") environments.create()
    else if (key.name === "r") void environments.refresh()
    else if (["enter", "return", "right", "l"].includes(key.name) && rows[current])
      environments.open(rows[current]!)
    else if (["right", "l"].includes(key.name) && environments.active)
      environments.selectTab(environments.active.id)
    else return false
    return true
  }
  useKeyboard((key) => {
    if (
      !active ||
      menu.menuOpen ||
      environments.pending ||
      key.defaultPrevented ||
      key.ctrl ||
      key.meta ||
      key.option
    )
      return
    const focused = renderer.currentFocusedRenderable?.id ?? ""
    if (focused === "http-box-selection" || focused.startsWith("http-action-palette")) return
    const action = focused.match(/^http-environment-actions-(\d+)$/)
    const index = action ? Number(action[1]) : targets.indexOf(focused)
    const current = index < 0 ? selection : index
    if (!handleKey(key, current, Boolean(action))) return
    key.preventDefault()
    key.stopPropagation()
  })
  return select
}
