import { spawn, type ChildProcess } from "node:child_process"
import type { Dirent } from "node:fs"
import { access, readFile, readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, delimiter, relative, resolve } from "node:path"
import { stripVTControlCharacters } from "node:util"

export type RunnerCommandCategory =
  | "package"
  | "composer"
  | "php"
  | "python"
  | "go"
  | "rust"
  | "ruby"
  | "java"
  | "dotnet"
  | "deno"
  | "task"
  | "make"
  | "just"
  | "docker"
  | "custom"

export type RunnerCommand = {
  id: string
  label: string
  category: RunnerCommandCategory
  description: string
  program: string
  args: string[]
  displayCommand: string
}

export type RunnerOutputStream = "stdout" | "stderr"

export type RunnerProcessExit = {
  code: number | null
  signal: NodeJS.Signals | null
  stopped: boolean
}

export type RunnerProcessHandle = {
  pid: number | null
  stop: () => void
}

export type RunnerListeningPort = {
  groupId: number
  pid: number
  processName: string
  host: string
  port: number
}

export type RunnerProject = {
  path: string
  name: string
  displayPath: string
}

export type RunnerDirectoryEntry = {
  path: string
  name: string
  git: boolean
}

type RunnerProcessCallbacks = {
  onLine: (line: string, stream: RunnerOutputStream) => void
  onExit: (result: RunnerProcessExit) => void
}

export const RUNNER_WORKING_DIRECTORY = resolve(
  process.env.TUIMINAL_WORKDIR ?? process.cwd(),
)

const activeProcesses = new Set<ChildProcess>()

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function displayArgument(argument: string) {
  return /^[\w./:@-]+$/.test(argument)
    ? argument
    : `'${argument.replaceAll("'", "'\\''")}'`
}

function commandDisplay(program: string, args: string[]) {
  return [program, ...args].map(displayArgument).join(" ")
}

function createCommand(
  category: RunnerCommandCategory,
  id: string,
  label: string,
  description: string,
  program: string,
  args: string[] = [],
): RunnerCommand {
  return {
    id: `${category}:${id}`,
    label,
    category,
    description,
    program,
    args,
    displayCommand: commandDisplay(program, args),
  }
}

async function readText(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

function displayProjectPath(path: string) {
  const home = homedir()
  if (path === home) return "~"
  const fromHome = relative(home, path)
  return fromHome && !fromHome.startsWith("..")
    ? `~/${fromHome}`
    : path
}

const IGNORED_PROJECT_DIRECTORIES = new Set([
  "Applications",
  "Library",
  "Movies",
  "Music",
  "Pictures",
  "Public",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv",
])

function shouldSkipProjectDirectory(name: string) {
  return name.startsWith(".") || IGNORED_PROJECT_DIRECTORIES.has(name)
}

export async function discoverRunnerProjects(
  currentRoot = RUNNER_WORKING_DIRECTORY,
): Promise<RunnerProject[]> {
  const configuredRoots = process.env.TUIMINAL_PROJECT_ROOTS
    ?.split(delimiter)
    .map((path) => path.trim())
    .filter(Boolean)
  const roots = configuredRoots?.length ? configuredRoots : [homedir()]
  const queue = [...new Set([currentRoot, ...roots])].map((path) => ({
    path: resolve(path),
    depth: 0,
  }))
  const projects = new Map<string, RunnerProject>()
  let cursor = 0

  const scan = async () => {
    while (cursor < queue.length && projects.size < 300) {
      const item = queue[cursor]
      cursor += 1
      if (!item) continue
      let entries: Dirent<string>[]
      try {
        entries = await readdir(item.path, { withFileTypes: true })
      } catch {
        continue
      }

      if (entries.some((entry) => entry.name === ".git")) {
        if (!projects.has(item.path)) {
          projects.set(item.path, {
            path: item.path,
            name: basename(item.path),
            displayPath: displayProjectPath(item.path),
          })
        }
        continue
      }
      if (item.depth >= 7) continue

      for (const entry of entries) {
        if (!entry.isDirectory() || shouldSkipProjectDirectory(entry.name)) {
          continue
        }
        queue.push({
          path: resolve(item.path, entry.name),
          depth: item.depth + 1,
        })
      }
    }
  }

  await Promise.all(Array.from({ length: 16 }, () => scan()))
  return [...projects.values()].sort((left, right) => {
    if (left.path === resolve(currentRoot)) return -1
    if (right.path === resolve(currentRoot)) return 1
    const byName = left.name.localeCompare(right.name)
    return byName || left.path.localeCompare(right.path)
  })
}

export async function listRunnerDirectories(
  directory: string,
): Promise<RunnerDirectoryEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const directories = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== ".git" &&
          !IGNORED_PROJECT_DIRECTORIES.has(entry.name),
      )
      .map(async (entry) => {
        const path = resolve(directory, entry.name)
        return {
          path,
          name: entry.name,
          git: await fileExists(resolve(path, ".git")),
        }
      }),
  )
  return directories.sort((left, right) => {
    if (left.git !== right.git) return left.git ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

function compactDescription(value: unknown, fallback: string) {
  const items = Array.isArray(value) ? value : [value]
  const text = items
    .filter((item): item is string => typeof item === "string")
    .join(" → ")
    .replace(/\s+/g, " ")
    .trim()
  return text || fallback
}

function packageManagerCommand(
  packageManager: string,
  name: string,
  description: string,
): RunnerCommand {
  const args = ["run", name]
  return createCommand(
    "package",
    name,
    name,
    description,
    packageManager,
    args,
  )
}

async function detectPackageManager(root: string) {
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

async function discoverPackageCommands(root: string) {
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
    return scripts.map(([name, script]) =>
      packageManagerCommand(manager, name, script),
    )
  } catch {
    return []
  }
}

const COMPOSER_EVENT_NAMES = new Set([
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

async function discoverPhpCommands(root: string) {
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
        const description = typeof descriptions[name] === "string"
          ? descriptions[name]
          : compactDescription(script, `Script Composer: ${name}`)
        commands.push(
          createCommand(
            "composer",
            name,
            name,
            description,
            "composer",
            ["run-script", name],
          ),
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

async function pythonEnvironment(root: string) {
  if (await fileExists(resolve(root, "uv.lock"))) {
    return { program: "uv", prefix: ["run"] }
  }
  if (await fileExists(resolve(root, "poetry.lock"))) {
    return { program: "poetry", prefix: ["run"] }
  }
  if (await fileExists(resolve(root, "Pipfile"))) {
    return { program: "pipenv", prefix: ["run"] }
  }
  return { program: "python3", prefix: [] }
}

function pythonCommand(
  environment: Awaited<ReturnType<typeof pythonEnvironment>>,
  id: string,
  label: string,
  description: string,
  executable: string,
  args: string[] = [],
) {
  return createCommand(
    "python",
    id,
    label,
    description,
    environment.program,
    [...environment.prefix, executable, ...args],
  )
}

function pythonToolCommand(
  environment: Awaited<ReturnType<typeof pythonEnvironment>>,
  id: string,
  label: string,
  description: string,
  executable: string,
  args: string[] = [],
) {
  if (environment.prefix.length) {
    return createCommand(
      "python",
      id,
      label,
      description,
      environment.program,
      [...environment.prefix, executable, ...args],
    )
  }
  return createCommand(
    "python",
    id,
    label,
    description,
    executable,
    args,
  )
}

function discoverPythonEntryPoints(source: string) {
  const entries: string[] = []
  let matchingSection = false
  for (const line of source.split("\n")) {
    const section = line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/)?.[1]
    if (section) {
      matchingSection = section === "project.scripts" ||
        section === "tool.poetry.scripts"
      continue
    }
    if (!matchingSection) continue
    const name = line.match(/^\s*([A-Za-z][\w.-]*)\s*=/)?.[1]
    if (name) entries.push(name)
  }
  return entries
}

async function discoverPythonCommands(root: string) {
  const markerNames = [
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "poetry.lock",
    "uv.lock",
    "setup.py",
    "manage.py",
  ]
  const markerChecks = await Promise.all(
    markerNames.map((name) => fileExists(resolve(root, name))),
  )
  if (!markerChecks.some(Boolean)) return []

  const commands: RunnerCommand[] = []
  const environment = await pythonEnvironment(root)
  const pyproject = await readText(resolve(root, "pyproject.toml"))

  for (const name of pyproject ? discoverPythonEntryPoints(pyproject) : []) {
    commands.push(
      pythonToolCommand(
        environment,
        `script:${name}`,
        name,
        `Executar o entry point Python ${name}`,
        name,
      ),
    )
  }

  if (await fileExists(resolve(root, "manage.py"))) {
    commands.push(
      pythonCommand(
        environment,
        "django:runserver",
        "django runserver",
        "Iniciar o servidor de desenvolvimento do Django",
        "python",
        ["manage.py", "runserver"],
      ),
      pythonCommand(
        environment,
        "django:test",
        "django test",
        "Executar os testes Django",
        "python",
        ["manage.py", "test"],
      ),
      pythonCommand(
        environment,
        "django:check",
        "django check",
        "Verificar a configuração e problemas comuns do Django",
        "python",
        ["manage.py", "check"],
      ),
      pythonCommand(
        environment,
        "django:migrations",
        "django showmigrations",
        "Mostrar as migrations e seus estados",
        "python",
        ["manage.py", "showmigrations"],
      ),
    )
  }

  const hasTests = (await fileExists(resolve(root, "tests"))) ||
    (await fileExists(resolve(root, "pytest.ini"))) ||
    (await fileExists(resolve(root, "tox.ini"))) ||
    Boolean(pyproject?.includes("pytest"))
  if (hasTests) {
    commands.push(
      pythonCommand(
        environment,
        "pytest",
        "pytest",
        "Executar a suíte de testes Python",
        "python",
        ["-m", "pytest"],
      ),
    )
  }
  if (pyproject?.includes("[tool.ruff")) {
    commands.push(
      pythonToolCommand(
        environment,
        "ruff",
        "ruff check",
        "Executar o linter Ruff",
        "ruff",
        ["check", "."],
      ),
    )
  }
  if (pyproject?.includes("[tool.mypy")) {
    commands.push(
      pythonCommand(
        environment,
        "mypy",
        "mypy",
        "Verificar os tipos do projeto Python",
        "python",
        ["-m", "mypy", "."],
      ),
    )
  }

  return commands
}

async function discoverGoCommands(root: string) {
  if (!(await fileExists(resolve(root, "go.mod")))) return []
  return [
    createCommand("go", "run", "go run", "Executar o módulo Go", "go", ["run", "."]),
    createCommand("go", "test", "go test", "Executar todos os testes Go", "go", ["test", "./..."]),
    createCommand("go", "vet", "go vet", "Analisar problemas comuns no código Go", "go", ["vet", "./..."]),
    createCommand("go", "build", "go build", "Compilar todos os pacotes Go", "go", ["build", "./..."]),
  ]
}

async function discoverRustCommands(root: string) {
  if (!(await fileExists(resolve(root, "Cargo.toml")))) return []
  return [
    createCommand("rust", "run", "cargo run", "Executar o projeto Rust", "cargo", ["run"]),
    createCommand("rust", "test", "cargo test", "Executar os testes Rust", "cargo", ["test"]),
    createCommand("rust", "check", "cargo check", "Verificar o projeto sem gerar binário", "cargo", ["check"]),
    createCommand("rust", "clippy", "cargo clippy", "Executar o linter Clippy", "cargo", ["clippy"]),
    createCommand("rust", "build", "cargo build", "Compilar o projeto Rust", "cargo", ["build"]),
  ]
}

async function discoverRubyCommands(root: string) {
  if (!(await fileExists(resolve(root, "Gemfile")))) return []
  const commands: RunnerCommand[] = []
  if (await fileExists(resolve(root, "bin/rails"))) {
    commands.push(
      createCommand("ruby", "rails:server", "rails server", "Iniciar o servidor Rails", "bin/rails", ["server"]),
      createCommand("ruby", "rails:test", "rails test", "Executar os testes Rails", "bin/rails", ["test"]),
      createCommand("ruby", "rails:routes", "rails routes", "Listar as rotas Rails", "bin/rails", ["routes"]),
    )
  }
  if (
    (await fileExists(resolve(root, ".rspec"))) ||
    (await fileExists(resolve(root, "spec")))
  ) {
    commands.push(
      createCommand("ruby", "rspec", "rspec", "Executar a suíte RSpec", "bundle", ["exec", "rspec"]),
    )
  }
  if (await fileExists(resolve(root, "Rakefile"))) {
    commands.push(
      createCommand("ruby", "rake:test", "rake test", "Executar a task de testes do Rake", "bundle", ["exec", "rake", "test"]),
    )
  }
  return commands
}

async function discoverJavaCommands(root: string) {
  const pom = await readText(resolve(root, "pom.xml"))
  if (pom) {
    const program = (await fileExists(resolve(root, "mvnw"))) ? "./mvnw" : "mvn"
    const commands = [
      createCommand("java", "maven:test", "maven test", "Executar os testes Maven", program, ["test"]),
      createCommand("java", "maven:package", "maven package", "Compilar e empacotar o projeto Maven", program, ["package"]),
    ]
    if (pom.includes("spring-boot")) {
      commands.unshift(
        createCommand("java", "spring:run", "spring boot run", "Iniciar a aplicação Spring Boot", program, ["spring-boot:run"]),
      )
    }
    return commands
  }

  const gradlePath = (await fileExists(resolve(root, "build.gradle.kts")))
    ? resolve(root, "build.gradle.kts")
    : resolve(root, "build.gradle")
  const gradle = await readText(gradlePath)
  if (!gradle) return []
  const program = (await fileExists(resolve(root, "gradlew"))) ? "./gradlew" : "gradle"
  const commands = [
    createCommand("java", "gradle:test", "gradle test", "Executar os testes Gradle", program, ["test"]),
    createCommand("java", "gradle:build", "gradle build", "Compilar o projeto Gradle", program, ["build"]),
  ]
  if (gradle.includes("org.springframework.boot") || gradle.includes("spring-boot")) {
    commands.unshift(
      createCommand("java", "gradle:boot-run", "gradle bootRun", "Iniciar a aplicação Spring Boot", program, ["bootRun"]),
    )
  }
  return commands
}

async function discoverDotnetCommands(root: string) {
  let entries: string[] = []
  try {
    entries = await readdir(root)
  } catch {
    return []
  }
  if (!entries.some((name) => /\.(?:sln|csproj|fsproj)$/i.test(name))) return []
  return [
    createCommand("dotnet", "run", "dotnet run", "Executar o projeto .NET", "dotnet", ["run"]),
    createCommand("dotnet", "watch", "dotnet watch", "Executar e recarregar ao alterar arquivos", "dotnet", ["watch", "run"]),
    createCommand("dotnet", "test", "dotnet test", "Executar os testes .NET", "dotnet", ["test"]),
    createCommand("dotnet", "build", "dotnet build", "Compilar a solução .NET", "dotnet", ["build"]),
  ]
}

function parseJsonWithComments(source: string) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(withoutComments) as { tasks?: Record<string, unknown> }
}

async function discoverDenoCommands(root: string) {
  const source = (await readText(resolve(root, "deno.json"))) ??
    (await readText(resolve(root, "deno.jsonc")))
  if (!source) return []
  try {
    const deno = parseJsonWithComments(source)
    return Object.entries(deno.tasks ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([name, task]) =>
        createCommand("deno", name, name, task, "deno", ["task", name]),
      )
  } catch {
    return []
  }
}

function discoverTaskfileTargets(source: string) {
  const lines = source.split("\n")
  const tasksLine = lines.findIndex((line) => /^\s*tasks:\s*(?:#.*)?$/.test(line))
  if (tasksLine === -1) return []
  const baseIndent = lines[tasksLine]?.match(/^\s*/)?.[0].length ?? 0
  const targets: string[] = []
  let childIndent: number | null = null

  for (const line of lines.slice(tasksLine + 1)) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    if (indent <= baseIndent) break
    if (childIndent === null) childIndent = indent
    if (indent !== childIndent) continue
    const target = line.trim().match(/^([A-Za-z0-9][\w:.-]*):/)?.[1]
    if (target) targets.push(target)
  }
  return targets
}

async function discoverTaskfileCommands(root: string) {
  const source = (await readText(resolve(root, "Taskfile.yml"))) ??
    (await readText(resolve(root, "Taskfile.yaml")))
  if (!source) return []
  return discoverTaskfileTargets(source).map((target) =>
    createCommand("task", target, target, `Taskfile: ${target}`, "task", [target]),
  )
}

function discoverRecipeTargets(
  source: string,
  kind: "make" | "just",
): RunnerCommand[] {
  const seen = new Set<string>()
  const targetPattern = kind === "make"
    ? /^([A-Za-z0-9][\w.-]*):(?:\s|$)/
    : /^([A-Za-z][\w-]*)(?:\s[^:=]*)?:\s*$/
  const ignored = new Set([
    "all",
    "default",
    "help",
    "clean",
    "install",
  ])

  return source
    .split("\n")
    .map((line) => line.match(targetPattern)?.[1] ?? "")
    .filter((target) => {
      if (!target || target.startsWith(".") || seen.has(target)) return false
      seen.add(target)
      return true
    })
    .sort((left, right) => {
      const leftIgnored = ignored.has(left)
      const rightIgnored = ignored.has(right)
      if (leftIgnored !== rightIgnored) return leftIgnored ? 1 : -1
      return left.localeCompare(right)
    })
    .slice(0, 24)
    .map((target) => {
      const program = kind === "make" ? "make" : "just"
      const args = [target]
      return {
        id: `${kind}:${target}`,
        label: target,
        category: kind,
        description: `${program} ${target}`,
        program,
        args,
        displayCommand: commandDisplay(program, args),
      }
    })
}

async function discoverFileCommands(
  root: string,
  names: string[],
  kind: "make" | "just",
) {
  for (const name of names) {
    const path = resolve(root, name)
    if (!(await fileExists(path))) continue
    try {
      return discoverRecipeTargets(await readFile(path, "utf8"), kind)
    } catch {
      return []
    }
  }
  return []
}

async function discoverDockerCommands(root: string): Promise<RunnerCommand[]> {
  const composeNames = [
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
  ]
  const hasCompose = await Promise.all(
    composeNames.map((name) => fileExists(resolve(root, name))),
  )
  if (!hasCompose.some(Boolean)) return []

  const definitions = [
    {
      id: "docker:up",
      label: "compose up",
      description: "Subir os serviços e acompanhar os logs",
      args: ["compose", "up"],
    },
    {
      id: "docker:ps",
      label: "compose ps",
      description: "Listar o estado dos serviços",
      args: ["compose", "ps"],
    },
    {
      id: "docker:logs",
      label: "compose logs",
      description: "Acompanhar os últimos logs dos serviços",
      args: ["compose", "logs", "--follow", "--tail=200"],
    },
  ]
  return definitions.map((definition) => ({
    ...definition,
    category: "docker" as const,
    program: "docker",
    displayCommand: commandDisplay("docker", definition.args),
  }))
}

export async function discoverRunnerCommands(
  root = RUNNER_WORKING_DIRECTORY,
) {
  const discovered = await Promise.all([
    discoverPackageCommands(root),
    discoverPhpCommands(root),
    discoverPythonCommands(root),
    discoverGoCommands(root),
    discoverRustCommands(root),
    discoverRubyCommands(root),
    discoverJavaCommands(root),
    discoverDotnetCommands(root),
    discoverDenoCommands(root),
    discoverTaskfileCommands(root),
    discoverFileCommands(root, ["Makefile", "makefile"], "make"),
    discoverFileCommands(root, ["justfile", "Justfile"], "just"),
    discoverDockerCommands(root),
  ])
  const unique = new Map<string, RunnerCommand>()
  for (const command of discovered.flat()) {
    if (!unique.has(command.displayCommand)) {
      unique.set(command.displayCommand, command)
    }
  }
  return [...unique.values()]
}

export function createShellRunnerCommand(source: string): RunnerCommand {
  const shell = process.env.SHELL ??
    (process.platform === "win32" ? "cmd.exe" : "/bin/sh")
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", source]
    : ["-lc", source]
  return {
    id: `custom:${source}`,
    label: source,
    category: "custom",
    description: "Comando digitado manualmente",
    program: shell,
    args,
    displayCommand: source,
  }
}

async function captureProcessOutput(
  program: string,
  args: string[],
  timeoutMilliseconds = 2500,
) {
  return await new Promise<string>((resolveOutput) => {
    let output = ""
    let settled = false
    const child = spawn(program, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"],
    })
    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => {
      output += chunk
    })
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolveOutput(output)
    }
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      finish()
    }, timeoutMilliseconds)
    child.once("error", finish)
    child.once("close", finish)
  })
}

function parseListeningPorts(source: string, groupId: number) {
  const ports: RunnerListeningPort[] = []
  let pid = 0
  let processName = "processo"
  for (const line of source.split("\n")) {
    const field = line[0]
    const value = line.slice(1)
    if (field === "p") {
      pid = Number.parseInt(value, 10)
    } else if (field === "c") {
      processName = value
    } else if (field === "n" && pid) {
      const address = value.match(/^(.*):(\d+)$/)
      if (!address) continue
      const port = Number.parseInt(address[2] ?? "", 10)
      if (!Number.isFinite(port)) continue
      ports.push({
        groupId,
        pid,
        processName,
        host: address[1] || "*",
        port,
      })
    }
  }
  return ports
}

export async function discoverRunnerListeningPorts(
  processGroupIds: number[],
): Promise<RunnerListeningPort[]> {
  if (!processGroupIds.length || process.platform === "win32") return []
  const discovered = await Promise.all(
    [...new Set(processGroupIds)].map(async (groupId) => {
      const output = await captureProcessOutput("lsof", [
        "-nP",
        "-a",
        "-g",
        String(groupId),
        "-iTCP",
        "-sTCP:LISTEN",
        "-Fpcn",
      ])
      return parseListeningPorts(output, groupId)
    }),
  )
  const unique = new Map<string, RunnerListeningPort>()
  for (const port of discovered.flat()) {
    const key = `${port.groupId}:${port.pid}:${port.host}:${port.port}`
    if (!unique.has(key)) unique.set(key, port)
  }
  return [...unique.values()].sort((left, right) => left.port - right.port)
}

function signalProcess(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // The process already exited.
    }
  }
}

function pipeLines(
  child: ChildProcess,
  stream: RunnerOutputStream,
  callback: RunnerProcessCallbacks["onLine"],
) {
  const source = stream === "stdout" ? child.stdout : child.stderr
  if (!source) return
  source.setEncoding("utf8")
  let pending = ""
  const flush = (includePending: boolean) => {
    const normalized = pending.replace(/\r(?!\n)/g, "\n")
    const lines = normalized.split("\n")
    pending = includePending ? "" : (lines.pop() ?? "")
    for (const line of lines) {
      if (line) callback(stripVTControlCharacters(line), stream)
    }
    if (includePending && pending) {
      callback(stripVTControlCharacters(pending), stream)
      pending = ""
    }
  }
  source.on("data", (chunk: string) => {
    pending += chunk
    flush(false)
  })
  source.on("end", () => flush(true))
}

export function startRunnerProcess(
  root: string,
  command: RunnerCommand,
  callbacks: RunnerProcessCallbacks,
): RunnerProcessHandle {
  let stopped = false
  let exited = false
  const child = spawn(command.program, command.args, {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "1",
      CLICOLOR_FORCE: "1",
    },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
  activeProcesses.add(child)
  pipeLines(child, "stdout", callbacks.onLine)
  pipeLines(child, "stderr", callbacks.onLine)

  child.once("error", (error) => {
    callbacks.onLine(`Não foi possível executar: ${error.message}`, "stderr")
  })
  child.once("close", (code, signal) => {
    exited = true
    activeProcesses.delete(child)
    callbacks.onExit({ code, signal, stopped })
  })

  return {
    pid: child.pid ?? null,
    stop: () => {
      if (exited || stopped) return
      stopped = true
      signalProcess(child, "SIGTERM")
    },
  }
}

export function stopAllRunnerProcesses() {
  for (const child of activeProcesses) signalProcess(child, "SIGTERM")
  activeProcesses.clear()
}
