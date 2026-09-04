import { readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import YAML from "yaml"
import { importOpenApiDocument } from "../importing/openapi"
import { importPostmanCollection } from "../importing/postman"
import { writeImportedHttpCollection } from "../storage/imports"

function importOptions(args: string[]) {
  const format = args[0]
  const file = args[1]
  if (format !== "postman" && format !== "openapi") {
    throw new Error("Formato de importação precisa ser postman ou openapi.")
  }
  if (!file || file.startsWith("-")) throw new Error("Informe o arquivo a importar.")
  let output = ".tuiminal/http/imported"
  for (let index = 2; index < args.length; index += 1) {
    if (args[index] !== "--output" || !args[index + 1]) {
      throw new Error(`Opção desconhecida: ${args[index]}.`)
    }
    output = args[index + 1]!
    index += 1
  }
  return { format, file, output }
}

export async function importHttpCollectionCli(args: string[], root = process.cwd()) {
  try {
    const options = importOptions(args)
    const path = resolve(root, options.file)
    const source = await readFile(path, "utf8")
    const parsed = options.format === "openapi" ? YAML.parse(source) : JSON.parse(source)
    const report =
      options.format === "postman" ? importPostmanCollection(parsed) : importOpenApiDocument(parsed)
    const outputPath = await writeImportedHttpCollection(
      resolve(root, options.output),
      basename(path),
      report,
    )
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          format: report.format,
          output: outputPath,
          imported: report.requests.length,
          ignored: report.ignored,
          warnings: report.warnings,
        },
        null,
        2,
      )}\n`,
    )
    return 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}
