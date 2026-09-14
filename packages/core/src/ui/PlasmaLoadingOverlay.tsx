import type { BoxRenderable } from "@opentui/core"
import { useCallback, useEffect, useMemo, useState } from "react"
import { COLORS } from "../settings/theme"
import { translateUi } from "../i18n/index"
import { createPlasmaFrame, plasmaExitPresence, plasmaStyledText } from "./plasma-loader"

const FRAME_INTERVAL_MS = 72
const EXIT_DURATION_MS = 220

type Dimensions = { width: number; height: number }

export function PlasmaLoadingOverlay({
  active,
  label,
  detail,
  accent = COLORS.focus,
  background = COLORS.panel,
  id,
  animate,
  top = 0,
  right = 0,
  bottom = 0,
  left = 0,
}: {
  active: boolean
  label: string
  detail?: string
  accent?: string
  background?: string
  id?: string
  animate?: boolean
  top?: number
  right?: number
  bottom?: number
  left?: number
}) {
  const animationEnabled = animate ?? process.env.TUIMINAL_TEST_STATIC_LOADERS !== "1"
  const [visible, setVisible] = useState(active)
  const [presence, setPresence] = useState(active ? 1 : 0)
  const [frame, setFrame] = useState(0)
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 })

  useEffect(() => {
    if (!animationEnabled) return
    if (active) {
      setVisible(true)
      setPresence(1)
      return
    }
    if (!visible) return

    const startedAt = Date.now()
    const fade = () => {
      const elapsed = Date.now() - startedAt
      const nextPresence = plasmaExitPresence(elapsed, EXIT_DURATION_MS)
      setPresence(nextPresence)
      if (elapsed < EXIT_DURATION_MS) return
      setVisible(false)
      clearInterval(interval)
    }
    const interval = setInterval(fade, 32)
    fade()
    return () => clearInterval(interval)
  }, [active, animationEnabled, visible])

  useEffect(() => {
    if (!animationEnabled || !visible) return
    const interval = setInterval(() => setFrame((current) => current + 1), FRAME_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [animationEnabled, visible])

  const measure = useCallback(
    function (this: BoxRenderable) {
      if (!animationEnabled) return
      const next = { width: this.width, height: this.height }
      setDimensions((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      )
    },
    [animationEnabled],
  )

  const renderedPresence = animationEnabled ? presence : active ? 1 : 0
  const renderedVisible = animationEnabled ? visible : active
  const plasma = useMemo(
    () => createPlasmaFrame(dimensions.width, dimensions.height, frame, renderedPresence),
    [dimensions.height, dimensions.width, frame, renderedPresence],
  )
  const content = useMemo(
    () => plasmaStyledText(plasma, accent, background),
    [accent, background, plasma],
  )

  if (!renderedVisible) return null

  return (
    <box
      {...(id ? { id } : {})}
      onSizeChange={measure}
      style={{
        position: "absolute",
        top,
        right,
        bottom,
        left,
        zIndex: 40,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <box
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: background,
          opacity: renderedPresence,
        }}
      >
        <text
          {...(id ? { id: `${id}-pattern` } : {})}
          content={content}
          selectable={false}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: dimensions.width,
            height: dimensions.height,
            wrapMode: "none",
            overflow: "hidden",
            bg: background,
          }}
        />
      </box>
      <box
        {...(id ? { id: `${id}-message` } : {})}
        style={{
          zIndex: 1,
          minWidth: 24,
          maxWidth: "80%",
          alignItems: "center",
          backgroundColor: COLORS.panelRaised,
          border: ["left"],
          borderColor: accent,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <text content={translateUi(label)} style={{ fg: accent, bg: COLORS.panelRaised }} />
        {detail ? (
          <text
            content={translateUi(detail)}
            style={{ fg: COLORS.text, bg: COLORS.panelRaised, wrapMode: "word" }}
          />
        ) : null}
      </box>
    </box>
  )
}
