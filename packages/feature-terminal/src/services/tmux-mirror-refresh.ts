const ACTIVE_DELAY = 33
const IDLE_DELAY = 250

/** One capture at a time; input wakes an idle mirror without queuing stale frames. */
export class TmuxMirrorRefresh {
  private timer: ReturnType<typeof setTimeout> | undefined
  private pending: Promise<void> | undefined
  private closed = false
  private requested = false
  private delay = ACTIVE_DELAY

  constructor(
    private capture: () => Promise<boolean>,
    private onError: () => void,
  ) {}

  start() {
    this.schedule(ACTIVE_DELAY)
  }

  request() {
    if (this.closed) return
    this.delay = ACTIVE_DELAY
    this.requested = true
    if (!this.pending) this.schedule(0)
  }

  stop() {
    this.closed = true
    clearTimeout(this.timer)
    return this.pending ?? Promise.resolve()
  }

  private schedule(delay: number) {
    if (this.closed) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.refresh(), delay)
  }

  private refresh() {
    if (this.closed || this.pending) return
    this.requested = false
    this.pending = this.capture()
      .then((changed) => {
        this.delay = changed ? ACTIVE_DELAY : Math.min(IDLE_DELAY, this.delay * 2)
      })
      .catch(() => {
        this.delay = IDLE_DELAY
        this.onError()
      })
      .finally(() => {
        this.pending = undefined
        this.schedule(this.requested ? 0 : this.delay)
      })
    return this.pending
  }
}
