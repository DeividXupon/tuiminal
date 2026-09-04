#!/usr/bin/env bun

import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { translateUi } from "../src/shared/i18n/index"
import { initializeUiSettings } from "../src/core/settings/theme"
import { DEFAULT_TOOL, TOOL_COMMANDS, type ToolId as ToolCommand } from "../src/app/tool-catalog"

initializeUiSettings()

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string }
const VERSION = packageJson.version
const args = process.argv.slice(2)

function printHelp() {
  const directory = translateUi("diretório")
  const tool = translateUi("ferramenta")
  console.log(`Tuiminal ${VERSION}

${translateUi("Uso:")}
  tuiminal [${directory}]
  tuiminal <${tool}> [${directory}]

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
  -v, --version    ${translateUi("Exibir a versão")}`)
}

if (args.includes("--help") || args.includes("-h")) {
  printHelp()
  process.exit(0)
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
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
