import { addDefaultParsers, pathToFiletype } from "@opentui/core"
import { syntaxParsers } from "./parsers"

// Registers descriptors only. OpenTUI loads each WASM grammar in its worker on first use.
// Both the host and source UI import this before mounting any code/markdown/diff renderable.
addDefaultParsers(syntaxParsers)

const extensions = new Map([
  ["jsonc", "json"],
  ["svg", "xml"],
  ["xsd", "xml"],
  ["xsl", "xml"],
  ["xslt", "xml"],
  ["xaml", "xml"],
  ["csproj", "xml"],
  ["fsproj", "xml"],
  ["props", "xml"],
  ["targets", "xml"],
])

export function syntaxFiletype(path: string): string {
  const name = path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? ""
  if (/^(dockerfile|containerfile)(\.|$)/.test(name) || name.endsWith(".dockerfile"))
    return "dockerfile"
  if (name === ".env" || name.startsWith(".env.")) return "bash"
  const extension = name.slice(name.lastIndexOf(".") + 1)
  return extensions.get(extension) ?? pathToFiletype(path) ?? "text"
}
