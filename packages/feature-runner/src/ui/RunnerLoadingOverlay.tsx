import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { PlasmaLoadingOverlay } from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"

type RunnerLoadingKind = "commands" | "projects" | "directory"

const LABELS: Record<RunnerLoadingKind, string> = {
  commands: "◐ Detectando scripts…",
  projects: "Procurando repositórios Git no computador…",
  directory: "Abrindo pasta…",
}

export function RunnerLoadingOverlay({
  active,
  kind,
}: {
  active: boolean
  kind: RunnerLoadingKind
}) {
  return <PlasmaLoadingOverlay active={active} label={LABELS[kind]} accent={COLORS.runner} />
}
