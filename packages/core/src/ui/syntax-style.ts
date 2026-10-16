import { SyntaxStyle, type StyleDefinitionInput } from "@opentui/core"
import "../syntax/index"
import { COLORS, getUiSettings, subscribeUiTheme } from "../settings/theme"

function syntaxDefinitions(): Record<string, StyleDefinitionInput> {
  const light = getUiSettings().colorMode === "light"
  const definitions: Record<string, StyleDefinitionInput> = {
    default: { fg: COLORS.text },
    keyword: { fg: light ? "#6f42c1" : "#c792ea", bold: true },
    string: { fg: light ? "#2f7d32" : "#c3e88d" },
    comment: { fg: COLORS.muted, italic: true },
    number: { fg: light ? "#b54708" : "#f78c6c" },
    function: { fg: light ? "#245eb5" : "#82aaff" },
    type: { fg: light ? "#805b10" : "#ffcb6b" },
    property: { fg: light ? "#0b7285" : "#80cbc4" },
    operator: { fg: light ? "#00758f" : "#89ddff" },
    constant: { fg: light ? "#a33b12" : "#f78c6c" },
    punctuation: { fg: light ? "#586174" : "#a6accd" },
  }
  const aliases: Record<string, string[]> = {
    keyword: [
      "conditional",
      "repeat",
      "exception",
      "include",
      "import",
      "preproc",
      "storageclass",
      "charset",
      "keyframes",
      "media",
      "supports",
    ],
    string: ["character"],
    number: ["float"],
    function: ["method", "tag"],
    type: ["namespace", "constructor", "module"],
    property: ["field", "attribute", "label"],
    constant: ["boolean"],
    punctuation: ["delimiter", "escape"],
    default: ["variable", "embedded", "parameter", "none", "text", "markup"],
  }
  for (const [name, names] of Object.entries(aliases)) {
    const definition = definitions[name]
    if (definition) for (const alias of names) definitions[alias] = definition
  }
  return definitions
}

export function createUiSyntaxStyle() {
  const style = SyntaxStyle.create()
  const refresh = () => {
    for (const [name, definition] of Object.entries(syntaxDefinitions())) {
      style.registerStyle(name, definition)
    }
  }
  refresh()
  subscribeUiTheme(refresh)
  return style
}
