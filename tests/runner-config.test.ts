import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  exportRunnerLog,
  listSavedRunnerCommands,
  loadRunnerHistory,
  loadRunnerSession,
  loadRunnerStartupState,
  normalizeRunnerManualCommand,
  parseMprocsConfig,
  parseProcfile,
  parseRunnerEnv,
  parseTuiminalRunnerConfig,
  removeSavedRunnerCommand,
  runnerPortUrl,
  runnerProcessEnvironment,
  saveRunnerCommand,
  saveRunnerHistoryEntry,
  saveRunnerSession,
} from "../packages/feature-runner/src/storage/runner-config"
import {
  approveRunnerAutostart,
  createRunnerAutostartReview,
  isRunnerAutostartTrusted,
} from "../packages/feature-runner/src/storage/autostart-trust"
import { createShellRunnerCommand } from "../packages/feature-runner/src/services/shell-command"

describe("runner configuration", () => {
  test("parses Tuiminal commands, profiles and policies", () => {
    const root = "/tmp/example"
    const parsed = parseTuiminalRunnerConfig(
      `
profiles:
  dev:
    envFile: .env.dev
    env:
      FEATURE: enabled
commands:
  api:
    command: bun run dev
    profile: dev
    cwd: services/api
    interactive: true
    autostart: true
    restart: on-failure
    restartDelayMs: 750
    maxRestarts: 3
    persistLogs: true
    health:
      type: port
      port: 3000
`,
      root,
    )

    expect(parsed.profiles[0]).toMatchObject({
      id: "config:dev",
      label: "dev",
      envFile: "/tmp/example/.env.dev",
    })
    expect(parsed.commands[0]).toMatchObject({
      id: "tuiminal:api",
      command: "bun run dev",
      cwd: "/tmp/example/services/api",
      interactive: true,
      autostart: true,
      restartPolicy: "on-failure",
      restartDelayMs: 750,
      maxRestarts: 3,
      persistLogs: true,
      env: { FEATURE: "enabled" },
      healthCheck: { type: "port", host: "127.0.0.1", port: 3000 },
    })
  })

  test("imports mprocs and Procfile commands without implicit autostart", () => {
    expect(
      parseMprocsConfig(
        `
procs:
  web: npm run dev
  worker:
    shell: bun worker.ts
    autostart: true
`,
        "/tmp/project",
      ),
    ).toMatchObject([
      { label: "web", command: "npm run dev", autostart: false },
      { label: "worker", command: "bun worker.ts", autostart: false },
    ])
    expect(
      parseProcfile("web: npm start\n# ignored\nworker: bun worker.ts\n", "/tmp/project"),
    ).toMatchObject([
      { label: "web", command: "npm start", source: "procfile" },
      { label: "worker", command: "bun worker.ts", source: "procfile" },
    ])
  })

  test("requires per-project trust for the exact autostart configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "tuiminal-runner-autostart-"))
    const trustPath = join(root, "config", "trust.json")
    const command = createShellRunnerCommand("bun run dev", {
      id: "tuiminal:dev",
      label: "Dev",
      source: "tuiminal",
      workingDirectory: join(root, "service"),
      env: { PUBLIC_FLAG: "enabled", SECRET_TOKEN: "secret-value" },
      envFile: join(root, ".env.dev"),
      autostart: true,
      interactive: true,
      restartPolicy: "on-failure",
    })
    const profile = {
      id: "config:dev",
      label: "dev",
      env: { PROFILE_FLAG: "one" },
      envFile: join(root, ".env.profile"),
    }
    const review = createRunnerAutostartReview(root, [command], profile)
    if (!review) throw new Error("Expected an autostart review")

    expect(isRunnerAutostartTrusted(review, trustPath)).toBe(false)
    expect(review.commands[0]).toMatchObject({
      command: "bun run dev",
      cwd: join(root, "service"),
      environmentNames: ["PUBLIC_FLAG", "SECRET_TOKEN"],
      interactive: true,
    })
    approveRunnerAutostart(review, trustPath)
    expect(isRunnerAutostartTrusted(review, trustPath)).toBe(true)
    expect(statSync(trustPath).mode & 0o777).toBe(0o600)
    const stored = readFileSync(trustPath, "utf8")
    expect(stored).not.toContain("secret-value")
    expect(stored).not.toContain("bun run dev")

    const changedCommand = createRunnerAutostartReview(
      root,
      [{ ...command, displayCommand: "bun run changed" }],
      profile,
    )
    const changedEnvironment = createRunnerAutostartReview(
      root,
      [{ ...command, env: { ...command.env, SECRET_TOKEN: "changed" } }],
      profile,
    )
    const changedProfile = createRunnerAutostartReview(root, [command], {
      ...profile,
      env: { PROFILE_FLAG: "two" },
    })
    expect(changedCommand?.fingerprint).not.toBe(review.fingerprint)
    expect(changedEnvironment?.fingerprint).not.toBe(review.fingerprint)
    expect(changedProfile?.fingerprint).not.toBe(review.fingerprint)
    expect(isRunnerAutostartTrusted(changedCommand!, trustPath)).toBe(false)
  })

  test("layers environment files and explicit variables", () => {
    const root = mkdtempSync(join(tmpdir(), "tuiminal-runner-env-"))
    const profileFile = join(root, ".env.profile")
    const commandFile = join(root, ".env.command")
    writeFileSync(profileFile, "ORDER=profile-file\nPROFILE_ONLY=yes\n")
    writeFileSync(commandFile, "ORDER=command-file\nCOMMAND_ONLY=yes\n")

    const environment = runnerProcessEnvironment(
      { id: "dev", label: "dev", envFile: profileFile, env: { ORDER: "profile" } },
      { envFile: commandFile, env: { ORDER: "command" } },
    )

    expect(environment.ORDER).toBe("command")
    expect(environment.PROFILE_ONLY).toBe("yes")
    expect(environment.COMMAND_ONLY).toBe("yes")
    expect(parseRunnerEnv("export A=1\nB='two'\nINVALID\n")).toEqual({ A: "1", B: "two" })
  })

  test("keeps manual commands literal instead of parsing naming markers", () => {
    expect(normalizeRunnerManualCommand("  Servidor :: ! bun run dev  ")).toBe(
      "Servidor :: ! bun run dev",
    )
  })

  test("persists saved commands, session and completed history", () => {
    const root = mkdtempSync(join(tmpdir(), "tuiminal-runner-state-"))
    const settingsPath = join(root, "config", "runner.json")
    const secondRoot = join(root, "second-project")
    const extraTab = join(root, "extra-tab")
    mkdirSync(secondRoot)
    mkdirSync(extraTab)
    const saved = saveRunnerCommand(
      root,
      {
        label: "Dev",
        command: "bun run dev",
        interactive: true,
      },
      settingsPath,
    )
    expect(listSavedRunnerCommands(root, settingsPath)).toMatchObject([
      { id: saved.id, label: "Dev", interactive: true },
    ])

    saveRunnerSession(
      root,
      {
        openedProjects: [root, extraTab],
        activeProject: root,
        viewMode: "multi",
        environmentProfiles: { [root]: "file:.env.dev" },
      },
      settingsPath,
    )
    saveRunnerSession(
      secondRoot,
      {
        openedProjects: [secondRoot],
        activeProject: secondRoot,
        viewMode: "single",
        environmentProfiles: {},
      },
      settingsPath,
    )
    expect(loadRunnerSession(root, settingsPath)).toMatchObject({
      openedProjects: [root, extraTab],
      activeProject: root,
      viewMode: "multi",
    })
    expect(loadRunnerSession(secondRoot, settingsPath)).toMatchObject({
      openedProjects: [secondRoot],
      activeProject: secondRoot,
      viewMode: "single",
    })
    expect(loadRunnerSession(join(root, "new-project"), settingsPath)).toEqual({
      openedProjects: [],
      activeProject: null,
      viewMode: "single",
      environmentProfiles: {},
    })

    saveRunnerHistoryEntry(
      {
        id: "run-1",
        commandId: saved.id,
        label: saved.label,
        displayCommand: saved.command,
        projectRoot: root,
        projectName: "project",
        status: "success",
        pid: null,
        startedAt: 1,
        endedAt: 2,
        exitCode: 0,
        logs: [],
      },
      settingsPath,
    )
    expect(loadRunnerHistory(settingsPath)[0]?.id).toBe("run-1")
    expect(loadRunnerStartupState(root, settingsPath)).toMatchObject({
      session: { activeProject: root, viewMode: "multi" },
      history: [{ id: "run-1" }],
    })

    removeSavedRunnerCommand(root, saved.id, settingsPath)
    expect(listSavedRunnerCommands(root, settingsPath)).toEqual([])
    expect(statSync(settingsPath).mode & 0o777).toBe(0o600)
  })

  test("migrates the legacy global Runner session only to its original project", () => {
    const root = mkdtempSync(join(tmpdir(), "tuiminal-runner-legacy-"))
    const originalRoot = join(root, "original")
    const extraTab = join(root, "extra")
    const otherRoot = join(root, "other")
    const settingsPath = join(root, "runner.json")
    writeFileSync(
      settingsPath,
      JSON.stringify({
        version: 1,
        savedCommands: {},
        session: {
          openedProjects: [originalRoot, extraTab],
          activeProject: extraTab,
          viewMode: "multi",
          environmentProfiles: {},
        },
        history: [],
      }),
    )

    expect(loadRunnerSession(originalRoot, settingsPath)).toMatchObject({
      openedProjects: [originalRoot, extraTab],
      activeProject: extraTab,
      viewMode: "multi",
    })
    expect(loadRunnerSession(otherRoot, settingsPath).openedProjects).toEqual([])
  })

  test("normalizes port URLs and exports protected logs", () => {
    expect(runnerPortUrl("*", 3000)).toBe("http://127.0.0.1:3000")
    expect(runnerPortUrl("::1", 8080)).toBe("http://[::1]:8080")
    const root = mkdtempSync(join(tmpdir(), "tuiminal-runner-log-"))
    mkdirSync(join(root, "nested"))
    const path = exportRunnerLog(root, "API local", "ready")
    expect(readFileSync(path, "utf8")).toBe("ready\n")
  })
})
