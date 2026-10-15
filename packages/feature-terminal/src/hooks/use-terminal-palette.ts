import { CliRenderEvents, type TerminalColors } from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { useEffect, useState } from "react"
import { hostTerminalPaletteSequence } from "../rendering/terminal-palette"

/** One host-palette subscription serves every mounted terminal pane. */
export function useTerminalPalette() {
  const renderer = useRenderer()
  const [sequence, setSequence] = useState("")
  useEffect(() => {
    let mounted = true
    const applyPalette = (colors: TerminalColors) => {
      if (mounted) setSequence(hostTerminalPaletteSequence(colors))
    }
    renderer.on(CliRenderEvents.PALETTE, applyPalette)
    void renderer
      .getPalette({ size: 16 })
      .then(applyPalette)
      .catch(() => {})
    return () => {
      mounted = false
      renderer.off(CliRenderEvents.PALETTE, applyPalette)
    }
  }, [renderer])
  return sequence
}
