import type { TmuxPaneTarget } from "../model/tmux"
import {
  fitTmuxLayout,
  formatTmuxLayout,
  parseTmuxLayout,
  tmuxLayoutPanes,
  type TmuxLayout,
  type TmuxPaneSize,
} from "../model/tmux-layout"
import { runTmux } from "./tmux-command"
import { registerTerminalResource } from "./terminal-resources"
import { TerminalRetirementError } from "./terminal-lifecycle"
import {
  inspectTmuxMirrorWindow as inspect,
  isTmuxSidebarOnlyChange as sidebarOnlyChange,
  sameTmuxLayoutPanes as sameLayoutPanes,
  sameTmuxMirrorPanes as samePanes,
  requestedTmuxMirrorLayout,
  tmuxLayoutPadding as padding,
  tmuxMirrorFingerprint as fingerprint,
  type TmuxMirrorSnapshot as Snapshot,
} from "./tmux-mirror-state"

const VISIBILITY_INTERVAL = 150
type Request = TmuxPaneSize & { pane: string }
const windows = new Map<string, MirrorWindowSize>()
const missing = (error: unknown) =>
  /can't find (?:window|pane)|no server running|No such file/i.test(String(error))

/** One reversible size owner per source window, shared by its mirrored panes. */
class MirrorWindowSize {
  readonly requests = new Map<symbol, Request>()
  closed = false
  private pending = Promise.resolve()
  private stopping: Promise<void> | undefined
  private dirty = false
  private applied: Snapshot | undefined
  private disabled = false
  private suspended = false
  private initialVisibleChecked = false
  private revision = 0
  private appliedRevision = 0
  private nextVisibilityCheck = 0
  private tree: TmuxLayout
  private rowPadding: Map<string, number>
  private sidebarRestoreLayout: TmuxLayout | undefined
  private release: () => void

  constructor(
    readonly socket: string,
    private original: Snapshot,
    private key: string,
  ) {
    this.tree = parseTmuxLayout(original.layout)
    this.rowPadding = padding(this.tree, original)
    if (original.zoomed) padding(parseTmuxLayout(original.visible), original, this.rowPadding)
    // Resizing Tuiminal's own containing window would feed back into its viewport.
    this.disabled =
      socket === process.env.TMUX?.split(",")[0] &&
      tmuxLayoutPanes(parseTmuxLayout(original.layout)).includes(process.env.TMUX_PANE ?? "")
    this.suspended = original.visibleToClient
    this.initialVisibleChecked = !original.visibleToClient
    this.release = registerTerminalResource({ stop: () => this.stop() })
  }

  private enqueue(operation: () => Promise<void>) {
    const next = this.pending.then(operation)
    this.pending = next.catch(() => {})
    return next
  }

  update() {
    this.revision++
    return this.enqueue(() => this.reconcile())
  }

  syncVisibility(force = false) {
    const now = Date.now()
    if (!force && now < this.nextVisibilityCheck) return this.pending
    this.nextVisibilityCheck = now + VISIBILITY_INTERVAL
    return this.enqueue(() => this.reconcile())
  }

  private async reconcile() {
    if (this.closed || this.disabled) return
    const current = await inspect(this.socket, this.original.id)
    if (!(await this.resumeHiddenWindow(current))) return
    if (await this.suspendVisibleWindow(current)) return
    if (!this.acceptHiddenWindow(current)) return
    if (this.appliedRevision === this.revision) return
    await this.applyRequestedLayout(current)
  }

  private async resumeHiddenWindow(current: Snapshot) {
    if (!this.suspended) return true
    if (current.visibleToClient) {
      await this.repairInitialVisibleWindow(current)
      this.initialVisibleChecked = true
      return false
    }
    this.rebase(current)
    this.suspended = false
    this.appliedRevision = -1
    return true
  }

  private async repairInitialVisibleWindow(current: Snapshot) {
    // Older Tuiminal versions could leave a pinned source at the mirror's
    // manual dimensions. Repair that state once without treating every
    // user-owned manual window as ours.
    if (
      this.initialVisibleChecked ||
      current.mode !== "manual" ||
      !current.panes.some((pane) => pane.sidebar)
    )
      return
    this.original = { ...this.original, mode: null }
    await this.restore(current, { preserveLayout: true, visible: true })
    this.rebase(await inspect(this.socket, this.original.id))
    this.suspended = true
  }

  private async suspendVisibleWindow(current: Snapshot) {
    if (!current.visibleToClient) return false
    if (this.applied && sidebarOnlyChange(current, this.applied)) this.adoptSidebarLayout(current)
    const restored = await this.restoreVisibleWindow(current)
    if (restored) {
      this.suspended = true
      this.initialVisibleChecked = true
    }
    return true
  }

  private async restoreVisibleWindow(current: Snapshot) {
    if (this.dirty && this.sidebarRestoreLayout) {
      await this.restore(current, { preserveLayout: true, visible: true })
      this.rebase(await inspect(this.socket, this.original.id))
      return true
    }
    const topologyChanged = Boolean(this.applied && !samePanes(current, this.applied))
    const sizeStillOwned = Boolean(
      this.applied &&
        current.width === this.applied.width &&
        current.height === this.applied.height &&
        current.mode === this.applied.mode &&
        current.effectiveMode === this.applied.effectiveMode,
    )
    if (this.dirty && topologyChanged && sizeStillOwned) {
      await this.restore(current, { preserveLayout: true, visible: true })
      return true
    }
    if (!this.stillOwned(current)) return false
    if (this.dirty) await this.restore(current, { visible: true })
    return true
  }

  private acceptHiddenWindow(current: Snapshot) {
    if (this.applied && sidebarOnlyChange(current, this.applied)) {
      this.adoptSidebarLayout(current)
      return true
    }
    return this.stillOwned(current)
  }

  private async applyRequestedLayout(current: Snapshot) {
    const revision = this.revision
    const { layout, formatted, zoomedPane } = requestedTmuxMirrorLayout(
      this.tree,
      this.rowPadding,
      this.original,
      this.requests.values(),
    )
    if (
      current.layout === formatted &&
      current.width === layout.width &&
      current.height === layout.height
    ) {
      this.appliedRevision = revision
      return
    }
    this.dirty = true
    // A timed-out command can still have changed the window. Keep restoration
    // owned even when we cannot collect the post-command snapshot.
    this.applied = undefined
    const args = ["-S", this.socket]
    if (zoomedPane) args.push("resize-pane", "-Z", "-t", zoomedPane, ";")
    args.push(
      "resize-window",
      "-t",
      this.original.id,
      "-x",
      String(layout.width),
      "-y",
      String(layout.height),
    )
    args.push(";", "select-layout", "-t", this.original.id, formatted)
    if (zoomedPane) args.push(";", "resize-pane", "-Z", "-t", zoomedPane)
    await runTmux(args)
    this.applied = await inspect(this.socket, this.original.id)
    this.appliedRevision = revision
  }

  private rebase(snapshot: Snapshot) {
    this.original = snapshot
    this.tree = parseTmuxLayout(snapshot.layout)
    this.rowPadding = padding(this.tree, snapshot)
    if (snapshot.zoomed) padding(parseTmuxLayout(snapshot.visible), snapshot, this.rowPadding)
    this.sidebarRestoreLayout = undefined
    this.applied = undefined
    this.dirty = false
  }

  private adoptSidebarLayout(snapshot: Snapshot) {
    const tree = parseTmuxLayout(snapshot.layout)
    const rowPadding = padding(tree, snapshot)
    const originalContentSizes = new Map<string, TmuxPaneSize>()
    for (const pane of this.original.panes) {
      if (pane.sidebar || !snapshot.panes.some((candidate) => candidate.id === pane.id)) continue
      originalContentSizes.set(pane.id, { columns: pane.columns, rows: pane.rows })
    }
    this.sidebarRestoreLayout = fitTmuxLayout(tree, originalContentSizes, rowPadding)
    this.tree = tree
    this.rowPadding = rowPadding
    this.applied = snapshot
    this.appliedRevision = -1
  }

  private stillOwned(current: Snapshot) {
    const expected = this.applied ?? (this.dirty ? undefined : this.original)
    if (expected && fingerprint(current) !== fingerprint(expected)) {
      // A user rearranged/resized the source. Never overwrite that newer layout.
      this.disabled = true
      this.dirty = false
      return false
    }
    return true
  }

  stop() {
    if (this.stopping) return this.stopping
    this.closed = true
    this.stopping = this.enqueue(async () => {
      try {
        if (this.dirty)
          await this.restore(undefined, {
            sidebarLayout: Boolean(this.sidebarRestoreLayout),
          })
      } catch (error) {
        if (!missing(error)) throw error
      }
      this.release()
      if (windows.get(this.key) === this) windows.delete(this.key)
    }).catch((error) => {
      this.stopping = undefined
      throw error
    })
    return this.stopping
  }

  private sizeOptionArgs() {
    const args = [
      "set-option",
      this.original.mode === null ? "-wu" : "-w",
      "-t",
      this.original.id,
      "window-size",
    ]
    if (this.original.mode !== null) args.push(this.original.mode)
    return args
  }

  private async restore(
    snapshot?: Snapshot,
    options: { preserveLayout?: boolean; sidebarLayout?: boolean; visible?: boolean } = {},
  ) {
    const current = snapshot ?? (await inspect(this.socket, this.original.id))
    const sidebarLayout = options.sidebarLayout ? this.sidebarRestoreLayout : undefined
    if (!options.preserveLayout && !this.stillOwned(current)) return
    // Also protect newly created/moved panes after an uncertain resize failure.
    if (
      !options.preserveLayout &&
      !(sidebarLayout ? sameLayoutPanes(current, sidebarLayout) : samePanes(current, this.original))
    )
      return
    this.applied = undefined
    if (!options.preserveLayout) {
      await runTmux([
        "-S",
        this.socket,
        "resize-window",
        "-t",
        this.original.id,
        "-x",
        String(sidebarLayout?.width ?? this.original.width),
        "-y",
        String(sidebarLayout?.height ?? this.original.height),
        ";",
        "select-layout",
        "-t",
        this.original.id,
        sidebarLayout ? formatTmuxLayout(sidebarLayout) : this.original.layout,
        ";",
        ...this.sizeOptionArgs(),
      ])
      const active = this.original.panes.find((pane) => pane.active)
      if (this.original.zoomed && active && !(await inspect(this.socket, this.original.id)).zoomed)
        await runTmux(["-S", this.socket, "resize-pane", "-Z", "-t", active.id])
    }
    if (options.visible) {
      await runTmux([
        "-S",
        this.socket,
        "resize-window",
        this.original.effectiveMode === "smallest" ? "-a" : "-A",
        "-t",
        this.original.id,
        ";",
        ...this.sizeOptionArgs(),
      ])
    } else if (options.preserveLayout) {
      await runTmux([
        "-S",
        this.socket,
        "resize-window",
        "-t",
        this.original.id,
        "-x",
        String(this.original.width),
        "-y",
        String(this.original.height),
        ";",
        ...this.sizeOptionArgs(),
      ])
    }
    this.dirty = false
  }
}

export type TmuxMirrorSize = {
  resize: (columns: number, rows: number) => Promise<void>
  syncVisibility: (force?: boolean) => Promise<void>
  stop: () => Promise<void>
}

export async function fitTmuxMirror(
  target: TmuxPaneTarget,
  columns: number,
  rows: number,
): Promise<TmuxMirrorSize> {
  const snapshot = await inspect(target.socket, target.paneId)
  const key = `${target.socket}\0${snapshot.id}`
  let window = windows.get(key)
  if (window?.closed) {
    await window.stop()
    return fitTmuxMirror(target, columns, rows)
  }
  if (!window) {
    window = new MirrorWindowSize(target.socket, snapshot, key)
    windows.set(key, window)
  }
  const owner = window
  const token = Symbol(target.paneId)
  let stopped = false
  let stopping: Promise<void> | undefined
  const resize = async (width: number, height: number) => {
    if (stopped || owner.closed) return
    owner.requests.set(token, {
      pane: target.paneId,
      columns: Math.max(1, Math.floor(width)),
      rows: Math.max(1, Math.floor(height)),
    })
    await owner.update()
  }
  const stop = () => {
    if (stopping) return stopping
    stopped = true
    owner.requests.delete(token)
    stopping = (owner.requests.size ? owner.update() : owner.stop()).catch((error) => {
      stopping = undefined
      throw error
    })
    return stopping
  }
  try {
    await resize(columns, rows)
    return { resize, syncVisibility: (force) => owner.syncVisibility(force), stop }
  } catch (error) {
    try {
      await stop()
    } catch (cleanup) {
      throw new TerminalRetirementError(new AggregateError([error, cleanup]), stop)
    }
    throw error
  }
}
