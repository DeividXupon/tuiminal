#!/usr/bin/env bun

import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string }
const VERSION = packageJson.version
const args = process.argv.slice(2)

function printHelp() {
  console.log(`Tuiminal ${VERSION}

Uso:
  tuiminal [diretório]

Exemplos:
  tuiminal
  tuiminal .
  tuiminal ../outro-projeto
  tuiminal /caminho/absoluto/do/repositorio

Opções:
  -h, --help       Exibir esta ajuda
  -v, --version    Exibir a versão`)
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
  console.error(`Opção desconhecida: ${unknownOption}\n`)
  printHelp()
  process.exit(1)
}

if (args.length > 1) {
  console.error("Informe somente um diretório.\n")
  printHelp()
  process.exit(1)
}

const targetDirectory = resolve(process.cwd(), args[0] ?? ".")

try {
  if (!statSync(targetDirectory).isDirectory()) {
    throw new Error("O caminho informado não é um diretório.")
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Diretório inválido."
  console.error(`Não foi possível abrir ${targetDirectory}: ${message}`)
  process.exit(1)
}

process.env.TUIMINAL_WORKDIR = targetDirectory
process.env.TUIMINAL_INITIAL_TAB = "git"

await import("../src/index")
