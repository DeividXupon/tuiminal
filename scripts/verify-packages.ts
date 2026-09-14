import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildWorkspacePackages } from "./build-packages"
import { workspaceRoot } from "./workspace-model"

const npm = Bun.which(process.platform === "win32" ? "npm.cmd" : "npm")
if (!npm) throw new Error("npm is required to verify the published package format")
const temporaryRoot = mkdtempSync(join(tmpdir(), "tuiminal-workspace-packages-"))
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(temporaryRoot, "config"),
  TUIMINAL_WORKDIR: temporaryRoot,
  TUIMINAL_PROJECT_ROOTS: temporaryRoot,
}
for (const name of ["DATABASE_URL", "MYSQL_URL", "POSTGRES_URL", "TUIMINAL_MYSQL_MCP_COMMAND"])
  delete env[name as keyof typeof env]

async function run(executable: string, args: string[], cwd: string) {
  const child = Bun.spawn([executable, ...args], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (code !== 0) throw new Error(`${executable} ${args.join(" ")} failed: ${stderr || stdout}`)
  return stdout
}

try {
  const workspaces = await buildWorkspacePackages()
  const tarballs: string[] = []
  for (const { directory, manifest } of workspaces) {
    const staged = join(workspaceRoot, "dist", directory)
    const [packed] = JSON.parse(
      await run(
        npm,
        ["pack", "--json", "--ignore-scripts", "--pack-destination", temporaryRoot],
        staged,
      ),
    ) as Array<{ filename: string; files: Array<{ path: string }> }>
    if (
      !packed ||
      !packed.files.some(({ path }) => path === "LICENSE") ||
      !packed.files.some(({ path }) => path === "THIRD_PARTY_NOTICES.md")
    )
      throw new Error(`Missing license in ${manifest.name}`)
    if (
      packed.files.some(
        ({ path }) =>
          !["package.json", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"].includes(path) &&
          !path.startsWith("dist/"),
      )
    )
      throw new Error(`Unexpected source file in ${manifest.name}`)
    tarballs.push(join(temporaryRoot, packed.filename))
  }
  const installation = join(temporaryRoot, "consumer")
  mkdirSync(installation)
  const dependencies = Object.fromEntries(
    ["react", "@opentui/core", "@opentui/react", "@types/bun", "@types/react"].map((name) => [
      name,
      JSON.parse(readFileSync(join(workspaceRoot, "node_modules", name, "package.json"), "utf8"))
        .version as string,
    ]),
  )
  writeFileSync(
    join(installation, "package.json"),
    JSON.stringify({
      name: "tuiminal-package-smoke",
      private: true,
      type: "module",
      dependencies,
      overrides: JSON.parse(readFileSync(join(workspaceRoot, "package.json"), "utf8")).overrides,
    }),
  )
  await run(
    npm,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--strict-peer-deps", ...tarballs],
    installation,
  )
  writeFileSync(
    join(installation, "verify.mjs"),
    `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
const hostRequire = createRequire(import.meta.url);
const theme = await import("@xupon/tuiminal-core/settings/theme");
theme.initializeUiSettings();
const features = ${JSON.stringify(workspaces.filter(({ directory }) => directory !== "packages/core").map(({ manifest }) => manifest.name))};
for (const name of features) {
  const resolved = import.meta.resolve(name);
  assert(resolved.includes("/dist/") || resolved.includes("\\\\dist\\\\"));
  const required = createRequire(resolved);
  assert.equal(realpathSync(required.resolve("react")), realpathSync(hostRequire.resolve("react")));
  assert.equal(realpathSync(required.resolve("@opentui/react")), realpathSync(hostRequire.resolve("@opentui/react")));
  const feature = await import(name);
  assert(Object.keys(feature).length > 0, name);
}
const { testRender } = await import("@opentui/react/test-utils");
const { act } = await import("react");
const { jsx } = await import("@xupon/tuiminal-core/i18n/localized-jsx/jsx-runtime");
const { ShortcutText } = await import("@xupon/tuiminal-core/ui/ShortcutText");
const test = await testRender(jsx(ShortcutText, { content: "[Enter] Tuiminal packages" }), { width: 50, height: 5 });
try {
  await test.renderOnce();
  assert(test.captureCharFrame().includes("Tuiminal packages"));
} finally { act(() => test.renderer.destroy()); }
console.log("Installed packages resolve compiled JS, share React/OpenTUI, and render localized JSX");
const { Database } = await import("bun:sqlite");
const { sqliteQueryProcessCommand } = await import(new URL("./services/sqlite-query-runtime.js", import.meta.resolve("@xupon/tuiminal-feature-database")));
const command = sqliteQueryProcessCommand();
assert(command[1]?.endsWith("sqlite-query-process.js"));
const { fileURLToPath } = await import("node:url");
const databasePath = fileURLToPath(new URL("./fixture Ω.sqlite", import.meta.url));
const database = new Database(databasePath, { create: true });
try { database.run("CREATE TABLE smoke (answer INTEGER)"); database.run("INSERT INTO smoke VALUES (42)"); }
finally { database.close(); }
let receive;
const received = new Promise(resolve => { receive = resolve; });
const child = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "inherit", ipc: message => receive(message), serialization: "advanced" });
let timer;
try {
  child.send({ id: "packed-helper", filename: databasePath, readonly: true, sql: "SELECT answer FROM smoke" });
  const response = await Promise.race([received, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Packed SQLite helper timed out")), 5000); })]);
  assert.equal(response.id, "packed-helper");
  assert.equal(response.ok, true);
  assert.deepEqual(response.rows, [{ answer: 42 }]);
} finally {
  clearTimeout(timer);
  child.disconnect();
  const stop = setTimeout(() => child.kill("SIGKILL"), 2000);
  try { await child.exited; } finally { clearTimeout(stop); }
}
assert.equal(child.exitCode, 0);
console.log("Installed Database package executes the emitted SQLite helper over IPC");
`,
  )
  console.log((await run(process.execPath, ["verify.mjs"], installation)).trim())
  writeFileSync(
    join(installation, "consumer.tsx"),
    [
      'import { ShortcutText } from "@xupon/tuiminal-core/ui/ShortcutText";',
      ...workspaces
        .filter(({ directory }) => directory !== "packages/core")
        .map(
          ({ manifest }, index) =>
            `import * as feature${index} from ${JSON.stringify(manifest.name)}; void feature${index};`,
        ),
      'export const view = <ShortcutText content="[Enter] Tuiminal packages" />;',
    ].join("\n"),
  )
  writeFileSync(
    join(installation, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        jsxImportSource: "@xupon/tuiminal-core/i18n/localized-jsx",
        types: ["bun"],
      },
      files: ["consumer.tsx"],
    }),
  )
  await run(
    process.execPath,
    [join(workspaceRoot, "node_modules/typescript-native/bin/tsc"), "-p", "tsconfig.json"],
    installation,
  )
  console.log("Installed declaration exports typecheck from a separate consumer")
  const version = (
    await run(
      process.execPath,
      [join(workspaceRoot, "apps/cli/bin/tuiminal.ts"), "--version"],
      installation,
    )
  ).trim()
  console.log(`CLI resolves workspaces from another directory: ${version}`)
  console.log("All six internal npm tarballs verified in a clean consumer")
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
