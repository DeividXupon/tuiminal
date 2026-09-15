import { MountWhen } from "@xupon/tuiminal-core/ui/MountWhen"
import { UnsavedChangesExitModal } from "./UnsavedChangesExitModal"

export function applicationExitLayer(
  exit: { open: boolean; close: () => void; quit: (force?: boolean) => Promise<void> },
  terminal: { width: number; height: number },
) {
  return (
    <MountWhen when={exit.open}>
      <UnsavedChangesExitModal
        open
        terminalWidth={terminal.width}
        terminalHeight={terminal.height}
        onConfirm={() => void exit.quit(true)}
        onClose={exit.close}
      />
    </MountWhen>
  )
}
