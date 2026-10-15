import type { HttpKey } from "../model/keyboard-types"
import type { HttpWorkspaceState } from "../model/types"

export function handleHttpCollectionTreeKey(
  key: HttpKey & { preventDefault: () => void; stopPropagation: () => void },
  state: HttpWorkspaceState,
  focusedId: string,
  keyRef: { current: ((key: HttpKey) => boolean) | null },
) {
  if (state.overlay !== null || state.activePane !== "navigation") return false
  if (state.navigationView !== "collection") return false
  if (focusedId === "http-collection-search" || focusedId === "http-collection-name-input") {
    return false
  }
  if (!keyRef.current?.(key)) return false
  key.preventDefault()
  key.stopPropagation()
  return true
}
