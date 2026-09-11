import { useKeyboard, useRenderer } from "@opentui/react"
import { COLORS } from "../../../core/settings/theme"
import { DirectionalButton } from "../../../shared/ui/DirectionalButton"
import { InlineButton } from "../../../shared/ui/InlineButton"
import { HTTP_BODY_KINDS, nextHttpBodyKind } from "../model/body-kind-navigation"
import {
  createHttpKeyValueEntry,
  createHttpMultipartPart,
  httpKeyValueTextInputOwnsKeyboard,
} from "../model/key-value"
import {
  httpParameterSectionForKey,
  type HttpParameterSection,
} from "../model/parameter-navigation"
import type {
  HttpBodyKind,
  HttpDocumentState,
  HttpKeyValue,
  HttpMultipartPart,
} from "../model/types"

export function HttpBodyKindButtons({
  kind,
  focused,
  onChange,
}: {
  kind: HttpBodyKind
  focused: boolean
  onChange: (kind: HttpBodyKind) => void
}) {
  return (
    <box style={{ height: 1, flexShrink: 0, flexDirection: "row" }}>
      {focused ? (
        <DirectionalButton
          id="http-body-kind-previous"
          direction={-1}
          level="nested"
          accent={COLORS.http}
          onPress={() => onChange(nextHttpBodyKind(kind, -1))}
        />
      ) : null}
      {HTTP_BODY_KINDS.map((candidate) => (
        <InlineButton
          key={candidate}
          label={candidate === "none" ? "Nenhum" : candidate.toUpperCase()}
          accent={COLORS.http}
          active={kind === candidate}
          onPress={() => onChange(candidate)}
        />
      ))}
      {focused ? (
        <DirectionalButton
          id="http-body-kind-next"
          direction={1}
          level="nested"
          accent={COLORS.http}
          onPress={() => onChange(nextHttpBodyKind(kind, 1))}
        />
      ) : null}
    </box>
  )
}

type RequestPaneLocalCommand =
  | { kind: "focus-parameter"; section: HttpParameterSection }
  | { kind: "add" }

function requestPaneLocalCommand(
  key: {
    name: string
    ctrl?: boolean
    shift?: boolean
    option?: boolean
    meta?: boolean
  },
  document: HttpDocumentState,
): RequestPaneLocalCommand | null {
  if (document.requestView === "params") {
    const section = httpParameterSectionForKey(key)
    if (section) return { kind: "focus-parameter", section }
  }
  if (key.name !== "n" || key.ctrl || key.shift || key.option || key.meta) return null
  const addable =
    document.requestView === "params" ||
    document.requestView === "headers" ||
    (document.requestView === "body" && ["form", "multipart"].includes(document.request.body.kind))
  return addable ? { kind: "add" } : null
}

function addRequestPaneItem({
  document,
  parameterSection,
  onQueryChange,
  onPathChange,
  onHeadersChange,
  onBodyFormChange,
  onBodyMultipartChange,
}: Omit<HttpRequestPaneKeyboardProps, "onParameterSectionChange">) {
  const request = document.request
  if (document.requestView === "params" && parameterSection === "query") {
    onQueryChange([...request.query, createHttpKeyValueEntry(`${request.id}-query`)])
  } else if (document.requestView === "params") {
    onPathChange([...request.path, createHttpKeyValueEntry(`${request.id}-path`)])
  } else if (document.requestView === "headers") {
    onHeadersChange([...request.headers, createHttpKeyValueEntry(`${request.id}-header`)])
  } else if (request.body.kind === "form") {
    onBodyFormChange([...request.body.form, createHttpKeyValueEntry(`${request.id}-form`)])
  } else if (request.body.kind === "multipart") {
    onBodyMultipartChange([...(request.body.multipart ?? []), createHttpMultipartPart(request.id)])
  }
}

type HttpRequestPaneKeyboardProps = {
  document: HttpDocumentState
  parameterSection: HttpParameterSection
  onParameterSectionChange: (section: HttpParameterSection) => void
  onQueryChange: (entries: HttpKeyValue[]) => void
  onPathChange: (entries: HttpKeyValue[]) => void
  onHeadersChange: (headers: HttpKeyValue[]) => void
  onBodyFormChange: (entries: HttpKeyValue[]) => void
  onBodyMultipartChange: (parts: HttpMultipartPart[]) => void
}

export function HttpRequestPaneKeyboard(props: HttpRequestPaneKeyboardProps) {
  const renderer = useRenderer()
  useKeyboard((key) => {
    if (httpKeyValueTextInputOwnsKeyboard(renderer.currentFocusedRenderable?.id ?? "")) return
    const command = requestPaneLocalCommand(key, props.document)
    if (!command) return
    key.preventDefault()
    key.stopPropagation()
    if (command.kind === "focus-parameter") {
      renderer.currentFocusedRenderable?.blur()
      props.onParameterSectionChange(command.section)
    } else {
      addRequestPaneItem(props)
    }
  })
  return null
}
