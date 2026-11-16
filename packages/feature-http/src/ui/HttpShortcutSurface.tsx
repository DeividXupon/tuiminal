import { ShortcutScope } from "@xupon/tuiminal-core/keyboard/react"
import type { ContextType, ReactNode } from "react"
import type { HttpPane } from "../model/types"
import { HttpBoxSelectionContext } from "./HttpBoxSelection"

export function HttpShortcutSurface({
  children,
  overlay,
  pane,
}: {
  children: ReactNode
  overlay: ContextType<typeof HttpBoxSelectionContext>
  pane: HttpPane
}) {
  return (
    <HttpBoxSelectionContext.Provider value={overlay}>
      <ShortcutScope tool="http" context={pane} rootId="http-workspace">
        {children}
      </ShortcutScope>
    </HttpBoxSelectionContext.Provider>
  )
}
