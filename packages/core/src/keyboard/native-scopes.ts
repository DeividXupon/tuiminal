import type { KeyEvent } from "@opentui/core"

type KeyListener = (key: KeyEvent) => void
export type NativeShortcutRenderer = {
  isDestroyed: boolean
  keyInput: {
    on(event: "keypress", listener: KeyListener): unknown
    off(event: "keypress", listener: KeyListener): unknown
  }
}

/** One final native fallback per renderer, independent of the number of mounted scopes. */
export class NativeShortcutScopes<Renderer extends NativeShortcutRenderer, Scope> {
  private owners = new WeakMap<Renderer, Set<Scope>>()
  private dispatchers = new WeakMap<Renderer, KeyListener>()

  constructor(private handle: (renderer: Renderer, key: KeyEvent) => void) {}

  get(renderer: Renderer) {
    return this.owners.get(renderer)
  }

  register(renderer: Renderer, scope: Scope) {
    const scopes = this.owners.get(renderer) ?? new Set<Scope>()
    this.owners.set(renderer, scopes)
    scopes.add(scope)
    const dispatch =
      this.dispatchers.get(renderer) ?? ((key: KeyEvent) => this.handle(renderer, key))
    this.dispatchers.set(renderer, dispatch)
    // Feature effects install their handlers before native fallback is appended.
    queueMicrotask(() => {
      if (this.dispatchers.get(renderer) !== dispatch) return
      renderer.keyInput.off("keypress", dispatch)
      if (!renderer.isDestroyed && this.owners.get(renderer)?.size)
        renderer.keyInput.on("keypress", dispatch)
    })
    return () => {
      scopes.delete(scope)
      if (scopes.size === 0) {
        renderer.keyInput.off("keypress", dispatch)
        this.dispatchers.delete(renderer)
        this.owners.delete(renderer)
      }
    }
  }
}
