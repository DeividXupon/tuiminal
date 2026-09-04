import { resolve } from "node:path"

import type { RunnerCommand } from "../model/types"
import { fileExists, createCommand, readText } from "./shared"

export async function pythonEnvironment(root: string) {
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

export function pythonCommand(
  environment: Awaited<ReturnType<typeof pythonEnvironment>>,
  id: string,
  label: string,
  description: string,
  executable: string,
  args: string[] = [],
) {
  return createCommand("python", id, label, description, environment.program, [
    ...environment.prefix,
    executable,
    ...args,
  ])
}

export function pythonToolCommand(
  environment: Awaited<ReturnType<typeof pythonEnvironment>>,
  id: string,
  label: string,
  description: string,
  executable: string,
  args: string[] = [],
) {
  if (environment.prefix.length) {
    return createCommand("python", id, label, description, environment.program, [
      ...environment.prefix,
      executable,
      ...args,
    ])
  }
  return createCommand("python", id, label, description, executable, args)
}

export function discoverPythonEntryPoints(source: string) {
  const entries: string[] = []
  let matchingSection = false
  for (const line of source.split("\n")) {
    const section = line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/)?.[1]
    if (section) {
      matchingSection = section === "project.scripts" || section === "tool.poetry.scripts"
      continue
    }
    if (!matchingSection) continue
    const name = line.match(/^\s*([A-Za-z][\w.-]*)\s*=/)?.[1]
    if (name) entries.push(name)
  }
  return entries
}

export async function discoverPythonCommands(root: string) {
  const markerNames = [
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "poetry.lock",
    "uv.lock",
    "setup.py",
    "manage.py",
  ]
  const markerChecks = await Promise.all(markerNames.map((name) => fileExists(resolve(root, name))))
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

  const hasTests =
    (await fileExists(resolve(root, "tests"))) ||
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
      pythonToolCommand(environment, "ruff", "ruff check", "Executar o linter Ruff", "ruff", [
        "check",
        ".",
      ]),
    )
  }
  if (pyproject?.includes("[tool.mypy")) {
    commands.push(
      pythonCommand(environment, "mypy", "mypy", "Verificar os tipos do projeto Python", "python", [
        "-m",
        "mypy",
        ".",
      ]),
    )
  }

  return commands
}
