import type { MouseEvent as OpenTuiMouseEvent } from "@opentui/core"
import { LAYOUT } from "@xupon/tuiminal-core/settings/theme"
import type { HttpLayout } from "../model/layout"

export function splitRatioFromMouse(layout: HttpLayout, event: OpenTuiMouseEvent) {
  const target = event.currentTarget
  if (!target) return null
  const stacked = layout.request.left === layout.response.left
  const available = stacked
    ? layout.request.height + layout.response.height
    : layout.request.width + layout.response.width
  const start = stacked ? target.screenY + layout.request.top : target.screenX + layout.request.left
  const position = stacked ? event.y : event.x
  return Math.min(0.7, Math.max(0.25, (position - start) / Math.max(1, available)))
}
export function HttpSplitHandle({ layout, onStart }: { layout: HttpLayout; onStart: () => void }) {
  const stacked = layout.request.left === layout.response.left
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI boxes expose mouse events but no ARIA role; keyboard split controls remain available in the footer.
    <box
      id="http-split-handle"
      style={{
        position: "absolute",
        left: stacked ? layout.request.left : layout.response.left - 1,
        top: stacked ? layout.response.top - 1 : layout.request.top,
        width: stacked ? layout.request.width : 1,
        height: stacked ? 1 : layout.request.height,
        zIndex: 4,
        backgroundColor: LAYOUT.workspaceBackground,
      }}
      onMouseDown={(event) => {
        onStart()
        event.preventDefault()
      }}
    />
  )
}
