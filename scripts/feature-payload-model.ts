import ts from "typescript"
import { isBuiltin } from "node:module"
import { FEATURE_HOST_KEY } from "../packages/core/src/runtime/feature-host"

export const SHARED_FEATURE_IMPORTS = [
  "react",
  "react/*",
  "@opentui/core",
  "@opentui/react",
  "@tuiparts/core/*",
  "@tuiparts/react/*",
  "@xupon/tuiminal-core/*",
]

export function bindFeatureImports(source: string, version: string) {
  const ast = ts.createSourceFile(
    "feature.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  )
  const replacements: Array<{ start: number; end: number; content: string }> = []
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue
    const name = statement.moduleSpecifier.text
    if (isBuiltin(name) || name.startsWith("bun:") || name === "bun") continue
    if (
      !SHARED_FEATURE_IMPORTS.some((pattern) =>
        pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
      )
    ) {
      throw new Error(`Feature retained an unsupported external import: ${name}`)
    }
    const module = `__tuiminalHost.modules[${JSON.stringify(name)}]`
    const clause = statement.importClause
    const bindings: string[] = []
    if (clause?.name) bindings.push(`const ${clause.name.text} = ${module}.default ?? ${module};`)
    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        bindings.push(`const ${clause.namedBindings.name.text} = ${module};`)
      } else {
        const names = clause.namedBindings.elements.map(
          (element) => `${element.propertyName?.text ?? element.name.text}: ${element.name.text}`,
        )
        bindings.push(`const { ${names.join(", ")} } = ${module};`)
      }
    }
    replacements.push({
      start: statement.getStart(ast),
      end: statement.end,
      content: bindings.join("\n"),
    })
  }
  for (const replacement of replacements.reverse()) {
    source =
      source.slice(0, replacement.start) + replacement.content + source.slice(replacement.end)
  }
  return `const __tuiminalHost = globalThis[${JSON.stringify(FEATURE_HOST_KEY)}];\nif (!__tuiminalHost || __tuiminalHost.version !== ${JSON.stringify(version)}) throw new Error("Incompatible official feature host");\n${source}`
}
