import { RGBA, StyledText, type TextChunk } from "@opentui/core"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { POSTMAN_LOGO, POSTMAN_LOGO_COMPACT } from "./http-brand-art"

function postmanArt(compact: boolean) {
  const pixels = compact ? POSTMAN_LOGO_COMPACT : POSTMAN_LOGO
  const chunks: TextChunk[] = []
  const colors: Record<string, RGBA> = {
    o: RGBA.fromHex("#FF6C37"),
    w: RGBA.fromHex("#FFFFFF"),
  }
  for (let y = 0; y < pixels.length; y += 2) {
    const upper = pixels[y] ?? ""
    const lower = pixels[y + 1] ?? ""
    for (let x = 0; x < upper.length; x++) {
      const top = colors[upper[x] ?? ""]
      const bottom = colors[lower[x] ?? ""]
      chunks.push(logoPixel(top, bottom))
    }
    if (y + 2 < pixels.length) chunks.push({ __isChunk: true, text: "\n" })
  }
  return new StyledText(chunks)
}

function logoPixel(top: RGBA | undefined, bottom: RGBA | undefined): TextChunk {
  if (!top)
    return bottom ? { __isChunk: true, text: "▄", fg: bottom } : { __isChunk: true, text: " " }
  return { __isChunk: true, text: "▀", fg: top, ...(bottom ? { bg: bottom } : {}) }
}

function TuiminalMark({ compact }: { compact: boolean }) {
  const width = compact ? 14 : 24
  const height = compact ? 7 : 12
  const unit = compact ? 1 : 2
  return (
    <box style={{ width, height, position: "relative" }}>
      <box
        style={{
          position: "absolute",
          left: 0,
          top: unit,
          width,
          height: unit,
          backgroundColor: BRAND_COLOR,
        }}
      />
      <box
        style={{
          position: "absolute",
          left: compact ? 3 : 5,
          top: unit * 3,
          width: compact ? 3 : 6,
          height: unit * 3,
          backgroundColor: BRAND_COLOR,
        }}
      />
      <box
        style={{
          position: "absolute",
          left: compact ? 8 : 14,
          top: unit * 3,
          width: compact ? 3 : 6,
          height: unit,
          backgroundColor: BRAND_COLOR,
        }}
      />
      <box
        style={{
          position: "absolute",
          left: compact ? 8 : 14,
          top: unit * 5,
          width: compact ? 3 : 6,
          height: unit,
          backgroundColor: BRAND_COLOR,
        }}
      />
    </box>
  )
}

const POSTMAN_ART = postmanArt(false)
const POSTMAN_ART_COMPACT = postmanArt(true)

export function HttpEmptyState({
  left,
  width,
  height,
}: {
  left: number
  width: number
  height: number
}) {
  const compact = width < 60 || height < 22
  return (
    <box
      id="http-empty-state"
      style={{
        position: "absolute",
        left,
        top: 0,
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <box style={{ flexDirection: "row", gap: compact ? 4 : 6, flexShrink: 0 }}>
        <box style={{ alignItems: "center", gap: 1 }}>
          <TuiminalMark compact={compact} />
          <text content="Tuiminal" style={{ fg: BRAND_COLOR }} />
        </box>
        <box style={{ alignItems: "center", gap: 1 }}>
          <text content={compact ? POSTMAN_ART_COMPACT : POSTMAN_ART} />
          <text content="Postman" style={{ fg: "#FF6C37" }} />
        </box>
      </box>
      <box style={{ height: compact ? 1 : 2, flexShrink: 0 }} />
      <text content="Escolha uma chamada" style={{ fg: COLORS.text }} />
      {width >= 48 && height >= 18 ? (
        <text
          content="Selecione uma requisição na coleção para começar."
          style={{ fg: COLORS.muted }}
        />
      ) : null}
    </box>
  )
}
