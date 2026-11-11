import { translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import type { HttpSourceMode } from "../model/source-mode"

export function HttpCollectionEmpty({
  query,
  sourceMode,
  contentWidth,
}: {
  query: string
  sourceMode: HttpSourceMode
  contentWidth: number
}) {
  const message = query
    ? "Nenhum request corresponde à busca."
    : sourceMode === "postman"
      ? "Nenhuma coleção neste workspace."
      : "Nenhum arquivo .http ou .rest no projeto."
  return <text content={truncateDisplay(translateUi(message), contentWidth)} fg={COLORS.muted} />
}
