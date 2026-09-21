import { afterAll } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Tests must never read or change the developer's system credentials.
const originalSecrets = Bun.secrets
const testSecrets = new Map<string, string>()
const secretKey = ({ service, name }: { service: string; name: string }) => `${service}:${name}`
Object.assign(Bun, {
  secrets: {
    async get(options: { service: string; name: string }) {
      return testSecrets.get(secretKey(options)) ?? null
    },
    async set(options: { service: string; name: string; value: string }) {
      testSecrets.set(secretKey(options), options.value)
    },
    async delete(options: { service: string; name: string }) {
      return testSecrets.delete(secretKey(options))
    },
  },
})

// Applied even by plain `bun test`, before any module can access user settings.
const testRoot = mkdtempSync(join(tmpdir(), "tuiminal-tests-"))
const projectRoot = join(testRoot, "project")
mkdirSync(projectRoot)
writeFileSync(
  join(projectRoot, "package.json"),
  JSON.stringify({
    name: "tui-fixture",
    scripts: { test: "echo fixture" },
  }),
)
process.env.XDG_DATA_HOME = join(testRoot, "data")
process.env.TUIMINAL_SOURCE_FEATURES = "1"
process.env.XDG_CONFIG_HOME = join(testRoot, "config")
process.env.TUIMINAL_WORKDIR = projectRoot
process.env.TUIMINAL_HTTP_HOME = projectRoot
process.env.TUIMINAL_PROJECT_ROOTS = testRoot
process.env.TUIMINAL_ONLY_TAB = "runner"
// Each tmux test opts into mocked or disposable servers explicitly.
process.env.TUIMINAL_TERMINAL_BACKEND = "native"
process.env.TUIMINAL_TERMINAL_AUTO_MIRROR = "0"
process.env.TUIMINAL_TERMINAL_EXTERNAL_DISCOVERY = "0"
process.env.TUIMINAL_TERMINAL_RESTORE = "0"
process.env.TUIMINAL_TERMINAL_PINNED_TMUX = "0"
process.env.TUIMINAL_TERMINAL_WORKSPACE_STATE = "0"
for (const name of ["DATABASE_URL", "MYSQL_URL", "POSTGRES_URL", "TUIMINAL_MYSQL_MCP_COMMAND"]) {
  delete process.env[name]
}
afterAll(() => {
  Object.assign(Bun, { secrets: originalSecrets })
  rmSync(testRoot, { recursive: true, force: true })
})
