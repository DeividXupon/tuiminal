#!/usr/bin/env bun

import { statSync } from "node:fs"
import { resolve } from "node:path"
import packageMetadata from "../package.json" with { type: "json" }
import { DEFAULT_TOOL, TOOL_COMMANDS, type ToolId as ToolCommand } from "../src/tool-catalog"
const VERSION = packageMetadata.version
const args = process.argv.slice(2)
const helpRequested = args.includes("--help") || args.includes("-h")

if (!helpRequested && (args.includes("--version") || args.includes("-v"))) {
  console.log(VERSION)
  process.exit(0)
}

if (args[0] === "--internal-sqlite-worker") {
  await (await import("../src/features/loader")).runInstalledSqliteWorker()
  // The worker stays alive through its IPC message listener.
} else if (args[0] === "--internal-terminal-sidebar") {
  const { initializeUiSettings } = await import("@xupon/tuiminal-core/settings/theme")
  initializeUiSettings()
  process.exit(
    await (await import("../src/features/loader")).runInstalledTerminalSidebar(args.slice(1)),
  )
} else {
  const { initializeUiSettings } = await import("@xupon/tuiminal-core/settings/theme")
  const { translateUi } = await import("@xupon/tuiminal-core/i18n/index")
  initializeUiSettings()

  function printHelp() {
    const directory = translateUi("diretório")
    const tool = translateUi("ferramenta")
    console.log(`Tuiminal ${VERSION}

${translateUi("Uso:")}
  tuiminal [${directory}]
  tuiminal <${tool}> [${directory}]
  tuiminal features [install <database|git|runner|http|terminal>...]
  tuiminal http run <file.http>[#request] [--env <name>] [--report text|json|junit]
  tuiminal postman login [--region us|eu] [--api-key-stdin]
  tuiminal postman workspaces|collections|environments|pull

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

  if (helpRequested && args[0] !== "postman") {
    printHelp()
    process.exit(0)
  }

  if (args[0] === "features" && args[1] === "install") {
    const { installFeaturesCli } = await import("../src/features/cli")
    process.exit(await installFeaturesCli(args.slice(2)))
  }
  if (args[0] === "postman") {
    process.exit(
      await (await import("../src/features/cli")).httpFeatureCli("postman", args.slice(1)),
    )
  }
  if (args[0] === "features") {
    if (args.length > 1) {
      console.error(translateUi("Comando de ferramenta inválido"))
      process.exit(1)
    }
    process.env.TUIMINAL_OPEN_FEATURES = "1"
    args.shift()
  }
  const requestedCommand = args[0]
  const selectedTool: ToolCommand | null =
    requestedCommand && Object.hasOwn(TOOL_COMMANDS, requestedCommand)
      ? TOOL_COMMANDS[requestedCommand as keyof typeof TOOL_COMMANDS]
      : null
  if (selectedTool === "http" && args[1] === "run") {
    process.exit(await (await import("../src/features/cli")).httpFeatureCli("run", args.slice(2)))
  }
  if (selectedTool === "http" && args[1] === "import") {
    process.exit(
      await (await import("../src/features/cli")).httpFeatureCli("import", args.slice(2)),
    )
  }

  const unknownOption = args.find((argument) => argument.startsWith("-"))
  if (unknownOption) {
    console.error(`${translateUi("Opção desconhecida")}: ${unknownOption}\n`)
    printHelp()
    process.exit(1)
  }

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
}
