import { TreeSitterClient } from "@opentui/core"
import { syntaxFiletype } from "../../packages/core/src/syntax/index"
import { syntaxParsers } from "../../packages/core/src/syntax/parsers"
import { syntaxSamples } from "./syntax-samples"

if (!process.argv[2]) throw new Error("An isolated cache path is required")
const client = new TreeSitterClient({ dataPath: process.argv[2] })
try {
  for (const parser of syntaxParsers) {
    for (const path of [parser.wasm, ...parser.queries.highlights]) {
      if (!path.includes("$bunfs")) throw new Error(`Asset was not embedded: ${path}`)
    }
  }
  for (const [path, code, token, group] of syntaxSamples) {
    const result = await client.highlightOnce(code, syntaxFiletype(path))
    if (result.error || result.warning)
      throw new Error(`${path}: ${result.error ?? result.warning}`)
    const start = code.indexOf(token)
    if (
      !result.highlights?.some(
        ([from, to, name]) =>
          from <= start && to >= start + token.length && name.split(".")[0] === group,
      )
    )
      throw new Error(`Missing embedded grammar highlight: ${path}`)
  }
  console.log("Embedded syntax assets work from an empty project")
} finally {
  await client.destroy()
}
