import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { buildHttpResponseTableDocument } from "./http-response-table-document"

export function HttpResponseTableDocument({
  document,
  id,
  selectedLine,
}: {
  document: ReturnType<typeof buildHttpResponseTableDocument>
  id: string
  selectedLine: number | undefined
}) {
  const selected =
    selectedLine === undefined ? undefined : document.plain.split("\n")[selectedLine - 1]
  return (
    <box style={{ width: document.width, height: document.height, flexShrink: 0 }}>
      <text
        id={id}
        content={document.styled}
        wrapMode="none"
        style={{
          width: document.width,
          height: document.height,
          fg: COLORS.text,
          bg: COLORS.canvas,
        }}
      />
      {selected !== undefined && selectedLine !== undefined ? (
        <text
          content={selected}
          wrapMode="none"
          style={{
            position: "absolute",
            top: selectedLine - 1,
            left: 0,
            width: document.width,
            height: 1,
            fg: COLORS.canvas,
            bg: COLORS.http,
          }}
        />
      ) : null}
    </box>
  )
}
