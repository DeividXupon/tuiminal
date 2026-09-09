import { COLORS } from "../../../core/settings/theme"
import { PlasmaLoadingOverlay } from "../../../shared/ui/PlasmaLoadingOverlay"

export function DatabaseLoadingOverlay({
  catalog,
  rows,
  indexes,
  schema,
  background,
  id,
  top,
  bottom,
}: {
  catalog: boolean
  rows: boolean
  indexes: boolean
  schema: boolean
  background: string
  id?: string
  top?: number
  bottom?: number
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
      {...(id ? { id } : {})}
      {...(top === undefined ? {} : { top })}
      {...(bottom === undefined ? {} : { bottom })}
      label={label}
      accent={COLORS.database}
      background={background}
    />
  )
}
