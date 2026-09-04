import { Fragment, jsx as reactJsx, jsxs as reactJsxs } from "react/jsx-runtime"
import { translateUi } from "../index"

export { Fragment }
export type { JSX } from "@opentui/react/jsx-runtime"

type JsxProps = Record<string, unknown> | null

export function localizedProps(type: unknown, props: JsxProps): JsxProps {
  if (typeof type !== "string" || !props) return props

  let next = props
  if (type === "text" && typeof props.content === "string") {
    const content = translateUi(props.content)
    if (content !== props.content) next = { ...next, content }
  }
  if (type === "text" && typeof props.children === "string") {
    const children = translateUi(props.children)
    if (children !== props.children) next = { ...next, children }
  }
  if (typeof props.placeholder === "string") {
    const placeholder = translateUi(props.placeholder)
    if (placeholder !== props.placeholder) next = { ...next, placeholder }
  }
  if ((type === "select" || type === "tab-select") && Array.isArray(props.options)) {
    let changed = false
    const options = props.options.map((option) => {
      if (!option || typeof option !== "object") return option
      const item = option as Record<string, unknown>
      const name = typeof item.name === "string" ? translateUi(item.name) : item.name
      const description =
        typeof item.description === "string" ? translateUi(item.description) : item.description
      if (name === item.name && description === item.description) return option
      changed = true
      return { ...item, name, description }
    })
    if (changed) next = { ...next, options }
  }
  return next
}

export function jsx(type: unknown, props: JsxProps, key?: string) {
  return reactJsx(type as never, localizedProps(type, props) as never, key)
}

export function jsxs(type: unknown, props: JsxProps, key?: string) {
  return reactJsxs(type as never, localizedProps(type, props) as never, key)
}
