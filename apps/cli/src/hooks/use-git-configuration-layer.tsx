import { useCallback, useState } from "react"
import type { GitConfigurationTab } from "@xupon/tuiminal-feature-git"
import { GitConfigurationModal } from "../features/components"
import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"

export function useGitConfigurationLayer() {
  const [open, setOpen] = useState(false)
  const [initialTab, setInitialTab] = useState<GitConfigurationTab>("diffs")
  const [revision, setRevision] = useState(0)
  const [localRevision, setLocalRevision] = useState(0)
  const openModal = useCallback((tab: GitConfigurationTab = "diffs") => {
    setInitialTab(tab)
    setOpen(true)
  }, [])
  return {
    open,
    revision,
    localRevision,
    openModal,
    modal: (
      <MountWhen when={open}>
        <GitConfigurationModal
          open
          initialTab={initialTab}
          onClose={() => setOpen(false)}
          onChanged={(change) => {
            if (change === "local") setLocalRevision((current) => current + 1)
            else setRevision((current) => current + 1)
          }}
        />
      </MountWhen>
    ),
  }
}
