import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import type { RunnerCommand } from "../model/types"
import { fileExists, createCommand, readText } from "./shared"

export function compactDescription(value: unknown, fallback: string) {
  const items = Array.isArray(value) ? value : [value]
  const text = items
    .filter((item): item is string => typeof item === "string")
    .join(" → ")
    .replace(/\s+/g, " ")
    .trim()
  return text || fallback
}

export function packageManagerCommand(
  packageManager: string,
  name: string,
  description: string,
): RunnerCommand {
  const args = ["run", name]
  return createCommand("package", name, name, description, packageManager, args)
}

export async function detectPackageManager(root: string) {
  if (
    (await fileExists(resolve(root, "bun.lock"))) ||
    (await fileExists(resolve(root, "bun.lockb")))
  ) {
    return "bun"
  }
  if (await fileExists(resolve(root, "pnpm-lock.yaml"))) return "pnpm"
  if (await fileExists(resolve(root, "yarn.lock"))) return "yarn"
  return "npm"
}

export async function discoverPackageCommands(root: string) {
  const packagePath = resolve(root, "package.json")
  if (!(await fileExists(packagePath))) return []

  try {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      scripts?: Record<string, unknown>
    }
    const manager = await detectPackageManager(root)
    const scripts = Object.entries(packageJson.scripts ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    )
    const priority = ["dev", "start", "test", "lint", "check", "build"]
    scripts.sort((left, right) => {
      const leftPriority = priority.indexOf(left[0])
      const rightPriority = priority.indexOf(right[0])
      if (leftPriority !== -1 || rightPriority !== -1) {
        if (leftPriority === -1) return 1
        if (rightPriority === -1) return -1
        return leftPriority - rightPriority
      }
      return left[0].localeCompare(right[0])
    })
    return scripts.map(([name, script]) => packageManagerCommand(manager, name, script))
  } catch {
    return []
  }
}

export const COMPOSER_EVENT_NAMES = new Set([
  "command",
  "init",
  "post-archive-cmd",
  "post-autoload-dump",
  "post-create-project-cmd",
  "post-file-download",
  "post-install-cmd",
  "post-package-install",
  "post-package-uninstall",
  "post-package-update",
  "post-root-package-install",
  "post-status-cmd",
  "post-update-cmd",
  "pre-archive-cmd",
  "pre-autoload-dump",
  "pre-command-run",
  "pre-file-download",
  "pre-install-cmd",
  "pre-operations-exec",
  "pre-package-install",
  "pre-package-uninstall",
  "pre-package-update",
  "pre-pool-create",
  "pre-update-cmd",
])

export async function discoverPhpCommands(root: string) {
  const composerPath = resolve(root, "composer.json")
  const composerSource = await readText(composerPath)
  const commands: RunnerCommand[] = []

  if (composerSource) {
    try {
      const composer = JSON.parse(composerSource) as {
        scripts?: Record<string, unknown>
        "scripts-descriptions"?: Record<string, unknown>
      }
      const descriptions = composer["scripts-descriptions"] ?? {}
      for (const [name, script] of Object.entries(composer.scripts ?? {})) {
        if (COMPOSER_EVENT_NAMES.has(name)) continue
        const description =
          typeof descriptions[name] === "string"
            ? descriptions[name]
            : compactDescription(script, `Script Composer: ${name}`)
        commands.push(
          createCommand("composer", name, name, description, "composer", ["run-script", name]),
        )
      }
      commands.push(
        createCommand(
          "composer",
          "validate",
          "composer validate",
          "Validar o composer.json e o composer.lock",
          "composer",
          ["validate"],
        ),
        createCommand(
          "composer",
          "scripts",
          "composer scripts",
          "Listar os scripts Composer disponíveis",
          "composer",
          ["run-script", "--list"],
        ),
      )
    } catch {
      // Other PHP markers can still be detected from a malformed composer.json.
    }
  }

  if (await fileExists(resolve(root, "artisan"))) {
    commands.push(
      createCommand(
        "php",
        "artisan:serve",
        "artisan serve",
        "Iniciar o servidor de desenvolvimento do Laravel",
        "php",
        ["artisan", "serve"],
      ),
      createCommand(
        "php",
        "artisan:route-list",
        "artisan route:list",
        "Listar as rotas da aplicação Laravel",
        "php",
        ["artisan", "route:list"],
      ),
      createCommand(
        "php",
        "artisan:migrate-status",
        "artisan migrate:status",
        "Mostrar o estado das migrations sem aplicá-las",
        "php",
        ["artisan", "migrate:status"],
      ),
      createCommand(
        "php",
        "artisan:list",
        "artisan list",
        "Listar todos os comandos Artisan disponíveis",
        "php",
        ["artisan", "list"],
      ),
    )
  }

  if (await fileExists(resolve(root, "bin/console"))) {
    commands.push(
      createCommand(
        "php",
        "symfony:list",
        "console list",
        "Listar os comandos Symfony disponíveis",
        "php",
        ["bin/console", "list"],
      ),
      createCommand(
        "php",
        "symfony:about",
        "console about",
        "Mostrar informações do projeto Symfony",
        "php",
        ["bin/console", "about"],
      ),
      createCommand(
        "php",
        "symfony:routes",
        "console debug:router",
        "Listar e inspecionar as rotas Symfony",
        "php",
        ["bin/console", "debug:router"],
      ),
      createCommand(
        "php",
        "symfony:lint-container",
        "console lint:container",
        "Validar a configuração do container Symfony",
        "php",
        ["bin/console", "lint:container"],
      ),
    )
  }

  for (const testRunner of ["pest", "phpunit"]) {
    const binary = `vendor/bin/${testRunner}`
    if (!(await fileExists(resolve(root, binary)))) continue
    commands.push(
      createCommand(
        "php",
        testRunner,
        testRunner,
        `Executar a suíte de testes com ${testRunner}`,
        `./${binary}`,
      ),
    )
    break
  }

  return commands
}
