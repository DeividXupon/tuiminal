import { afterAll } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
process.env.TUIMINAL_PROJECT_ROOTS = testRoot
process.env.TUIMINAL_ONLY_TAB = "runner"
for (const name of ["DATABASE_URL", "MYSQL_URL", "POSTGRES_URL", "TUIMINAL_MYSQL_MCP_COMMAND"]) {
  delete process.env[name]
}
afterAll(() => rmSync(testRoot, { recursive: true, force: true }))
