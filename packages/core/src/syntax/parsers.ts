import type { FiletypeParserOptions } from "@opentui/core"

import bashWasm from "./assets/bash/parser.wasm" with { type: "file" }
import bashHighlights from "./assets/bash/highlights.scm" with { type: "file" }
import cWasm from "./assets/c/parser.wasm" with { type: "file" }
import cHighlights from "./assets/c/highlights.scm" with { type: "file" }
import cppWasm from "./assets/cpp/parser.wasm" with { type: "file" }
import cppHighlights from "./assets/cpp/highlights.scm" with { type: "file" }
import csharpWasm from "./assets/csharp/parser.wasm" with { type: "file" }
import csharpHighlights from "./assets/csharp/highlights.scm" with { type: "file" }
import cssWasm from "./assets/css/parser.wasm" with { type: "file" }
import cssHighlights from "./assets/css/highlights.scm" with { type: "file" }
import goWasm from "./assets/go/parser.wasm" with { type: "file" }
import goHighlights from "./assets/go/highlights.scm" with { type: "file" }
import htmlWasm from "./assets/html/parser.wasm" with { type: "file" }
import htmlHighlights from "./assets/html/highlights.scm" with { type: "file" }
import htmlInjections from "./assets/html/injections.scm" with { type: "file" }
import javaWasm from "./assets/java/parser.wasm" with { type: "file" }
import javaHighlights from "./assets/java/highlights.scm" with { type: "file" }
import jsonWasm from "./assets/json/parser.wasm" with { type: "file" }
import jsonHighlights from "./assets/json/highlights.scm" with { type: "file" }
import phpWasm from "./assets/php/parser.wasm" with { type: "file" }
import phpHighlights from "./assets/php/highlights.scm" with { type: "file" }
import pythonWasm from "./assets/python/parser.wasm" with { type: "file" }
import pythonHighlights from "./assets/python/highlights.scm" with { type: "file" }
import rubyWasm from "./assets/ruby/parser.wasm" with { type: "file" }
import rubyHighlights from "./assets/ruby/highlights.scm" with { type: "file" }
import rustWasm from "./assets/rust/parser.wasm" with { type: "file" }
import rustHighlights from "./assets/rust/highlights.scm" with { type: "file" }
import tsxWasm from "./assets/tsx/parser.wasm" with { type: "file" }
import tsxHighlights from "./assets/tsx/highlights.scm" with { type: "file" }
import yamlWasm from "./assets/yaml/parser.wasm" with { type: "file" }
import yamlHighlights from "./assets/yaml/highlights.scm" with { type: "file" }
import tomlWasm from "./assets/toml/parser.wasm" with { type: "file" }
import tomlHighlights from "./assets/toml/highlights.scm" with { type: "file" }
import luaWasm from "./assets/lua/parser.wasm" with { type: "file" }
import luaHighlights from "./assets/lua/highlights.scm" with { type: "file" }
import svelteWasm from "./assets/svelte/parser.wasm" with { type: "file" }
import svelteHighlights from "./assets/svelte/highlights.scm" with { type: "file" }
import svelteInjections from "./assets/svelte/injections.scm" with { type: "file" }
import elixirWasm from "./assets/elixir/parser.wasm" with { type: "file" }
import elixirHighlights from "./assets/elixir/highlights.scm" with { type: "file" }
import xmlWasm from "./assets/xml/parser.wasm" with { type: "file" }
import xmlHighlights from "./assets/xml/highlights.scm" with { type: "file" }
import sqlWasm from "./assets/sql/parser.wasm" with { type: "file" }
import sqlHighlights from "./assets/sql/highlights.scm" with { type: "file" }
import kotlinWasm from "./assets/kotlin/parser.wasm" with { type: "file" }
import kotlinHighlights from "./assets/kotlin/highlights.scm" with { type: "file" }
import swiftWasm from "./assets/swift/parser.wasm" with { type: "file" }
import swiftHighlights from "./assets/swift/highlights.scm" with { type: "file" }
import dockerfileWasm from "./assets/dockerfile/parser.wasm" with { type: "file" }
import dockerfileHighlights from "./assets/dockerfile/highlights.scm" with { type: "file" }
import javascriptHighlights from "./assets/tsx/javascript-highlights.scm" with { type: "file" }
import jsxHighlights from "./assets/tsx/javascript-jsx.scm" with { type: "file" }

// Sources and integrity pins: scripts/syntax-sources.json. Assets ship with the host.
export const syntaxParsers: FiletypeParserOptions[] = [
  {
    filetype: "bash",
    aliases: ["sh", "shell", "zsh"],
    wasm: bashWasm,
    queries: { highlights: [bashHighlights] },
  },
  {
    filetype: "c",
    wasm: cWasm,
    queries: { highlights: [cHighlights] },
  },
  {
    filetype: "cpp",
    wasm: cppWasm,
    queries: { highlights: [cHighlights, cppHighlights] },
  },
  {
    filetype: "csharp",
    aliases: ["c_sharp", "c-sharp"],
    wasm: csharpWasm,
    queries: { highlights: [csharpHighlights] },
  },
  {
    filetype: "css",
    wasm: cssWasm,
    queries: { highlights: [cssHighlights] },
  },
  {
    filetype: "go",
    wasm: goWasm,
    queries: { highlights: [goHighlights] },
  },
  {
    filetype: "html",
    aliases: ["htm"],
    wasm: htmlWasm,
    queries: { highlights: [htmlHighlights], injections: [htmlInjections] },
  },
  {
    filetype: "java",
    wasm: javaWasm,
    queries: { highlights: [javaHighlights] },
  },
  {
    filetype: "json",
    aliases: ["jsonc"],
    wasm: jsonWasm,
    queries: { highlights: [jsonHighlights] },
  },
  {
    filetype: "php",
    wasm: phpWasm,
    queries: { highlights: [phpHighlights] },
  },
  {
    filetype: "python",
    wasm: pythonWasm,
    queries: { highlights: [pythonHighlights] },
  },
  {
    filetype: "ruby",
    wasm: rubyWasm,
    queries: { highlights: [rubyHighlights] },
  },
  {
    filetype: "rust",
    wasm: rustWasm,
    queries: { highlights: [rustHighlights] },
  },
  {
    filetype: "typescriptreact",
    aliases: ["tsx"],
    wasm: tsxWasm,
    queries: { highlights: [javascriptHighlights, jsxHighlights, tsxHighlights] },
  },
  {
    filetype: "yaml",
    aliases: ["yml"],
    wasm: yamlWasm,
    queries: { highlights: [yamlHighlights] },
  },
  {
    filetype: "toml",
    wasm: tomlWasm,
    queries: { highlights: [tomlHighlights] },
  },
  {
    filetype: "lua",
    wasm: luaWasm,
    queries: { highlights: [luaHighlights] },
  },
  {
    filetype: "svelte",
    wasm: svelteWasm,
    queries: { highlights: [svelteHighlights], injections: [svelteInjections] },
  },
  {
    filetype: "elixir",
    wasm: elixirWasm,
    queries: { highlights: [elixirHighlights] },
  },
  {
    filetype: "xml",
    wasm: xmlWasm,
    queries: { highlights: [xmlHighlights] },
  },
  {
    filetype: "sql",
    wasm: sqlWasm,
    queries: { highlights: [sqlHighlights] },
  },
  {
    filetype: "kotlin",
    wasm: kotlinWasm,
    queries: { highlights: [kotlinHighlights] },
  },
  {
    filetype: "swift",
    wasm: swiftWasm,
    queries: { highlights: [swiftHighlights] },
  },
  {
    filetype: "dockerfile",
    wasm: dockerfileWasm,
    queries: { highlights: [dockerfileHighlights] },
  },
]
