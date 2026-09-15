import { useEffect, useState } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import type { FeatureId } from "./model"
import {
  FEATURE_PREVIEW_INTERVAL,
  FEATURE_PREVIEW_STEPS,
  featurePreviewFrame,
} from "./presentation"

export function FeaturePreview({
  id,
  compact,
  paused,
  step: controlledStep,
}: {
  id: FeatureId
  compact: boolean
  paused: boolean
  /** Deterministic frame for documentation captures. */
  step?: number | undefined
}) {
  const [step, setStep] = useState(0)
  // One timer belongs to the visible preview; selection changes retire its old clock.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Restart the illustration when the selected feature changes.
  useEffect(() => {
    setStep(0)
    if (paused || controlledStep !== undefined) return
    const timer = setInterval(
      () => setStep((value) => (value + 1) % FEATURE_PREVIEW_STEPS),
      FEATURE_PREVIEW_INTERVAL,
    )
    return () => clearInterval(timer)
  }, [id, paused, controlledStep])
  return (
    <box
      id="feature-preview"
      style={{
        width: compact ? "100%" : 36,
        height: compact ? 2 : "100%",
        flexShrink: 0,
        paddingLeft: compact ? 0 : 2,
        border: compact ? [] : ["left"],
        borderColor: COLORS.border,
        justifyContent: compact ? "flex-start" : "center",
      }}
    >
      <text
        id="feature-preview-animation"
        content={featurePreviewFrame(id, controlledStep ?? step, compact)}
        style={{ fg: BRAND_COLOR, height: compact ? 2 : 9, wrapMode: "none" }}
      />
    </box>
  )
}
