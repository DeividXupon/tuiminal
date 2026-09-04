import { Fragment, jsxDEV as reactJsxDev } from "react/jsx-dev-runtime"
import type { Key } from "react"
import { localizedProps } from "./jsx-runtime"

export { Fragment }
export type { JSX } from "@opentui/react/jsx-dev-runtime"

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key: Key | undefined,
  isStatic: boolean,
  source?: { fileName?: string; lineNumber?: number; columnNumber?: number },
  self?: unknown,
) {
  return reactJsxDev(
    type as never,
    localizedProps(type, props) as never,
    key,
    isStatic,
    source,
    self,
  )
}
