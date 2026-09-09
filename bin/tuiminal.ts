#!/usr/bin/env bun

import { statSync } from "node:fs"
import { resolve } from "node:path"
import packageMetadata from "../package.json" with { type: "json" }
import { DEFAULT_TOOL, TOOL_COMMANDS, type ToolId as ToolCommand } from "../src/app/tool-catalog"
import { initializeUiSettings } from "../src/core/settings/theme"
import { translateUi } from "../src/shared/i18n/index"

initializeUiSettings()

const VERSION = packageMetadata.version
const args = process.argv.slice(2)

function printHelp() {
  const directory = translateUi("diretório")
  const tool = translateUi("ferramenta")
  console.log(`Tuiminal ${VERSION}

${translateUi("Uso:")}
  tuiminal [${directory}]
  tuiminal <${tool}> [${directory}]
  tuiminal http run <file.http>[#request] [--env <name>] [--report text|json|junit]

${translateUi("Exemplos:")}
  tuiminal
  tuiminal banco
  tuiminal git
  tuiminal runner ../outro-projeto
  tuiminal http /caminho/do/projeto
  tuiminal .
  tuiminal ../outro-projeto
  tuiminal /caminho/absoluto/do/repositorio

${translateUi("Ferramentas:")}
  banco, git, runner, http, terminal

${translateUi("Opções:")}
  -h, --help       ${translateUi("Exibir esta ajuda")}
  -v, --version    ${translateUi("Exibir a versão")}

HTTP run:
  --allow-private-redirect-to <origin>  ${translateUi("Autorizar body/URL privada para esta origem exata")}
  --allow-http-redirect-to <origin>     ${translateUi("Autorizar downgrade HTTPS → HTTP para esta origem exata")}
  --allow-insecure-tls                 ${translateUi("Autorizar TLS sem verificação neste comando")}`)
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp()
  process.exit(0)
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
}

const commandTool =
  args[0] && args[0] in TOOL_COMMANDS ? TOOL_COMMANDS[args[0] as keyof typeof TOOL_COMMANDS] : null
if (commandTool === "http" && args[1] === "run") {
  const { runHttpHeadless } = await import("../src/features/http/cli/run")
  process.exit(await runHttpHeadless(args.slice(2)))
}
if (commandTool === "http" && args[1] === "import") {
  const { importHttpCollectionCli } = await import("../src/features/http/cli/import")
  process.exit(await importHttpCollectionCli(args.slice(2)))
}

const unknownOption = args.find((argument) => argument.startsWith("-"))
if (unknownOption) {
  console.error(`${translateUi("Opção desconhecida")}: ${unknownOption}\n`)
  printHelp()
  process.exit(1)
}

const requestedCommand = args[0]
const selectedTool: ToolCommand | null =
  requestedCommand && requestedCommand in TOOL_COMMANDS
    ? TOOL_COMMANDS[requestedCommand as keyof typeof TOOL_COMMANDS]
    : null
const directoryArguments = selectedTool ? args.slice(1) : args

if (directoryArguments.length > 1) {
  console.error(`${translateUi("Informe uma ferramenta e, opcionalmente, um diretório.")}\n`)
  printHelp()
  process.exit(1)
}

const targetDirectory = resolve(process.cwd(), directoryArguments[0] ?? ".")

try {
  if (!statSync(targetDirectory).isDirectory()) {
    throw new Error(translateUi("O caminho informado não é um diretório."))
  }
} catch (error) {
  const message = error instanceof Error ? error.message : translateUi("Diretório inválido.")
  console.error(`${translateUi("Não foi possível abrir")} ${targetDirectory}: ${message}`)
  process.exit(1)
}

process.env.TUIMINAL_WORKDIR = targetDirectory
process.env.TUIMINAL_INITIAL_TAB = selectedTool ?? DEFAULT_TOOL
if (selectedTool) process.env.TUIMINAL_ONLY_TAB = selectedTool

await import("../src/index")
