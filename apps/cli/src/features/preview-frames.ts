import type { FeatureId } from "./model"

export const FEATURE_PREVIEW_INTERVAL = 120
export const FEATURE_PREVIEW_STEPS = 48
const WIDTH = 29

type Point = readonly [number, number]
type Canvas = string[][]

// Icon motion communicates storage, execution and exchange without mounting real tools.
const ICON_ROWS: Record<FeatureId, readonly string[]> = {
  database: [
    "        .-----------.",
    "       (             )",
    "       |`-----------'|",
    "       |             |",
    "       |-------------|",
    "       |             |",
    "       |-------------|",
    "       |             |",
    "        `-----------'",
  ],
  git: [
    "         ○",
    "         │",
    "         │         ○",
    "         │         │",
    "         ├─────────╯",
    "         │",
    "         │",
    "         ○",
    "",
  ],
  runner: [
    "",
    "          ██▄",
    "          █████▄",
    "          ████████▸",
    "          █████▀",
    "          ██▀",
    "",
    "        ─────────────",
    "",
  ],
  http: [
    "",
    "",
    " .-----.             .-----.",
    " |     |  ────────▷  | ▬ ○ |",
    " '──┬──'             |─────|",
    "   ─┴─    ◁────────  | ▬ ○ |",
    "                     '-----'",
    "",
    "",
  ],
  terminal: [
    "     ╭─────────────────╮",
    "     │ · · ·           │",
    "     ├─────────────────┤",
    "     │                 │",
    "     │   ❯             │",
    "     │                 │",
    "     │                 │",
    "     │                 │",
    "     ╰─────────────────╯",
  ],
}

function dot(canvas: Canvas, x: number, y: number, glyph = "●") {
  const row = canvas[Math.round(y)]
  const column = Math.round(x)
  if (row && column >= 0 && column < WIDTH) row[column] = glyph
}

function travel(canvas: Canvas, path: readonly Point[], progress: number, glyph = "●") {
  const position = (progress % 1) * (path.length - 1)
  const segment = Math.floor(position)
  const fraction = position - segment
  const [x0, y0] = path[segment]!
  const [x1, y1] = path[segment + 1]!
  dot(canvas, x0 + (x1 - x0) * fraction, y0 + (y1 - y0) * fraction, glyph)
}

function storedRecords(progress: number) {
  const step = Math.floor(progress * FEATURE_PREVIEW_STEPS)
  if (step < 30) return Math.floor((step / 30) * 12)
  return step < 36 ? 12 : 48 - step
}

function database(canvas: Canvas, progress: number) {
  // Records accumulate inside the cylinder, hold, then empty for the next cycle.
  const count = storedRecords(progress)
  for (let record = 0; record < count; record++) {
    dot(canvas, 9 + (record % 4) * 3, 7 - Math.floor(record / 4) * 2, "■")
  }
}

function git(canvas: Canvas, progress: number) {
  travel(
    canvas,
    [
      [19, 2],
      [19, 4],
      [9, 4],
      [9, 7],
    ],
    progress,
  )
  dot(canvas, 9, 0, progress < 0.5 ? "◉" : "○")
}

function runnerProgress(progress: number) {
  const step = Math.floor(progress * FEATURE_PREVIEW_STEPS)
  if (step < 6 || step >= 40) return 0
  return Math.min(1, (step - 6) / 24)
}

function runner(canvas: Canvas, progress: number) {
  const completion = runnerProgress(progress)
  if (completion === 1) {
    const check = [
      "",
      "                   ▄█",
      "                 ▄██",
      "         ▄     ▄██",
      "         ██▄ ▄██",
      "           ███",
    ]
    for (const [index, row] of check.entries()) canvas[index] = row.padEnd(WIDTH).split("")
  }
  for (let cell = 0; cell < Math.floor(completion * 13); cell++) dot(canvas, 8 + cell, 7, "━")
}

function exchangePhase(progress: number) {
  const step = Math.floor(progress * FEATURE_PREVIEW_STEPS)
  if (step < 18) return { reply: false, position: step / 17 }
  if (step < 24) return { reply: false, position: 1 }
  if (step < 42) return { reply: true, position: (step - 24) / 17 }
  return { reply: true, position: 1 }
}

function http(canvas: Canvas, progress: number) {
  const { reply, position } = exchangePhase(progress)
  const y = reply ? 5 : 3
  const x = reply ? 18 - Math.round(position * 8) : 10 + Math.round(position * 8)
  dot(canvas, x, y, reply ? "←" : "→")
  if (position > 0) dot(canvas, x + (reply ? 1 : -1), y, "━")
  // The server receives the request before its return arrow starts moving.
  dot(canvas, 25, 3, progress >= 18 / 48 ? "●" : "○")
  dot(canvas, 25, 5, progress >= 24 / 48 ? "●" : "○")
  if (reply && position === 1) dot(canvas, 4, 3, "✓")
}

function terminal(canvas: Canvas, progress: number) {
  dot(canvas, 11, 4, Math.floor(progress * 8) % 2 ? "▌" : "▁")
  dot(canvas, 7 + Math.floor(progress * 3) * 2, 1, "●")
}

function compactFrame(id: FeatureId, progress: number): string {
  const pulse = ["○", "●", "◉"][Math.floor(progress * 3)] ?? "○"
  switch (id) {
    case "database": {
      const records = Math.ceil(storedRecords(progress) / 2)
      return `       .--------.\n       ' ${"■".repeat(records).padEnd(6)} '`
    }
    case "git":
      return `        ${pulse}──╮\n        │  ╰─${progress < 0.5 ? "○" : "●"}`
    case "runner": {
      const completion = runnerProgress(progress)
      const fill = Math.floor(completion * 10)
      return `          ${completion === 1 ? "✓" : "▶"}\n       ${"━".repeat(fill)}${"─".repeat(10 - fill)}`
    }
    case "http": {
      const { reply, position } = exchangePhase(progress)
      const request = "────────▷".split("")
      const response = "◁────────".split("")
      if (reply) response[8 - Math.round(position * 8)] = "←"
      else request[Math.round(position * 8)] = "→"
      return `    □ ${request.join("")} ▤\n      ${response.join("")}`
    }
    case "terminal":
      return `       ╭─${pulse}────╮\n       ╰─❯${Math.floor(progress * 8) % 2 ? "▌" : "▁"}───╯`
  }
}

const ANIMATIONS = { database, git, runner, http, terminal }

// Bounded icon geometry only: no tool modules, commands, records, or external data.
export function featurePreviewFrame(id: FeatureId, step: number, compact: boolean): string {
  const phase = Math.floor(Math.max(0, step)) % FEATURE_PREVIEW_STEPS
  const progress = phase / FEATURE_PREVIEW_STEPS
  if (compact) return compactFrame(id, progress)
  const canvas = ICON_ROWS[id].map((row) => row.padEnd(WIDTH).split(""))
  ANIMATIONS[id](canvas, progress)
  return canvas.map((row) => row.join("")).join("\n")
}
