import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  discoverRunnerCommands,
  resolveRunnerProjectContext,
  resolveRunnerSessionScope,
} from "../src/features/runner/services/runner"

describe("runner project detection", () => {
  let projectRoot = ""

  beforeAll(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "tuiminal-runner-test-"))
    mkdirSync(join(projectRoot, ".git"))
    writeFileSync(join(projectRoot, ".git", "HEAD"), "ref: refs/heads/main\n")
    writeFileSync(join(projectRoot, "bun.lock"), "")
    writeFileSync(
      join(projectRoot, "package.json"),
      JSON.stringify({ scripts: { dev: "vite", test: "bun test" } }),
    )
    writeFileSync(
      join(projectRoot, "composer.json"),
      JSON.stringify({
        scripts: { quality: "phpstan analyse" },
        "scripts-descriptions": { quality: "Run PHP quality checks" },
      }),
    )
    writeFileSync(join(projectRoot, "artisan"), "#!/usr/bin/env php\n")
    writeFileSync(
      join(projectRoot, "Taskfile.yml"),
      "tasks:\n  verify:\n    cmds:\n      - echo ok\n",
    )
    writeFileSync(join(projectRoot, "compose.yml"), "services: {}\n")
  })

  afterAll(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  test("discovers commands from every supported fixture marker", async () => {
    const commands = await discoverRunnerCommands(projectRoot)
    const byId = new Map(commands.map((command) => [command.id, command]))

    expect(byId.get("package:dev")).toMatchObject({
      program: "bun",
      args: ["run", "dev"],
    })
    expect(byId.get("composer:quality")).toMatchObject({
      program: "composer",
      args: ["run-script", "quality"],
    })
    expect(byId.get("php:artisan:serve")).toMatchObject({
      program: "php",
      args: ["artisan", "serve"],
    })
    expect(byId.get("task:verify")).toMatchObject({
      program: "task",
      args: ["verify"],
    })
    expect(byId.get("docker:up")).toMatchObject({
      program: "docker",
      args: ["compose", "up"],
    })
  })

  test("uses the current project root when opened from one of its subfolders", async () => {
    const nested = join(projectRoot, "src", "features")
    mkdirSync(nested, { recursive: true })

    const context = await resolveRunnerProjectContext(nested)

    expect(context?.root).toBe(projectRoot)
    expect(context?.commands.some((command) => command.id === "package:dev")).toBe(true)
    expect(resolveRunnerSessionScope(nested)).toBe(projectRoot)
  })

  test("does not treat an unrelated directory itself as a Runner project", async () => {
    const unrelated = mkdtempSync(join(tmpdir(), "tuiminal-no-project-"))
    try {
      const context = await resolveRunnerProjectContext(unrelated)
      expect(context).toBeNull()
      expect(resolveRunnerSessionScope(unrelated)).toBe(unrelated)
    } finally {
      rmSync(unrelated, { recursive: true, force: true })
    }
  })

  test("ignores an empty .git marker in an ancestor", async () => {
    const ancestor = mkdtempSync(join(tmpdir(), "tuiminal-invalid-git-"))
    const nested = join(ancestor, "service")
    try {
      mkdirSync(join(ancestor, ".git"))
      mkdirSync(nested)
      writeFileSync(join(nested, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }))

      expect(resolveRunnerSessionScope(nested)).toBe(nested)
      expect(await resolveRunnerProjectContext(nested)).toMatchObject({ root: nested })
    } finally {
      rmSync(ancestor, { recursive: true, force: true })
    }
  })
})
