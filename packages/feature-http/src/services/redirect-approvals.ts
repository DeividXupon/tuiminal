import type { HttpRedirectApproval, HttpRedirectAuthorizer } from "../model/redirect-policy"

export type PendingHttpRedirect = { id: number; approval: HttpRedirectApproval }
type Pending = PendingHttpRedirect & { finish: (allowed: boolean) => void }

// Six documents, eight collection workers and one download fit below this cap.
export class HttpRedirectApprovalQueue {
  private nextId = 0
  private pending: Pending[] = []
  private listeners = new Set<() => void>()
  private closed = false

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  snapshot = (): PendingHttpRedirect | null => this.pending[0] ?? null
  private changed() {
    for (const listener of this.listeners) listener()
  }

  request: HttpRedirectAuthorizer = (approval, signal) => {
    if (this.closed || signal.aborted || this.pending.length >= 16) return false
    return new Promise<boolean>((resolve) => {
      const id = ++this.nextId
      const abort = () => finish(false)
      const finish = (allowed: boolean) => {
        const index = this.pending.findIndex((item) => item.id === id)
        if (index < 0) return
        this.pending.splice(index, 1)
        signal.removeEventListener("abort", abort)
        resolve(allowed && !signal.aborted)
        this.changed()
      }
      this.pending.push({ id, approval, finish })
      signal.addEventListener("abort", abort, { once: true })
      this.changed()
    })
  }
  decide = (id: number, allowed: boolean) => {
    const pending = this.pending[0]
    if (pending?.id === id) pending.finish(allowed)
  }
  activate = () => {
    this.closed = false
  }
  dispose = () => {
    this.closed = true
    for (const item of [...this.pending]) item.finish(false)
  }
}
