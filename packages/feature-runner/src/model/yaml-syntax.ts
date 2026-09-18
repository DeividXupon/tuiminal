import { Parser, type CST } from "yaml"

export type YamlSyntaxGroup =
  | "property"
  | "string"
  | "number"
  | "constant"
  | "comment"
  | "type"
  | "punctuation"
export type YamlSyntaxSpan = { start: number; end: number; group: YamlSyntaxGroup }

function scalarGroup(source: string): YamlSyntaxGroup {
  if (/^(?:true|false|null|~)$/i.test(source)) return "constant"
  if (/^[+-]?(?:0x[\da-f]+|0o[0-7]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|\.inf|\.nan)$/i.test(source))
    return "number"
  return "string"
}

function tokenGroup(token: CST.Token, key: boolean): YamlSyntaxGroup | undefined {
  if (token.type === "comment") return "comment"
  if (["anchor", "alias", "tag", "directive", "directive-line"].includes(token.type)) return "type"
  if (token.type === "scalar") return key ? "property" : scalarGroup(token.source)
  if (["single-quoted-scalar", "double-quoted-scalar"].includes(token.type))
    return key ? "property" : "string"
  if (["space", "newline", "error", "byte-order-mark", "doc-mode"].includes(token.type)) return
  return "punctuation"
}

type AddToken = (token: CST.Token | null | undefined, key?: boolean) => void
function children(token: CST.Token, add: AddToken) {
  if ("start" in token) {
    if (Array.isArray(token.start))
      token.start.forEach((part) => {
        add(part)
      })
    else add(token.start)
  }
  if ("end" in token)
    token.end?.forEach((part) => {
      add(part)
    })
  if ("value" in token) add(token.value)
  if ("items" in token) {
    for (const item of token.items) {
      item.start.forEach((part) => {
        add(part)
      })
      item.sep?.forEach((part) => {
        add(part)
      })
      add(item.key, true)
      add(item.value)
    }
  }
}

function tokenSpan(token: CST.Token, key: boolean, add: AddToken): YamlSyntaxSpan | undefined {
  if (token.type === "block-scalar") {
    let start = token.offset
    for (const prop of token.props) {
      add(prop)
      if ("source" in prop) start = prop.offset + prop.source.length
    }
    return { start, end: start + token.source.length, group: "string" }
  }
  if ("source" in token) {
    const group = tokenGroup(token, key)
    if (group) return { start: token.offset, end: token.offset + token.source.length, group }
  }
  return undefined
}

/** CST tokens retain incomplete input and distinguish YAML from literal shell blocks. */
export function runnerYamlSyntax(source: string): YamlSyntaxSpan[] {
  const spans: YamlSyntaxSpan[] = []
  const pending: { token: CST.Token; key: boolean }[] = []
  const add: AddToken = (token, key = false) => {
    if (token) pending.push({ token, key })
  }
  for (const token of new Parser().parse(source)) add(token)
  while (pending.length) {
    const { token, key } = pending.pop()!
    const span = tokenSpan(token, key, add)
    if (span && span.end > span.start) spans.push(span)
    children(token, add)
  }
  return spans.sort((a, b) => a.start - b.start)
}
