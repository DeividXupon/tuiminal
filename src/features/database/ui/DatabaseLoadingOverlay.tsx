import { COLORS } from "../../../core/settings/theme"
import { PlasmaLoadingOverlay } from "../../../shared/ui/PlasmaLoadingOverlay"

export function DatabaseLoadingOverlay({
  catalog,
  rows,
  indexes,
  schema,
  background,
}: {
  catalog: boolean
  rows: boolean
  indexes: boolean
  schema: boolean
  background: string
}) {
  const label = catalog
    ? "◷ CARREGANDO CATÁLOGO"
    : rows
      ? "◷ CONSULTANDO BANCO"
      : indexes
        ? "◷ carregando índices"
        : "◷ carregando schema"
  return (
    <PlasmaLoadingOverlay
      active={catalog || rows || indexes || schema}
      label={label}
      accent={COLORS.database}
      background={background}
    />
  )
}
