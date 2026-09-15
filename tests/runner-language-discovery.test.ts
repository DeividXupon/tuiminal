import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  discoverDenoCommands,
  discoverGoCommands,
  discoverJavaCommands,
  parseJsonWithComments,
} from "../packages/feature-runner/src/discovery/languages"
import { discoverPythonCommands } from "../packages/feature-runner/src/discovery/python"

const roots: string[] = []

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-runner-language-"))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("Go commands target all packages in the selected module", async () => {
  const root = fixture({ "go.mod": "module example.test/app\n" })
  const commands = await discoverGoCommands(root)
  for (const action of ["test", "vet", "build"]) {
    expect(commands.find((command) => command.id === `go:${action}`)).toMatchObject({
      program: "go",
      args: [action, "./..."],
      displayCommand: `go ${action} ./...`,
    })
  }
  expect(commands.find((command) => command.id === "go:run")?.args).toEqual(["run", "."])
})

test.each([
  ["pom.xml", "spring-boot", "mvnw", "mvn"],
  ["build.gradle.kts", "org.springframework.boot", "gradlew", "gradle"],
] as const)(
  "%s uses the selected project's wrapper, with a global fallback",
  async (file, content, wrapper, global) => {
    const root = fixture({ [file]: content })
    const fallback = await discoverJavaCommands(root)
    expect(fallback).toHaveLength(3)
    expect(fallback.every((command) => command.program === global)).toBe(true)
    writeFileSync(join(root, wrapper), "fixture wrapper")
    const commands = await discoverJavaCommands(root)
    expect(commands.map((command) => command.args)).toEqual(fallback.map((command) => command.args))
    expect(commands.every((command) => command.program === `./${wrapper}`)).toBe(true)
    expect(commands.every((command) => command.displayCommand.startsWith(`./${wrapper} `))).toBe(
      true,
    )
  },
)

test("JSONC comments and trailing commas never rewrite quoted task text", () => {
  const tasks = {
    dev: 'echo "/* not a comment */"',
    pattern: "echo ,} ,]",
    url: "curl https://example.test/path//suffix",
    escaped: 'echo \\" // still inside the string',
  }
  const entries = Object.entries(tasks).map(
    ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}, // task`,
  )
  const source = `{ /* project */ "tasks": {\n${entries.join("\n")}\n}, // last\n}`
  expect(parseJsonWithComments(source)).toEqual({ tasks })
  expect(() => parseJsonWithComments('{"value": 1/* separator */2}')).toThrow()
  expect(() => parseJsonWithComments('{"tasks": {} /* unclosed')).toThrow()
})

test("Deno discovery accepts inline comments without changing task descriptions", async () => {
  const command = 'echo "/* literal */ ,}"'
  const root = fixture({
    "deno.jsonc": `{ "tasks": { "dev": ${JSON.stringify(command)}, // inline\n}, }`,
  })
  expect(await discoverDenoCommands(root)).toMatchObject([
    { id: "deno:dev", program: "deno", args: ["task", "dev"], description: command },
  ])
})

test.each([
  [null, "python3", []],
  ["uv.lock", "uv", ["run", "python"]],
  ["poetry.lock", "poetry", ["run", "python"]],
  ["Pipfile", "pipenv", ["run", "python"]],
] as const)("Python interpreter arguments stay valid with %s", async (marker, program, prefix) => {
  const root = fixture({
    "manage.py": "# fixture",
    "pyproject.toml":
      '[project.scripts]\nserve = "app:main"\n[tool.pytest.ini_options]\n[tool.mypy]\n[tool.ruff]\n',
    ...(marker ? { [marker]: "" } : {}),
  })
  const commands = new Map(
    (await discoverPythonCommands(root)).map((command) => [command.id, command]),
  )
  for (const action of ["runserver", "test", "check"]) {
    expect(commands.get(`python:django:${action}`)).toMatchObject({
      program,
      args: [...prefix, "manage.py", action],
    })
  }
  expect(commands.get("python:django:migrations")?.args).toEqual([
    ...prefix,
    "manage.py",
    "showmigrations",
  ])
  expect(commands.get("python:pytest")?.args).toEqual([...prefix, "-m", "pytest"])
  expect(commands.get("python:mypy")?.args).toEqual([...prefix, "-m", "mypy", "."])
  expect(commands.get("python:ruff")).toMatchObject({
    program: marker ? program : "ruff",
    args: marker ? ["run", "ruff", "check", "."] : ["check", "."],
  })
  expect(commands.get("python:script:serve")).toMatchObject({
    program: marker ? program : "serve",
    args: marker ? ["run", "serve"] : [],
  })
})
