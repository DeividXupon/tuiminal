import { readFileSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, relative, resolve } from "node:path"
import ts from "typescript"
import { assertWorkspaceVersions, workspaceRoot } from "./workspace-model"

const problems: string[] = []
const workspaces = assertWorkspaceVersions()
for (const { directory, manifest } of workspaces) {
  if (!manifest.private)
    problems.push(`${directory}: publish only generated dist/packages artifacts`)
  if (manifest.repository.directory !== directory)
    problems.push(`${directory}: missing repository directory`)
  const root = resolve(workspaceRoot, directory)
  const declared = new Set(Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }))
  for (const file of new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: root })) {
    if (
      !file.startsWith("src/") &&
      !file.startsWith("bin/") &&
      !file.startsWith("src\\") &&
      !file.startsWith("bin\\")
    )
      continue
    const path = resolve(root, file)
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    )
    function check(specifier: string) {
      if (specifier.startsWith(".")) {
        const target = relative(root, resolve(dirname(path), specifier))
        if (target === ".." || target.startsWith("../") || target.startsWith("..\\"))
          problems.push(`${directory}/${file}: relative import escapes workspace: ${specifier}`)
        return
      }
      if (isBuiltin(specifier) || specifier === "bun" || specifier.startsWith("bun:")) return
      const name = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0]
      if (name && name !== manifest.name && !declared.has(name))
        problems.push(`${directory}/${file}: undeclared runtime dependency ${name}`)
      if (specifier.startsWith("@xupon/tuiminal-")) {
        try {
          Bun.resolveSync(specifier, dirname(path))
        } catch {
          problems.push(`${directory}/${file}: unexported workspace import ${specifier}`)
        }
      }
    }
    function visit(node: ts.Node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        check(node.moduleSpecifier.text)
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        check(node.arguments[0].text)
      if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteral(node.argument.literal)
      )
        check(node.argument.literal.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}
for (const problem of problems) console.error(problem)
console.log(
  `Workspaces: ${workspaces.length} packages, ${problems.length} manifest/import violations`,
)
process.exitCode = problems.length ? 1 : 0
