import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { BRAND_COLOR } from "@xupon/tuiminal-core/ui/brand"

/** Brand blue means every keyboard scope is active; muted means at least one is not. */
export function terminalShortcutColor(...activeScopes: boolean[]) {
  return activeScopes.every(Boolean) ? BRAND_COLOR : COLORS.muted
}
