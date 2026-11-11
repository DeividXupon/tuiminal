import {
  InputRenderable,
  RenderableEvents,
  type Renderable,
  type ScrollBoxRenderable,
} from "@opentui/core"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import "@xupon/tuiminal-core/ui/PasswordInput"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"

const FormContext = createContext({
  reveal: (_input: InputRenderable) => {},
  move: (_input: InputRenderable | null, _direction: number) => {},
  onFocus: () => {},
})

function inputsIn(root: Renderable): InputRenderable[] {
  if (!root.visible) return []
  return root
    .getChildren()
    .flatMap((child) =>
      child instanceof InputRenderable ? (child.visible ? [child] : []) : inputsIn(child),
    )
}

export function focusHttpRequestForm(root: Renderable, id: string) {
  const form = root.findDescendantById(`http-automation-form-${id}`)
  if (form) (inputsIn(form)[0] ?? form).focus()
}

export function HttpRequestForm({
  id,
  children,
  onFocus = () => {},
}: {
  id: string
  children: ReactNode
  onFocus?: () => void
}) {
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const [viewportSize, setViewportSize] = useState("")
  const reveal = useCallback((input: InputRenderable) => {
    const view = scroll.current
    if (!view || input.isDestroyed || !input.visible) return
    const top = view.viewport.screenY
    const bottom = top + view.viewport.height
    if (input.screenY - 1 < top) view.scrollBy(input.screenY - 1 - top)
    else if (input.screenY >= bottom) view.scrollBy(input.screenY - bottom + 1)
  }, [])
  useEffect(() => {
    if (!viewportSize) return
    const timer = setTimeout(() => {
      const focused = scroll.current && inputsIn(scroll.current).find((input) => input.focused)
      if (focused) reveal(focused)
    }, 0)
    return () => clearTimeout(timer)
  }, [viewportSize, reveal])
  const move = (input: InputRenderable | null, direction: number) => {
    if (!scroll.current) return
    const fields = inputsIn(scroll.current)
    if (!fields.length) return
    const index = input ? fields.indexOf(input) : direction > 0 ? -1 : 0
    const next = fields[(index + direction + fields.length) % fields.length]
    next?.focus()
  }
  return (
    <FormContext.Provider value={{ reveal, move, onFocus }}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: OpenTUI scrollbox is a native focusable control. */}
      <scrollbox
        id={`http-automation-form-${id}`}
        ref={scroll}
        focusable
        scrollY
        viewportCulling={false}
        viewportOptions={{
          onSizeChange() {
            setViewportSize(`${this.width}:${this.height}`)
          },
        }}
        style={{ flexGrow: 1, minHeight: 1, backgroundColor: COLORS.canvas }}
        onKeyDown={(key) => {
          if (key.defaultPrevented) return
          if (key.name !== "tab" && key.name !== "return" && key.name !== "enter") return
          key.preventDefault()
          key.stopPropagation()
          move(null, key.shift ? -1 : 1)
        }}
      >
        {children}
      </scrollbox>
    </FormContext.Provider>
  )
}

export function HttpFormSection({
  title,
  children,
  description,
  actions,
  first = false,
}: {
  title: string
  children: ReactNode
  description?: string
  actions?: ReactNode
  first?: boolean
}) {
  return (
    <box flexShrink={0} marginTop={first ? 0 : 1}>
      <box minHeight={1} flexShrink={0} flexDirection="row" backgroundColor={COLORS.panelRaised}>
        <text
          content={translateUi(title)}
          wrapMode="none"
          style={{ width: 0, flexGrow: 1, minWidth: 0, fg: COLORS.http }}
        />
        {actions}
      </box>
      <box flexShrink={0} paddingLeft={1} paddingRight={1}>
        {description ? <text content={translateUi(description)} fg={COLORS.muted} /> : null}
        {children}
      </box>
    </box>
  )
}

export function HttpFormField({
  id,
  label,
  value,
  onInput,
  placeholder = "",
  secret = false,
  onDelete,
  autoFocus = false,
}: {
  id: string
  label: string
  value: string
  onInput: (value: string) => void
  placeholder?: string
  secret?: boolean
  onDelete?: () => void
  autoFocus?: boolean
}) {
  const ref = useRef<InputRenderable | null>(null)
  const form = useContext(FormContext)
  useEffect(() => {
    const input = ref.current
    if (!input) return
    const focus = () => form.reveal(input)
    input.on(RenderableEvents.FOCUSED, focus)
    const timer = autoFocus ? setTimeout(() => input.focus(), 0) : undefined
    return () => {
      clearTimeout(timer)
      input.off(RenderableEvents.FOCUSED, focus)
    }
  }, [autoFocus, form.reveal])
  const Component = secret ? "password-input" : "input"
  return (
    <box id={`${id}-field`} height={3} flexShrink={0}>
      <text content={translateUi(label)} height={1} fg={COLORS.muted} />
      <Component
        ref={(input: InputRenderable | null) => {
          ref.current = input
        }}
        id={id}
        value={value}
        placeholder={translateUi(placeholder)}
        width="100%"
        onInput={onInput}
        onMouseDown={() => {
          form.onFocus()
          ref.current?.focus()
        }}
        onKeyDown={(key) => {
          if (key.defaultPrevented) return
          if (key.ctrl && key.name === "d" && onDelete) {
            key.preventDefault()
            key.stopPropagation()
            onDelete()
          } else if (key.name === "tab") {
            key.preventDefault()
            key.stopPropagation()
            form.move(ref.current, key.shift ? -1 : 1)
          }
        }}
        style={{
          backgroundColor: COLORS.panelAlt,
          focusedBackgroundColor: COLORS.panelRaised,
          textColor: COLORS.text,
          focusedTextColor: COLORS.text,
          cursorColor: COLORS.http,
        }}
      />
    </box>
  )
}
