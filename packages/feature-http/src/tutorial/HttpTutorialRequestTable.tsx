import type { HttpKeyValue } from "../model/types"
import { HttpKeyValueEditor } from "../ui/HttpKeyValueEditor"

const entries: HttpKeyValue[] = [
  {
    id: "tutorial-http-query-limit",
    name: "limit",
    value: "10",
    enabled: true,
    sensitivity: "normal",
  },
  {
    id: "tutorial-http-query-locale",
    name: "locale",
    value: "pt-BR",
    enabled: true,
    sensitivity: "normal",
  },
]
const noop = () => {}

export function HttpTutorialRequestTable() {
  return (
    <box height={5} flexShrink={0}>
      <HttpKeyValueEditor
        idPrefix="tutorial-http-query"
        title="QUERY PARAMS"
        entries={entries}
        onChange={noop}
        navigation={{
          active: true,
          mode: "block",
          row: 0,
          column: 0,
          draft: {
            id: "tutorial-http-query-draft",
            name: "",
            value: "",
            enabled: true,
            sensitivity: "normal",
          },
          onDraftInput: noop,
          onFocusBlock: noop,
          onEnter: noop,
          onFocusCell: noop,
        }}
      />
    </box>
  )
}
