export const STARTUP_WORDMARK = "Tuiminal"

export const STARTUP_ANIMATION_TIMING = {
  blockDuration: 260,
  blockStarts: [0, 260, 520, 780],
  wordStart: 1080,
  wordDuration: 240,
  exitStart: 1500,
  exitDuration: 220,
  total: 1720,
} as const

export type StartupLogoBlockId = "top" | "left" | "rightTop" | "rightBottom"

export type StartupLogoBlockFrame = {
  id: StartupLogoBlockId
  left: number
  top: number
  width: number
  height: number
  visible: boolean
  settled: boolean
  rounded: boolean
}

export type StartupAnimationFrame = {
  blocks: StartupLogoBlockFrame[]
  compact: boolean
  complete: boolean
  opacity: number
  word: string
  wordLeft: number
  wordTop: number
}

type LogoLayout = {
  compact: boolean
  logoWidth: number
  totalHeight: number
  wordWidth: number
  wordOffsetTop: number
  rounded: boolean
  blocks: Array<Pick<StartupLogoBlockFrame, "id" | "left" | "top" | "width" | "height">>
}

const FULL_LAYOUT: LogoLayout = {
  compact: false,
  logoWidth: 36,
  totalHeight: 18,
  wordWidth: 30,
  wordOffsetTop: 16,
  rounded: true,
  blocks: [
    { id: "top", left: 0, top: 0, width: 36, height: 4 },
    { id: "left", left: 8, top: 5, width: 9, height: 9 },
    { id: "rightTop", left: 20, top: 5, width: 9, height: 4 },
    { id: "rightBottom", left: 20, top: 10, width: 9, height: 4 },
  ],
}

const COMPACT_LAYOUT: LogoLayout = {
  compact: true,
  logoWidth: 20,
  totalHeight: 12,
  wordWidth: STARTUP_WORDMARK.length,
  wordOffsetTop: 11,
  rounded: false,
  blocks: [
    { id: "top", left: 0, top: 0, width: 20, height: 2 },
    { id: "left", left: 4, top: 3, width: 5, height: 6 },
    { id: "rightTop", left: 11, top: 3, width: 5, height: 3 },
    { id: "rightBottom", left: 11, top: 7, width: 5, height: 2 },
  ],
}

const MINIMAL_LAYOUT: LogoLayout = {
  compact: true,
  logoWidth: 14,
  totalHeight: 8,
  wordWidth: STARTUP_WORDMARK.length,
  wordOffsetTop: 7,
  rounded: false,
  blocks: [
    { id: "top", left: 0, top: 0, width: 14, height: 1 },
    { id: "left", left: 3, top: 2, width: 3, height: 4 },
    { id: "rightTop", left: 8, top: 2, width: 3, height: 2 },
    { id: "rightBottom", left: 8, top: 5, width: 3, height: 1 },
  ],
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

function easeOutBounce(progress: number) {
  const value = clamp(progress)
  const factor = 7.5625
  const boundary = 2.75
  if (value < 1 / boundary) return factor * value * value
  if (value < 2 / boundary) {
    const shifted = value - 1.5 / boundary
    return factor * shifted * shifted + 0.75
  }
  if (value < 2.5 / boundary) {
    const shifted = value - 2.25 / boundary
    return factor * shifted * shifted + 0.9375
  }
  const shifted = value - 2.625 / boundary
  return factor * shifted * shifted + 0.984375
}

function layoutFor(width: number, height: number) {
  if (width >= 52 && height >= 20) return FULL_LAYOUT
  if (width >= 24 && height >= 13) return COMPACT_LAYOUT
  return MINIMAL_LAYOUT
}

export function createStartupAnimationFrame(
  elapsedMs: number,
  requestedWidth: number,
  requestedHeight: number,
): StartupAnimationFrame {
  const elapsed = Math.max(0, elapsedMs)
  const width = Math.max(1, Math.floor(requestedWidth))
  const height = Math.max(1, Math.floor(requestedHeight))
  const layout = layoutFor(width, height)
  const originLeft = Math.max(0, Math.floor((width - layout.logoWidth) / 2))
  const originTop = Math.max(0, Math.floor((height - layout.totalHeight) / 2))

  const blocks = layout.blocks.map((block, index): StartupLogoBlockFrame => {
    const start = STARTUP_ANIMATION_TIMING.blockStarts[index] ?? 0
    const progress = clamp((elapsed - start) / STARTUP_ANIMATION_TIMING.blockDuration)
    const targetTop = originTop + block.top
    const startTop = -block.height
    return {
      ...block,
      left: originLeft + block.left,
      top: Math.round(startTop + (targetTop - startTop) * easeOutBounce(progress)),
      visible: elapsed >= start,
      settled: progress >= 1,
      rounded: layout.rounded,
    }
  })

  const wordProgress = clamp(
    (elapsed - STARTUP_ANIMATION_TIMING.wordStart) / STARTUP_ANIMATION_TIMING.wordDuration,
  )
  const visibleLetters = Math.min(
    STARTUP_WORDMARK.length,
    Math.floor(wordProgress * (STARTUP_WORDMARK.length + 1)),
  )
  const exitProgress = clamp(
    (elapsed - STARTUP_ANIMATION_TIMING.exitStart) / STARTUP_ANIMATION_TIMING.exitDuration,
  )

  return {
    blocks,
    compact: layout.compact,
    complete: elapsed >= STARTUP_ANIMATION_TIMING.total,
    opacity: (1 - exitProgress) ** 2,
    word: STARTUP_WORDMARK.slice(0, visibleLetters),
    wordLeft: Math.max(0, Math.floor((width - layout.wordWidth) / 2)),
    wordTop: originTop + layout.wordOffsetTop,
  }
}
