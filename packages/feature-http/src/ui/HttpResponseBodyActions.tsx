import type { InputRenderable } from "@opentui/core"
import type { RefObject } from "react"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpDocumentState } from "../model/types"

export function HttpResponseBodyActions({
  presentation,
  jsonTreeActive,
  onChange,
  jsonPathRef,
}: {
  presentation: HttpDocumentState["responsePresentation"]
  jsonTreeActive: boolean
  onChange: (patch: Partial<HttpDocumentState["responsePresentation"]>) => void
  jsonPathRef: RefObject<InputRenderable | null>
}) {
  const nextFold = presentation.foldDepth === null ? 2 : presentation.foldDepth === 2 ? 1 : null
  return (
    <>
      {jsonTreeActive ? null : (
        <InlineButton
          label="Wrap"
          accent={COLORS.http}
          active={presentation.wrap}
          onPress={() => onChange({ wrap: !presentation.wrap })}
        />
      )}
      <InlineButton
        label="Linhas"
        accent={COLORS.http}
        active={presentation.lineNumbers}
        onPress={() => onChange({ lineNumbers: !presentation.lineNumbers })}
      />
      <InlineButton
        label={presentation.foldDepth === null ? "Fold" : `Fold ${presentation.foldDepth}`}
        accent={COLORS.http}
        active={presentation.foldDepth !== null}
        onPress={() => onChange({ foldDepth: nextFold })}
      />
      <InlineButton
        label="JSONPath"
        accent={COLORS.http}
        active={presentation.jsonPathOpen}
        onPress={() => {
          onChange({ jsonPathOpen: !presentation.jsonPathOpen })
          setTimeout(() => jsonPathRef.current?.focus(), 0)
        }}
      />
    </>
  )
}
