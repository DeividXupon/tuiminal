import type { BorderSides } from "@opentui/core"

type TargetRect = { x: number; y: number; width: number; height: number }

function targetOutlineGeometry(target: TargetRect, terminal: { width: number; height: number }) {
  const hasTopSpace = target.y > 0
  const hasRightSpace = target.x + target.width < terminal.width
  const hasBottomSpace = target.y + target.height < terminal.height
  const hasLeftSpace = target.x > 0
  const border: BorderSides[] = []
  if (hasTopSpace) border.push("top")
  if (hasRightSpace) border.push("right")
  if (hasBottomSpace) border.push("bottom")
  if (hasLeftSpace) border.push("left")
  return {
    left: target.x - (hasLeftSpace ? 1 : 0),
    top: target.y - (hasTopSpace ? 1 : 0),
    width: target.width + (hasLeftSpace ? 1 : 0) + (hasRightSpace ? 1 : 0),
    height: target.height + (hasTopSpace ? 1 : 0) + (hasBottomSpace ? 1 : 0),
    border,
  }
}

export function TutorialTargetOutline({
  target,
  terminal,
  accent,
}: {
  target: TargetRect
  terminal: { width: number; height: number }
  accent: string
}) {
  const outline = targetOutlineGeometry(target, terminal)
  return (
    <box
      id="tutorial-target-outline"
      style={{
        position: "absolute",
        left: outline.left,
        top: outline.top,
        width: outline.width,
        height: outline.height,
        border: outline.border,
        borderStyle: "rounded",
        borderColor: accent,
        zIndex: 982,
      }}
    />
  )
}
