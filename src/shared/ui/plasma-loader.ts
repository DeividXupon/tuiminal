import { RGBA, StyledText, type TextChunk } from "@opentui/core"

const PLASMA_CHARACTERS = " .:-=+*#%@"
const MAX_PLASMA_WIDTH = 320
const MAX_PLASMA_HEIGHT = 100

export type PlasmaRun = {
  text: string
  tone: number
}

export type PlasmaFrame = {
  width: number
  height: number
  runs: PlasmaRun[]
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

function cellNoise(column: number, row: number) {
  let value = Math.imul(column + 1, 374761393) ^ Math.imul(row + 1, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff
}

/**
 * Independent terminal plasma field. It intentionally returns runs instead of
 * one renderable per cell so animated loading surfaces remain inexpensive.
 */
export function createPlasmaFrame(
  requestedWidth: number,
  requestedHeight: number,
  frame: number,
  presence = 1,
): PlasmaFrame {
  const width = Math.max(0, Math.min(MAX_PLASMA_WIDTH, Math.floor(requestedWidth)))
  const height = Math.max(0, Math.min(MAX_PLASMA_HEIGHT, Math.floor(requestedHeight)))
  if (!width || !height) return { width, height, runs: [] }

  const visiblePresence = clamp(presence)
  const time = frame * 0.105
  const horizontalScale = Math.max(8, width * 0.22)
  const verticalScale = Math.max(4, height * 0.46)
  const orbitOffsetX = Math.sin(time * 0.37) * 0.9
  const orbitOffsetY = Math.cos(time * 0.29) * 0.65
  const diagonalPhase = Math.sin(time * 0.61)
  // Column waves repeat on every row; compute them once per frame.
  const columns = Array.from({ length: width }, (_, column) => {
    const x = (column - width / 2) / horizontalScale
    return { column, x, orbitX: x + orbitOffsetX, wave: Math.sin(x * 1.55 + time * 1.31) * 0.29 }
  })
  const runs: PlasmaRun[] = []

  const append = (text: string, tone: number) => {
    const previous = runs[runs.length - 1]
    if (previous?.tone === tone) previous.text += text
    else runs.push({ text, tone })
  }

  for (let row = 0; row < height; row += 1) {
    const y = (row - height / 2) / verticalScale
    const orbitY = y + orbitOffsetY
    const verticalWave = Math.sin(y * 2.05 - time * 0.87) * 0.24
    for (const { column, x, orbitX, wave } of columns) {
      const radius = Math.hypot(orbitX, orbitY)
      const diagonal = x * 0.78 - y * 1.12
      const field =
        wave +
        verticalWave +
        Math.sin(radius * 2.72 - time * 1.43) * 0.31 +
        Math.sin(diagonal + diagonalPhase) * 0.16
      const energy = clamp((field + 1) / 2)
      const survives = cellNoise(column, row) <= visiblePresence * (0.68 + energy * 0.32)
      const characterIndex = survives
        ? Math.min(PLASMA_CHARACTERS.length - 1, Math.floor(energy * PLASMA_CHARACTERS.length))
        : 0
      const tone = characterIndex === 0 ? 0 : Math.min(3, 1 + Math.floor(energy * 3))
      append(PLASMA_CHARACTERS[characterIndex] ?? " ", tone)
    }
    if (row < height - 1) append("\n", 0)
  }

  return { width, height, runs }
}

export function plasmaExitPresence(elapsedMs: number, durationMs = 220) {
  const progress = clamp(elapsedMs / Math.max(1, durationMs))
  return (1 - progress) ** 2
}

function blendHex(background: string, foreground: string, ratio: number) {
  const base = RGBA.fromHex(background).toInts()
  const accent = RGBA.fromHex(foreground).toInts()
  const amount = clamp(ratio)
  return RGBA.fromInts(
    Math.round(base[0] + (accent[0] - base[0]) * amount),
    Math.round(base[1] + (accent[1] - base[1]) * amount),
    Math.round(base[2] + (accent[2] - base[2]) * amount),
  )
}

export function plasmaStyledText(frame: PlasmaFrame, accent: string, background: string) {
  const foregrounds = [
    RGBA.fromHex(background),
    blendHex(background, accent, 0.24),
    blendHex(background, accent, 0.48),
    blendHex(background, accent, 0.76),
  ]
  const bg = RGBA.fromHex(background)
  const chunks: TextChunk[] = frame.runs.map((run) => ({
    __isChunk: true,
    text: run.text,
    fg: foregrounds[run.tone] ?? RGBA.fromHex(background),
    bg,
  }))
  return new StyledText(chunks)
}
