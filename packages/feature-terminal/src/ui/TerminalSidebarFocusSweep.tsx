import { useCallback, useEffect, useRef, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"

const FOCUS_SWEEP_FRAMES = 10

export function terminalSidebarFocusSweep(width: number, height: number, frame: number) {
  const innerWidth = Math.max(1, width - 1)
  const innerHeight = Math.max(1, height)
  const sweepWidth = Math.max(4, Math.min(8, Math.floor(innerWidth * 0.24)))
  const diagonalShift = Math.max(
    2,
    Math.min(Math.floor(innerWidth * 0.5), Math.ceil(innerHeight * 0.5)),
  )
  const progress = Math.max(0, Math.min(FOCUS_SWEEP_FRAMES - 1, frame))
  const baseLeft =
    Math.round((progress * (innerWidth + sweepWidth + diagonalShift)) / (FOCUS_SWEEP_FRAMES - 1)) -
    sweepWidth -
    diagonalShift
  return Array.from({ length: innerHeight }, (_, top) => {
    const rowProgress = innerHeight === 1 ? 1 : 1 - top / (innerHeight - 1)
    const left = baseLeft + Math.round(rowProgress * diagonalShift)
    return {
      top,
      left,
      width: sweepWidth,
      coreLeft: left + Math.max(1, sweepWidth - 2),
    }
  })
}

export function useTerminalSidebarFocusSweep() {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [frame, setFrame] = useState<number | null>(null)
  const start = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    if (process.env.TUIMINAL_TEST_STATIC_LOADERS === "1") {
      timer.current = null
      setFrame(null)
      return
    }
    setFrame(0)
    timer.current = setInterval(() => {
      setFrame((current) => {
        if (current === null || current >= FOCUS_SWEEP_FRAMES - 1) {
          if (timer.current) clearInterval(timer.current)
          timer.current = null
          return null
        }
        return current + 1
      })
    }, 40)
  }, [])
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
    },
    [],
  )
  return { frame, start }
}

export function TerminalSidebarFocusSweep({
  width,
  height,
  frame,
}: {
  width: number
  height: number
  frame: number | null
}) {
  if (frame === null) return null
  const segments = terminalSidebarFocusSweep(width, height, frame)
  return (
    <box
      id="terminal-sidebar-focus-sweep"
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
    >
      {segments.flatMap((segment) => [
        <box
          key={`band-${segment.top}`}
          position="absolute"
          top={segment.top}
          left={segment.left}
          width={segment.width}
          height={1}
          backgroundColor={COLORS.focus}
          opacity={0.14}
        />,
        <box
          key={`core-${segment.top}`}
          position="absolute"
          top={segment.top}
          left={segment.coreLeft}
          width={1}
          height={1}
          backgroundColor={COLORS.focus}
          opacity={0.28}
        />,
      ])}
    </box>
  )
}
