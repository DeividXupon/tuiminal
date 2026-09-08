import { useCallback, useState } from "react"
import { GitConfigurationModal, type GitConfigurationTab } from "../../features/git"
import { MountWhen } from "../../shared/ui/MountWhen"

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
