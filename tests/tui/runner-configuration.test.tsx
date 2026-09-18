import "./setup"
import { afterEach, beforeEach, expect, test } from "bun:test"
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { TextareaRenderable } from "@opentui/core"
import { runnerYamlPath } from "../../packages/feature-runner/src/storage/runner-yaml"
import type { TestRendererSetup } from "@opentui/core/testing"
import { RunnerConfigurationEditor } from "../../packages/feature-runner/src/ui/RunnerConfigurationEditor"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"
import { createShellRunnerCommand } from "../../packages/feature-runner/src/services/shell-command"
import {
  listSavedRunnerCommands,
  listRunnerFlows,
  RUNNER_SETTINGS_PATH,
  saveRunnerCommand,
  saveRunnerFlow,
  removeSavedRunnerCommand,
  removeRunnerFlow,
} from "../../packages/feature-runner/src/storage/runner-settings"

import { activeProcesses } from "../../packages/feature-runner/src/services/process-registry"

let ownedBefore = new Set(activeProcesses)
let tui: TestRendererSetup | undefined
const roots: string[] = []
const ids: string[] = []
const flowIds: string[] = []
const settingsPaths = [
  RUNNER_SETTINGS_PATH,
  runnerYamlPath(process.env.TUIMINAL_WORKDIR!),
  join(process.env.XDG_CONFIG_HOME!, "tuiminal", "runner-autostart-trust.json"),
]
let settingsSnapshots: (Buffer | null)[] = []
beforeEach(() => {
  ownedBefore = new Set(activeProcesses)
  settingsSnapshots = settingsPaths.map((path) => (existsSync(path) ? readFileSync(path) : null))
})
afterEach(async () => {
  await act(async () => {
    tui?.renderer.destroy()
    await Bun.sleep(20)
  })
  await Promise.all(
    [...activeProcesses]
      .filter((handle) => !ownedBefore.has(handle))
      .map((handle) => handle.stop()),
  )
  tui = undefined
  for (const id of flowIds.splice(0)) removeRunnerFlow(process.env.TUIMINAL_WORKDIR!, id)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  for (const id of ids.splice(0)) removeSavedRunnerCommand(process.env.TUIMINAL_WORKDIR!, id)
  for (const [index, path] of settingsPaths.entries()) {
    const snapshot = settingsSnapshots[index]
    if (snapshot) writeFileSync(path, snapshot)
    else rmSync(path, { force: true })
  }
})
function temporary() {
  const root = mkdtempSync(join(tmpdir(), "runner-editor-"))
  roots.push(root)
  return root
}
async function settle(until: () => boolean) {
  for (let i = 0; i < 150; i++) {
    await act(async () => {
      await Bun.sleep(10)
    })
    await tui!.renderOnce()
    if (until()) return
  }
  throw new Error(`TUI did not settle\n${tui!.captureCharFrame()}`)
}
async function key(name: string, ctrl = false, shift = false) {
  act(() => tui!.mockInput.pressKey(name, { ctrl, shift }))
  await act(async () => {
    await Bun.sleep(60)
  })
  await tui!.renderOnce()
}
async function click(id: string) {
  const node = tui!.renderer.root.findDescendantById(id)
  if (!node) throw new Error(`Missing ${id}\n${tui!.captureCharFrame()}`)
  await act(async () => {
    await tui!.mockMouse.click(node.screenX + 1, node.screenY)
  })
  await act(async () => {
    await Bun.sleep(10)
  })
  await tui!.renderOnce()
}
const detected = createShellRunnerCommand("printf detected-script", {
  id: "package:dev",
  label: "dev",
})
function yamlEditor() {
  return tui!.renderer.root.findDescendantById("runner-config-yaml") as TextareaRenderable
}
async function replaceYaml(source: string) {
  act(() => {
    const editor = yamlEditor()
    editor.focus()
    editor.setSelection(0, editor.plainText.length)
  })
  await act(async () => tui!.mockInput.pasteBracketedText(source))
  await tui!.renderOnce()
}
async function yamlLine(text: string) {
  const lines = yamlEditor().plainText.split("\n")
  const row = lines.findIndex((line) => line.includes(text))
  if (row < 0) throw new Error(`Missing YAML line ${text}`)
  act(() => yamlEditor().setCursor(row, lines[row]!.length))
  await tui!.renderOnce()
}

test("YAML editor creates without execution, completes commands by keyboard and directories by mouse, and saves the global file", async () => {
  const root = temporary()
  mkdirSync(join(root, "services"))
  let saved = false
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      commands={[detected]}
      profiles={[]}
      onClose={() => {}}
      onSaved={() => {
        saved = true
      }}
    />,
    { width: 120, height: 38 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml(
    "# keep this comment\ncommands:\n  local:\n    label: Local command\n    command: printf\n    cwd: ser\n",
  )
  await yamlLine("command: printf")
  await key(" ", true)
  expect(tui.captureCharFrame()).toContain("detected-script")
  await key("RETURN")
  expect(yamlEditor().plainText).toContain('command: "printf detected-script"')
  await yamlLine("cwd: ser")
  await click("runner-config-suggest")
  await settle(() => tui!.captureCharFrame().includes("services/"))
  await click("runner-config-suggestion-0")
  await key("s", true)
  await settle(() => saved)
  expect(listSavedRunnerCommands(root)[0]).toMatchObject({
    id: "local",
    label: "Local command",
    command: "printf detected-script",
    cwd: "services/",
    autostart: false,
    interactive: false,
  })
  expect(readdirSync(root)).toEqual(["services"])
  expect(readFileSync(runnerYamlPath(root), "utf8")).toStartWith("# keep this comment")
})

test("YAML editor rejects syntax, cycles, health errors and conflicting writes before saving", async () => {
  const root = temporary()
  let saved = 0,
    closed = 0
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      commands={[detected]}
      profiles={[]}
      onClose={() => {
        closed++
      }}
      onSaved={() => {
        saved++
      }}
    />,
    { width: 120, height: 38 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml("commands: [")
  await key("s", true)
  expect(saved).toBe(0)
  const source =
    "commands:\n  package:dev:\n    command: printf detected-script\n    dependsOn:\n      - commandId: package:dev\n"
  await replaceYaml(source)
  expect(tui.captureCharFrame()).toContain("Ciclo de dependências")
  await key("s", true)
  expect(saved).toBe(0)
  await replaceYaml(
    "commands:\n  package:dev:\n    command: printf detected-script\n    health:\n      type: log\n      pattern: '['\n",
  )
  await key("s", true)
  expect(saved).toBe(0)
  await replaceYaml(yamlEditor().plainText.replace("'['", "ready"))
  await key("s", true)
  await settle(() => saved === 1)
  expect(listSavedRunnerCommands(root)[0]).toMatchObject({
    id: detected.id,
    healthCheck: { type: "log", pattern: "ready" },
  })
  const other = "commands:\n  other:\n    command: echo external\n"
  writeFileSync(runnerYamlPath(root), other)
  await key("s", true)
  await settle(() => tui!.captureCharFrame().includes("mudou em outra instância"))
  expect(readFileSync(runnerYamlPath(root), "utf8")).toBe(other)
  expect(saved).toBe(1)
  expect(readdirSync(root)).toEqual([])
  await yamlLine("command: printf")
  await key(" ", true)
  await key("ESCAPE")
  expect(closed).toBe(0)
  await key("ESCAPE")
  expect(closed).toBe(1)
})

test("creates and edits YAML flows with contextual dependency completion and stable IDs", async () => {
  const root = temporary()
  const build = createShellRunnerCommand("printf build", { id: "build", label: "build" })
  let saved = false
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      commands={[build, detected]}
      profiles={[]}
      onClose={() => {}}
      onSaved={() => {
        saved = true
      }}
    />,
    { width: 100, height: 30 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml(
    "flows:\n  dev:\n    label: Development\n    stages:\n      - commandIds: [build]\n      - commandIds: [package:de]\n",
  )
  await yamlLine("commandIds: [package:de]")
  await click("runner-config-suggest")
  await click("runner-config-suggestion-0")
  expect(yamlEditor().plainText).toContain('commandIds: ["package:dev"]')
  await key("s", true)
  await settle(() => saved)
  expect(listRunnerFlows(root)[0]).toMatchObject({
    id: "dev",
    label: "Development",
    stages: [
      { commandIds: ["build"], waitFor: "completed" },
      { commandIds: ["package:dev"], waitFor: "completed" },
    ],
  })
  act(() => tui!.renderer.destroy())
  saved = false
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      target={{ kind: "flow", flow: listRunnerFlows(root)[0]! }}
      commands={[build, detected]}
      profiles={[]}
      onClose={() => {}}
      onSaved={() => {
        saved = true
      }}
    />,
    { width: 80, height: 24 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml(
    "flows:\n  dev:\n    label: Renamed\n    stages:\n      - commandIds: [build, package:dev]\n        waitFor: started\n",
  )
  await key("s", true)
  await settle(() => saved)
  expect(listRunnerFlows(root)).toHaveLength(1)
  expect(listRunnerFlows(root)[0]).toMatchObject({
    id: "dev",
    label: "Renamed",
    stages: [{ commandIds: ["build", "package:dev"], waitFor: "started" }],
  })
})

test("Runner opens YAML directly by keyboard and mouse without executing on open", async () => {
  const owned = new Set(activeProcesses)
  const path = runnerYamlPath(process.env.TUIMINAL_WORKDIR!)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(
    path,
    "commands: {}\nprofiles:\n  guide:\n    label: Tutorial profile\n    env: {}\n",
  )
  tui = await testRender(<Runner active />, { width: 150, height: 38 })
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-command-list")
  await key("e")
  expect(tui.captureCharFrame()).toContain("Perfil ativo: Tutorial profile")
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-command-list")
  expect(tui.renderer.root.findDescendantById("runner-config-editor")).toBeUndefined()
  await key("y", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  expect(tui.captureCharFrame()).toContain("EDITOR YAML DO RUNNER")
  expect(yamlEditor().plainText).toContain("commands:")
  await key("o", true)
  await settle(() => tui!.captureCharFrame().includes("CONFIGURAÇÃO DO RUNNER"))
  await key("n", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  expect(yamlEditor().plainText).toContain("command:")
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-list")
  await key("y", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await key("o", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-list")
  await key("ESCAPE")
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-command-list")
  await click("runner-configuration")
  expect(tui.captureCharFrame()).toContain("EDITOR YAML DO RUNNER")
  expect(new Set(activeProcesses)).toEqual(owned)
})

function saveScript(label: string, code: string, options = {}) {
  const id = `saved:${crypto.randomUUID()}`
  ids.push(id)
  saveRunnerCommand(process.env.TUIMINAL_WORKDIR!, {
    id,
    label,
    command: `bun -e '${code.replaceAll("'", "'\\''")}'`,
    ...options,
  })
  return id
}
async function openFlow(stages: { commandIds: string[]; waitFor: "started" | "completed" }[]) {
  const id = `flow:${crypto.randomUUID()}`
  flowIds.push(id)
  saveRunnerFlow(process.env.TUIMINAL_WORKDIR!, {
    id,
    label: "Integration flow",
    autostart: false,
    stages,
  })
  tui = await testRender(<Runner active />, { width: 160, height: 38 })
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-command-list")
  await key("y", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await key("o", true)
  await settle(() => tui!.captureCharFrame().includes("Integration flow"))
}

test("real TUI flow waits for completion and readiness, stops, and restarts its owned processes", async () => {
  const root = temporary(),
    built = join(root, "built"),
    started = join(root, "started"),
    ready = join(root, "ready"),
    release = join(root, "release"),
    downstream = join(root, "downstream")
  const build = saveScript(
    "Prepare",
    `const fs = require("node:fs"); fs.appendFileSync(${JSON.stringify(built)}, "b")`,
  )
  const service = saveScript(
    "Service",
    `const fs = require("node:fs"); fs.writeFileSync(${JSON.stringify(started)}, String(process.pid)); let sent = false; setInterval(() => { if (!sent && fs.existsSync(${JSON.stringify(release)})) { sent = true; fs.writeFileSync(${JSON.stringify(ready)}, "yes"); console.log("READY") } }, 20)`,
    { healthCheck: { type: "log", pattern: "READY", timeoutMs: 30000 } },
  )
  const last = saveScript(
    "Smoke",
    `const fs = require("node:fs"); if (!fs.existsSync(${JSON.stringify(ready)})) process.exit(2); fs.writeFileSync(${JSON.stringify(downstream)}, "yes")`,
  )
  await openFlow([
    { commandIds: [build], waitFor: "completed" },
    { commandIds: [service], waitFor: "started" },
    { commandIds: [last], waitFor: "completed" },
  ])
  expect(existsSync(built)).toBe(false)
  await key("r", true)
  await settle(() => existsSync(started))
  expect(readFileSync(built, "utf8")).toBe("b")
  expect(existsSync(downstream)).toBe(false)
  writeFileSync(release, "go")
  await settle(() => existsSync(downstream))
  const firstPid = Number(readFileSync(started, "utf8"))
  await key("k", true)
  await settle(() => {
    try {
      process.kill(firstPid, 0)
      return false
    } catch {
      return true
    }
  })
  await click("runner-config-restart")
  await settle(() => readFileSync(built, "utf8") === "bb")
  await settle(() => Number(readFileSync(started, "utf8")) !== firstPid)
  const secondPid = Number(readFileSync(started, "utf8"))
  await act(async () => {
    tui!.renderer.destroy()
    await Bun.sleep(50)
  })
  tui = undefined
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(secondPid, 0)
      await Bun.sleep(20)
    } catch {
      return
    }
  }
  throw new Error("Owned service survived workspace shutdown")
}, 15000)

test("real TUI flow blocks descendants on failure and cancellation while health is pending", async () => {
  const root = temporary(),
    reached = join(root, "reached")
  const fail = saveScript("Fail", "process.exit(7)")
  const last = saveScript(
    "Never",
    `require("node:fs").writeFileSync(${JSON.stringify(reached)}, "unexpected")`,
  )
  await openFlow([
    { commandIds: [fail], waitFor: "completed" },
    { commandIds: [last], waitFor: "completed" },
  ])
  await click("runner-config-run")
  await settle(() => tui!.captureCharFrame().includes("bloqueado"))
  expect(existsSync(reached)).toBe(false)
  await act(async () => {
    tui!.renderer.destroy()
    await Bun.sleep(20)
  })
  tui = undefined
  removeRunnerFlow(process.env.TUIMINAL_WORKDIR!, flowIds.pop()!)
  const started = join(root, "waiting")
  const wait = saveScript(
    "Wait",
    `require("node:fs").writeFileSync(${JSON.stringify(started)}, "yes"); setInterval(() => {}, 100)`,
    { healthCheck: { type: "log", pattern: "NEVER", timeoutMs: 30000 } },
  )
  await openFlow([
    { commandIds: [wait], waitFor: "started" },
    { commandIds: [last], waitFor: "completed" },
  ])
  await key("r", true)
  await settle(() => existsSync(started))
  await key("k", true)
  await settle(() => tui!.captureCharFrame().includes("parado"))
  expect(existsSync(reached)).toBe(false)
}, 10000)

test("saved autostart flows require explicit approval again after an editor change", async () => {
  const root = temporary(),
    first = join(root, "auto-first"),
    second = join(root, "auto-second")
  const firstId = saveScript(
    "Auto first",
    `require("node:fs").writeFileSync(${JSON.stringify(first)}, "yes")`,
  )
  const secondId = saveScript(
    "Auto second",
    `require("node:fs").writeFileSync(${JSON.stringify(second)}, "yes")`,
  )
  const flow = {
    id: `flow:${crypto.randomUUID()}`,
    label: "Autostart fixture",
    autostart: true,
    stages: [{ commandIds: [firstId], waitFor: "completed" as const }],
  }
  flowIds.push(flow.id)
  saveRunnerFlow(process.env.TUIMINAL_WORKDIR!, flow)
  tui = await testRender(<Runner active />, { width: 150, height: 38 })
  await settle(() => tui!.captureCharFrame().includes("AUTOSTART DO RUNNER"))
  expect(existsSync(first)).toBe(false)
  await key("y")
  await settle(() => existsSync(first))
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-command-list")
  await key("y", true)
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml(yamlEditor().plainText.replace(`- ${firstId}`, `- ${secondId}`))
  await key("s", true)
  await settle(() => tui!.captureCharFrame().includes("CONFIGURAÇÃO DO RUNNER"))
  await settle(
    () => listRunnerFlows(process.env.TUIMINAL_WORKDIR!)[0]?.stages[0]?.commandIds[0] === secondId,
  )
  expect(existsSync(second)).toBe(false)
  expect(tui.renderer.currentFocusedRenderable?.id).toBe("runner-config-list")
  await key("ESCAPE")
  await settle(() => tui!.captureCharFrame().includes("AUTOSTART DO RUNNER"))
  expect(existsSync(second)).toBe(false)
  await key("y")
  await settle(() => existsSync(second))
})

test("health timeout blocks dependents and stop cancels a scheduled automatic restart", async () => {
  const root = temporary(),
    downstream = join(root, "downstream"),
    retries = join(root, "retries")
  const service = saveScript("Unhealthy", "setInterval(() => {}, 100)", {
    healthCheck: { type: "log", pattern: "READY", timeoutMs: 500 },
  })
  const last = saveScript(
    "Blocked",
    `require("node:fs").writeFileSync(${JSON.stringify(downstream)}, "unexpected")`,
  )
  await openFlow([
    { commandIds: [service], waitFor: "started" },
    { commandIds: [last], waitFor: "completed" },
  ])
  await key("r", true)
  await settle(() => tui!.captureCharFrame().includes("bloqueado"))
  expect(existsSync(downstream)).toBe(false)
  await key("k", true)
  await act(async () => {
    tui!.renderer.destroy()
    await Bun.sleep(20)
  })
  tui = undefined
  removeRunnerFlow(process.env.TUIMINAL_WORKDIR!, flowIds.pop()!)
  const retry = saveScript(
    "Retry",
    `require("node:fs").appendFileSync(${JSON.stringify(retries)}, "x"); process.exit(4)`,
    { restartPolicy: "on-failure", restartDelayMs: 300, maxRestarts: 5 },
  )
  await openFlow([
    { commandIds: [retry], waitFor: "completed" },
    { commandIds: [last], waitFor: "completed" },
  ])
  await key("r", true)
  await settle(() => tui!.captureCharFrame().includes("bloqueado"))
  await key("k", true)
  await act(async () => {
    await Bun.sleep(400)
  })
  expect(readFileSync(retries, "utf8")).toBe("x")
  expect(existsSync(downstream)).toBe(false)
}, 10000)

test("YAML editing preserves multiline drafts and refuses to discard them when opening management", async () => {
  const root = temporary()
  let managed = 0
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      commands={[detected]}
      profiles={[]}
      onClose={() => {}}
      onSaved={() => {}}
      onManage={() => {
        managed++
      }}
    />,
    { width: 100, height: 30 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml(
    "# multiline\ncommands:\n  custom:\n    command: |\n      echo first\n      echo second\n",
  )
  await key("o", true)
  expect(managed).toBe(0)
  expect(tui.captureCharFrame()).toContain("Salve o YAML")
  const source = yamlEditor().plainText
  await act(async () => {
    tui!.resize(80, 24)
    await Bun.sleep(15)
  })
  await tui.renderOnce()
  expect(yamlEditor().plainText).toBe(source)
  await yamlLine("echo second")
  await key("RETURN")
  await key("TAB")
  expect(yamlEditor().plainText).toContain("echo second\n  ")
  await key("s", true)
  await settle(() => existsSync(runnerYamlPath(root)))
  expect(readFileSync(runnerYamlPath(root), "utf8")).toBe(yamlEditor().plainText)
  await key("o", true)
  expect(managed).toBe(1)
})

test("editing a newly detected command adds its stable ID to an existing global YAML", async () => {
  const root = temporary()
  const path = runnerYamlPath(root)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, "# existing\ncommands: {}\nflows: {}\n")
  let saved = false
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      target={{ kind: "command", command: detected }}
      commands={[detected]}
      profiles={[]}
      onClose={() => {}}
      onSaved={() => {
        saved = true
      }}
    />,
    { width: 100, height: 30 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  expect(yamlEditor().plainText).toContain("package:dev:")
  await key("s", true)
  await settle(() => saved)
  expect(listSavedRunnerCommands(root)[0]?.id).toBe(detected.id)
  expect(readFileSync(path, "utf8")).toStartWith("# existing")
})

test("removing a YAML profile still referenced by a command blocks Save", async () => {
  const root = temporary()
  const path = runnerYamlPath(root)
  mkdirSync(join(path, ".."), { recursive: true })
  const source =
    "profiles:\n  local:\n    env: { MODE: development }\ncommands:\n  service:\n    command: echo ready\n    profile: local\n"
  writeFileSync(path, source)
  let saved = false
  tui = await testRender(
    <RunnerConfigurationEditor
      root={root}
      commands={[]}
      profiles={[{ id: "local", label: "local", env: { MODE: "development" } }]}
      onClose={() => {}}
      onSaved={() => {
        saved = true
      }}
    />,
    { width: 100, height: 30 },
  )
  await settle(() => tui!.renderer.currentFocusedRenderable?.id === "runner-config-yaml")
  await replaceYaml(source.slice(source.indexOf("commands:")))
  await key("s", true)
  expect(saved).toBe(false)
  expect(tui.captureCharFrame()).toContain("Perfil não encontrado")
  expect(readFileSync(path, "utf8")).toBe(source)
})
