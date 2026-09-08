import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { type ComponentType, createElement, useCallback, useEffect, useState } from "react"
import { COLORS } from "../../core/settings/theme"
import { BRAND_COLOR } from "../../shared/ui/brand"
import {
  createStartupAnimationFrame,
  STARTUP_ANIMATION_TIMING,
  type StartupLogoBlockFrame,
} from "../model/startup-animation"

const FRAME_INTERVAL_MS = 32

function LogoBlock({ block }: { block: StartupLogoBlockFrame }) {
  if (!block.visible) return null
  return (
    <box
      id={`startup-logo-block-${block.id}`}
      style={{
        position: "absolute",
        left: block.left,
        top: block.top,
        width: block.width,
        height: block.height,
        flexShrink: 0,
        backgroundColor: BRAND_COLOR,
        ...(block.rounded
          ? {
              border: true,
              borderStyle: "rounded",
              borderColor: BRAND_COLOR,
            }
          : {}),
      }}
    />
  )
}

export function StartupAnimationFrame({
  elapsedMs,
  width,
  height,
  onSkip,
}: {
  elapsedMs: number
  width: number
  height: number
  onSkip?: () => void
}) {
  const frame = createStartupAnimationFrame(elapsedMs, width, height)
  return (
    <box
      id="startup-animation"
      {...(onSkip ? { onMouseDown: onSkip } : {})}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: COLORS.canvas,
        opacity: frame.opacity,
      }}
    >
      {frame.blocks.map((block) => (
        <LogoBlock key={block.id} block={block} />
      ))}
      {frame.word ? (
        frame.compact ? (
          <text
            id="startup-wordmark"
            content={frame.word}
            style={{
              position: "absolute",
              left: frame.wordLeft,
              top: frame.wordTop,
              fg: COLORS.text,
            }}
          />
        ) : (
          <ascii-font
            id="startup-wordmark"
            text={frame.word}
            font="tiny"
            color={COLORS.text}
            backgroundColor={COLORS.canvas}
            selectable={false}
            style={{ position: "absolute", left: frame.wordLeft, top: frame.wordTop }}
          />
        )
      ) : null}
    </box>
  )
}

export function StartupAnimation({
  width,
  height,
  onComplete,
}: {
  width: number
  height: number
  onComplete: () => void
}) {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAt = performance.now()
    const interval = setInterval(() => {
      const elapsed = performance.now() - startedAt
      if (elapsed >= STARTUP_ANIMATION_TIMING.total) {
        clearInterval(interval)
        onComplete()
        return
      }
      setElapsedMs(elapsed)
    }, FRAME_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <StartupAnimationFrame
      elapsedMs={elapsedMs}
      width={width}
      height={height}
      onSkip={onComplete}
    />
  )
}

export function withStartupAnimation<Props extends object>(Component: ComponentType<Props>) {
  return function StartupAnimatedApplication(props: Props) {
    const terminal = useTerminalDimensions()
    const [open, setOpen] = useState(() => process.env.TUIMINAL_TEST_SKIP_STARTUP !== "1")
    const close = useCallback(() => setOpen(false), [])

    useKeyboard((key) => {
      if (!open) return
      key.preventDefault()
      key.stopPropagation()
      if (["escape", "enter", "return", "space"].includes(key.name)) close()
    })

    if (!open) return createElement(Component, props)
    return <StartupAnimation width={terminal.width} height={terminal.height} onComplete={close} />
  }
}
