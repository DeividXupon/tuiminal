import { RGBA, StyledText } from "@opentui/core"
import type { TextProps } from "@opentui/react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { TerminalRepositoryContext } from "../model/terminal-context"
import type { TerminalContextTag } from "../rendering/terminal-context"
import { TerminalShortcutText } from "./TerminalShortcut"

export function TerminalContextTagText({
  tag,
  context,
  masterKey,
  ...props
}: Omit<TextProps, "content" | "children"> & {
  tag: TerminalContextTag
  context: TerminalRepositoryContext | undefined
  masterKey: string
}) {
  if (tag.kind === "state" && context?.state === "dirty" && context.changes) {
    const { additions, deletions, partial } = context.changes
    return (
      <text
        {...props}
        content={
          new StyledText([
            { __isChunk: true, text: ` +${additions}`, fg: RGBA.fromHex(COLORS.success) },
            { __isChunk: true, text: ` -${deletions}`, fg: RGBA.fromHex(COLORS.danger) },
            { __isChunk: true, text: partial ? " … " : " ", fg: RGBA.fromHex(COLORS.muted) },
          ])
        }
      />
    )
  }
  return (
    <TerminalShortcutText
      {...props}
      content={` ${tag.label} `}
      highlight={tag.kind === "sync"}
      actionKeys={[`[${masterKey}]`]}
    />
  )
}
