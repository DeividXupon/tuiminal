import { NativeShortcutScopes } from "./native-scopes"
import {
  InputRenderable,
  EmbeddedTerminalRenderable,
  SelectRenderable,
  ScrollBoxRenderable,
  TextareaRenderable,
  type Renderable,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core"
import { useKeyboard, useRenderer } from "@opentui/react"
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  type ComponentType,
  type ReactNode,
} from "react"
import {
  formatShortcutHints,
  remapShortcutKey,
  type ShortcutTool,
  type ShortcutKey,
} from "./bindings"

type Scope = {
  tool: ShortcutTool
  context: string
  active: boolean
  depth: number
  rootId?: string | readonly string[] | undefined
}
const Context = createContext<Scope | null>(null)
const nativeScopes = new NativeShortcutScopes<CliRenderer, Scope>(nativeControlKey)

function focusOwnership(scope: Scope, control: Renderable | null) {
  if (!scope.active) return -1
  const roots = typeof scope.rootId === "string" ? [scope.rootId] : (scope.rootId ?? [])
  let current = control
  let distance = 0
  while (current) {
    const currentId = current.id
    if (
      roots.some((root) =>
        root.endsWith("*") ? currentId.startsWith(root.slice(0, -1)) : root === currentId,
      )
    )
      return 1000 - distance
    current = current.parent
    distance++
  }
  return -1
}

function deepestOwner(renderer: CliRenderer) {
  const candidates = [...(nativeScopes.get(renderer) ?? [])].map((scope) => ({
    scope,
    score: focusOwnership(scope, renderer.currentFocusedRenderable),
  }))
  return candidates
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || b.scope.depth - a.scope.depth)[0]?.scope
}

function nativeControlNames(control: Renderable) {
  if (control instanceof InputRenderable) return ["return", "enter"]
  if (control instanceof ScrollBoxRenderable)
    return ["up", "down", "left", "right", "pageup", "pagedown", "home", "end"]
  if (control instanceof SelectRenderable) return ["up", "down", "return", "enter", "space"]
  return ["return", "enter", "space"]
}

function nativeControlKey(renderer: CliRenderer, key: KeyEvent) {
  if (key.defaultPrevented) return
  const scope = deepestOwner(renderer)
  const control = renderer.currentFocusedRenderable
  if (
    !scope ||
    !control?.handleKeyPress ||
    (control instanceof TextareaRenderable && !(control instanceof InputRenderable)) ||
    control instanceof EmbeddedTerminalRenderable
  )
    return
  const mapped = remapShortcutForFocus(scope.tool, scope.context, key, control)
  if (mapped === key) return
  const nativeNames = nativeControlNames(control)
  if (!nativeNames.includes(mapped.name) && !nativeNames.includes(key.name)) return
  if (mapped.name !== "unbound-shortcut") {
    control.onKeyDown?.(mapped)
    if (!key.defaultPrevented && !control.isDestroyed && nativeNames.includes(mapped.name))
      control.handleKeyPress(mapped)
  }
  key.preventDefault()
  key.stopPropagation()
}

export function ShortcutScope({
  tool,
  context,
  active = true,
  rootId,
  children,
}: {
  tool?: ShortcutTool | undefined
  context: string
  active?: boolean | undefined
  rootId?: string | readonly string[] | undefined
  children?: ReactNode
}) {
  const inherited = useContext(Context)
  const renderer = useRenderer()
  const scope = useMemo<Scope>(
    () => ({
      tool: tool ?? inherited?.tool ?? "global",
      context,
      active: active && (inherited?.active ?? true),
      depth: (inherited?.depth ?? 0) + 1,
      rootId,
    }),
    [tool, context, active, inherited?.tool, inherited?.active, inherited?.depth, rootId],
  )
  useEffect(
    () => (rootId && scope.active ? nativeScopes.register(renderer, scope) : undefined),
    [renderer, scope, rootId],
  )
  return <Context.Provider value={scope}>{children}</Context.Provider>
}

export function withShortcutContext<P extends object>(
  tool: ShortcutTool | null,
  context: string,
  Component: ComponentType<P>,
  ownerRootId?: string | readonly string[],
) {
  return function ConfiguredShortcuts(props: P) {
    const active =
      ("active" in props && typeof props.active === "boolean" ? props.active : true) &&
      !("inactive" in props && props.inactive === true) &&
      !("open" in props && props.open === false)
    return createElement(
      ShortcutScope,
      {
        tool: tool ?? undefined,
        context,
        active,
        rootId: ownerRootId,
      },
      createElement(Component, props),
    )
  }
}

export function remapShortcutForFocus<T extends ShortcutKey>(
  tool: ShortcutTool,
  context: string,
  key: T,
  focused: Renderable | null,
): T {
  const editing =
    focused instanceof InputRenderable ||
    focused instanceof TextareaRenderable ||
    focused instanceof EmbeddedTerminalRenderable
  if (
    editing &&
    !key.ctrl &&
    !key.meta &&
    !key.option &&
    !key.super &&
    ([...key.name].length === 1 || key.name === "space")
  )
    return key
  return remapShortcutKey(tool, context, key)
}

export function useConfiguredKeyboard(...[handler, options]: Parameters<typeof useKeyboard>) {
  const scope = useContext(Context)
  const renderer = useRenderer()
  useKeyboard((key) => {
    handler(
      scope?.active
        ? remapShortcutForFocus(scope.tool, scope.context, key, renderer.currentFocusedRenderable)
        : key,
    )
  }, options)
}

export function useShortcutKeyHandler() {
  const scope = useContext(Context)
  const renderer = useRenderer()
  return <T extends ShortcutKey>(key: T): T =>
    scope?.active
      ? remapShortcutForFocus(scope.tool, scope.context, key, renderer.currentFocusedRenderable)
      : key
}

export function useShortcutHint(content: string, enabled = true) {
  const scope = useContext(Context)
  return scope && enabled ? formatShortcutHints(scope.tool, scope.context, content) : content
}
