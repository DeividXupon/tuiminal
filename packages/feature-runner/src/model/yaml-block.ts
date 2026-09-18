export type RunnerYamlBlock =
  | "root"
  | "commands"
  | "command"
  | "flows"
  | "flow"
  | "profiles"
  | "profile"
  | "health"
  | "dependsOn"
  | "dependency"
  | "stages"
  | "stage"
  | "commandIds"
  | "env"
  | "literal"
  | "unknown"

type Frame = { indent: number; block: RunnerYamlBlock; healthType?: string }

function lineParts(line: string) {
  const indent = line.search(/\S/)
  const list = /^\s*-\s*/.test(line)
  const match = /^\s*(?:-\s*)?([A-Za-z_][\w:-]*):(?:\s*(.*))?$/.exec(line)
  return { indent, list, key: match?.[1] ?? "", value: match?.[2] ?? "" }
}

function childBlock(parent: RunnerYamlBlock, key: string, value: string): RunnerYamlBlock | null {
  if (/^[>|][+-]?$/.test(value)) return "literal"
  if (value.trim()) return null
  if (parent === "root" && ["commands", "flows", "profiles"].includes(key))
    return key as RunnerYamlBlock
  if (parent === "commands") return "command"
  if (parent === "flows") return "flow"
  if (parent === "profiles") return "profile"
  if (parent === "command" && ["health", "healthCheck"].includes(key)) return "health"
  if (parent === "command" && key === "dependsOn") return "dependsOn"
  if (parent === "flow" && key === "stages") return "stages"
  if (parent === "stage" && key === "commandIds") return "commandIds"
  if (["command", "profile"].includes(parent) && key === "env") return "env"
  return null
}

function listItemBlock(parent: RunnerYamlBlock): RunnerYamlBlock | null {
  if (parent === "dependsOn") return "dependency"
  if (parent === "stages") return "stage"
  return null
}

function popToIndent(stack: Frame[], indent: number) {
  while (stack.length > 1 && stack.at(-1)!.indent >= indent) stack.pop()
}

function advanceBlock(stack: Frame[], line: string) {
  if (!line.trim() || /^\s*#/.test(line)) return
  const { indent, list, key, value } = lineParts(line)
  popToIndent(stack, indent)
  const parent = stack.at(-1)!
  if (parent.block === "literal") return
  if (list) {
    const block = listItemBlock(parent.block)
    if (block) stack.push({ indent, block })
  }
  const owner = stack.at(-1)!
  if (owner.block === "health" && key === "type") owner.healthType = value.trim()
  const child = key ? childBlock(owner.block, key, value) : null
  if (child) stack.push({ indent: list ? indent + 2 : indent, block: child })
}

/** Uses indentation rather than a parsed document so incomplete YAML still has a scope. */
export function runnerYamlBlock(source: string, row: number, column?: number) {
  const lines = source.split("\n")
  const currentLine = lines[row] ?? ""
  const current = currentLine.slice(0, column ?? currentLine.length)
  const currentIndent = current.search(/\S/) < 0 ? current.length : current.search(/\S/)
  const stack: Frame[] = [{ indent: -1, block: "root" }]
  for (let index = 0; index < row; index++) advanceBlock(stack, lines[index] ?? "")
  popToIndent(stack, currentIndent)
  const owner = stack.at(-1)!
  const currentList = /^\s*-\s*/.test(current)
  const block = currentList ? (listItemBlock(owner.block) ?? owner.block) : owner.block
  const health = [...stack].reverse().find((frame) => frame.block === "health")
  return { block, healthType: health?.healthType ?? "" }
}

/** Text inserted after [Enter], including the newline. */
export function runnerYamlNewline(source: string, row: number, column: number) {
  const line = (source.split("\n")[row] ?? "").slice(0, column)
  const indent = line.match(/^ */)?.[0] ?? ""
  const content = line.trimEnd().trimStart()
  if (!content) return `\n${indent}`
  const list = content.startsWith("- ")
  const key = /^-?\s*([A-Za-z_][\w:-]*):\s*(.*)$/.exec(content)
  if (key && !key[2]) {
    if (["dependsOn", "stages", "commandIds"].includes(key[1]!))
      return `\n${indent}${list ? "    " : "  "}- `
    return `\n${indent}${list ? "    " : "  "}`
  }
  if (/[|>][+-]?$/.test(content)) return `\n${indent}  `
  if (list) return key ? `\n${indent}  ` : `\n${indent}- `
  return `\n${indent}`
}
