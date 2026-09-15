import { createHash } from "node:crypto"
import { createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { delimiter, dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { mainPackageJson, RELEASE_TARGETS } from "./release-model"
import { verifyPackagedUi } from "./release-ui-smoke"

const root = resolve(import.meta.dir, "..")
const distRoot = join(root, "dist", "npm")
const version = (
  JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }
).version
const requestedTarget = process.argv[2]?.trim()
const fromRegistry = process.argv.includes("--registry")
const selectedTargets = requestedTarget
  ? RELEASE_TARGETS.filter((target) => target.id === requestedTarget)
  : RELEASE_TARGETS
if (!selectedTargets.length) throw new Error(`Unknown release target: ${requestedTarget}`)
function requiredExecutable(value: string | null | undefined, message: string) {
  if (!value) throw new Error(message)
  return value
}

const npmExecutable = requiredExecutable(
  Bun.which(process.platform === "win32" ? "npm.cmd" : "npm"),
  "npm is required for the release smoke test",
)
const nodeExecutable = requiredExecutable(
  process.env.TUIMINAL_RELEASE_NODE?.trim() || Bun.which("node"),
  "Node.js is required for the release smoke test",
)

async function command(
  executable: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
) {
  const child = Bun.spawn([executable, ...args], {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed (${exitCode}): ${stderr || stdout}`)
  }
  return stdout
}

function expectedPackageFiles(targetId: string | null) {
  return new Set([
    "LICENSE",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    targetId
      ? `bin/${targetId.startsWith("win32") ? "tuiminal.exe" : "tuiminal"}`
      : "bin/tuiminal.js",
  ])
}

async function pack(packageRoot: string, destination: string, dryRun: boolean) {
  const output = await command(
    npmExecutable,
    [
      "pack",
      "--json",
      "--ignore-scripts",
      ...(dryRun ? ["--dry-run"] : ["--pack-destination", destination]),
    ],
    {
      cwd: packageRoot,
      env: { npm_config_cache: join(tmpdir(), "tuiminal-release-npm-cache") },
    },
  )
  const result = JSON.parse(output) as Array<{ filename: string; files: Array<{ path: string }> }>
  const first = result[0]
  if (!first) throw new Error(`npm pack returned no artifact for ${packageRoot}`)
  return first
}

function assertExactPackageFiles(
  actualFiles: Array<{ path: string }>,
  expectedFiles: Set<string>,
  label: string,
) {
  const actual = actualFiles.map((file) => file.path).sort()
  const expected = [...expectedFiles].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} package contents differ: ${JSON.stringify(actual)}`)
  }
}

async function sha256(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}

async function verifyChecksums() {
  const entries = readFileSync(join(distRoot, "SHA256SUMS"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/)
      if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`)
      return { hash: match[1] as string, path: match[2] as string }
    })
  const expectedPaths = [
    ...selectedTargets.flatMap((target) => [
      `${target.id}/bin/${target.executable}`,
      `${target.id}/package.json`,
    ]),
    "tuiminal/bin/tuiminal.js",
    "tuiminal/package.json",
  ].sort()
  if (JSON.stringify(entries.map((entry) => entry.path).sort()) !== JSON.stringify(expectedPaths)) {
    throw new Error("SHA256SUMS does not describe the selected release files exactly")
  }
  for (const entry of entries) {
    if ((await sha256(join(distRoot, entry.path))) !== entry.hash) {
      throw new Error(`Checksum mismatch for ${entry.path}`)
    }
  }
}

async function verifySqliteHelper(
  executable: string,
  directory: string,
  env: Record<string, string>,
) {
  const databasePath = join(directory, "helper smoke Ω.sqlite")
  const database = new Database(databasePath, { create: true, strict: true })
  database.run("CREATE TABLE smoke (answer INTEGER NOT NULL)")
  database.run("INSERT INTO smoke (answer) VALUES (42)")
  database.close()

  let receive: (message: unknown) => void = () => undefined
  const responsePromise = new Promise<unknown>((resolveResponse) => {
    receive = resolveResponse
  })
  const helper = Bun.spawn({
    cmd: [executable, "--internal-sqlite-worker"],
    env: { ...process.env, ...env },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    serialization: "advanced",
    ipc: (message) => receive(message),
  })
  helper.send({
    id: "release-smoke",
    filename: databasePath,
    readonly: true,
    sql: "SELECT answer FROM smoke",
  })
  let response: unknown
  let responseTimer: ReturnType<typeof setTimeout> | undefined
  try {
    response = await Promise.race([
      responsePromise,
      new Promise<never>(
        (_, reject) =>
          (responseTimer = setTimeout(
            () => reject(new Error("Packaged SQLite helper timed out")),
            5_000,
          )),
      ),
    ])
  } catch (error) {
    helper.kill()
    await helper.exited
    throw error
  } finally {
    clearTimeout(responseTimer)
  }
  helper.disconnect()
  let exitTimer: ReturnType<typeof setTimeout> | undefined
  const exitCode = await Promise.race([
    helper.exited,
    new Promise<number>((resolveExit) => {
      exitTimer = setTimeout(() => {
        helper.kill()
        resolveExit(-1)
      }, 5_000)
    }),
  ]).finally(() => clearTimeout(exitTimer))
  const result = response as {
    id?: string
    ok?: boolean
    rows?: Array<{ answer?: number }>
  }
  if (
    exitCode !== 0 ||
    result.id !== "release-smoke" ||
    !result.ok ||
    result.rows?.[0]?.answer !== 42
  ) {
    const stderr = await new Response(helper.stderr).text()
    throw new Error(
      `Packaged SQLite helper failed (${exitCode}): ${stderr || JSON.stringify(result)}`,
    )
  }
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "Tuiminal release Ω "))
try {
  await verifyChecksums()
  for (const target of selectedTargets) {
    const packageRoot = join(distRoot, target.id)
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name: string
      version: string
      license: string
      os: string[]
      cpu: string[]
    }
    if (
      manifest.name !== target.npmPackage ||
      manifest.version !== version ||
      manifest.license !== "Apache-2.0" ||
      manifest.os[0] !== target.os ||
      manifest.cpu[0] !== target.cpu
    ) {
      throw new Error(`Invalid release manifest for ${target.id}`)
    }
    const packed = await pack(packageRoot, temporaryRoot, true)
    assertExactPackageFiles(packed.files, expectedPackageFiles(target.id), target.id)
  }

  const mainRoot = join(distRoot, "tuiminal")
  const mainManifest = JSON.parse(readFileSync(join(mainRoot, "package.json"), "utf8"))
  if (JSON.stringify(mainManifest) !== JSON.stringify(mainPackageJson(version))) {
    throw new Error("The main npm manifest does not match the release model")
  }
  const mainDryRun = await pack(mainRoot, temporaryRoot, true)
  assertExactPackageFiles(mainDryRun.files, expectedPackageFiles(null), "tuiminal")

  const hostTarget = selectedTargets.find(
    (target) => target.os === process.platform && target.cpu === process.arch,
  )
  if (!hostTarget)
    throw new Error(`Unsupported smoke-test host: ${process.platform}/${process.arch}`)
  const hostPack = await pack(join(distRoot, hostTarget.id), temporaryRoot, false)
  const mainPack = await pack(mainRoot, temporaryRoot, false)
  const installRoot = join(temporaryRoot, "install with spaces Ω")
  await command(
    npmExecutable,
    [
      "install",
      ...(fromRegistry ? [] : ["--offline"]),
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installRoot,
      ...(fromRegistry
        ? [`tuiminal@${version}`]
        : [join(temporaryRoot, hostPack.filename), join(temporaryRoot, mainPack.filename)]),
    ],
    { env: { npm_config_cache: join(temporaryRoot, "npm-cache") } },
  )

  const launcher = join(installRoot, "node_modules", "tuiminal", "bin", "tuiminal.js")
  const helper = join(
    installRoot,
    "node_modules",
    hostTarget.npmPackage,
    "bin",
    hostTarget.executable,
  )
  if (
    (await sha256(helper)) !==
    (await sha256(join(distRoot, hostTarget.id, "bin", hostTarget.executable)))
  )
    throw new Error("Installed binary differs from the qualified candidate")
  const noBunPath = String(process.env.PATH ?? "")
    .split(delimiter)
    .filter(
      (entry) =>
        resolve(entry).toLowerCase() !== dirname(process.execPath).toLowerCase() &&
        !/(?:^|[\\/])\.bun(?:[\\/]|$)|tuiminal-bun-/i.test(entry),
    )
    .join(delimiter)
  const releaseEnvironment = {
    PATH: noBunPath,
    XDG_DATA_HOME: join(temporaryRoot, "data"),
    XDG_CONFIG_HOME: join(temporaryRoot, "config"),
    TUIMINAL_SOURCE_FEATURES: "1",
  }
  try {
    await command(nodeExecutable, [launcher, "http", "run", "not-installed.http"], {
      cwd: installRoot,
      env: releaseEnvironment,
    })
    throw new Error("A fresh minimal CLI unexpectedly ran HTTP")
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("tuiminal features")) throw error
  }
  // Even an inherited source-test flag cannot put feature code into the release.
  const featureServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const name = new URL(request.url).pathname.slice(1)
      if (!/^tuiminal-[a-zA-Z0-9.-]+-(database|git|runner|http|terminal)\.json\.gz$/.test(name))
        return new Response(null, { status: 404 })
      return new Response(Bun.file(join(root, "dist", "features", version, name)))
    },
  })
  try {
    await command(nodeExecutable, [launcher, "features", "install", "all"], {
      cwd: installRoot,
      env: {
        ...releaseEnvironment,
        TUIMINAL_FEATURE_BASE_URL: fromRegistry
          ? undefined
          : `http://127.0.0.1:${featureServer.port}/`,
      },
    })
  } finally {
    featureServer.stop(true)
  }
  const reportedVersion = (
    await command(nodeExecutable, [launcher, "--version"], {
      cwd: installRoot,
      env: releaseEnvironment,
    })
  ).trim()
  if (reportedVersion !== version) throw new Error(`Installed launcher reported ${reportedVersion}`)
  const help = await command(nodeExecutable, [launcher, "--help"], {
    cwd: installRoot,
    env: releaseEnvironment,
  })
  for (const tool of ["banco", "git", "runner", "http", "terminal"]) {
    if (!help.includes(tool)) throw new Error(`Installed help is missing ${tool}`)
  }
  await verifySqliteHelper(helper, installRoot, releaseEnvironment)
  await verifyPackagedUi(nodeExecutable, launcher, installRoot, releaseEnvironment)

  const server = Bun.serve({
    port: 0,
    fetch: () => Response.json({ ok: true }),
  })
  try {
    const requestPath = join(installRoot, "smoke request Ω.http")
    writeFileSync(
      requestPath,
      `### Smoke\n# @name smoke\n# @assert status == 200\nGET http://127.0.0.1:${server.port}/health\n`,
    )
    const report = await command(
      nodeExecutable,
      [launcher, "http", "run", requestPath, "--report", "json"],
      { cwd: installRoot, env: releaseEnvironment },
    )
    const parsed = JSON.parse(report) as {
      cases?: Array<{
        requests?: Array<{
          status?: number
          assertions?: Array<{ passed?: boolean }>
        }>
      }>
    }
    const request = parsed.cases?.[0]?.requests?.[0]
    if (
      request?.status !== 200 ||
      request.assertions?.length !== 1 ||
      request.assertions.some((assertion) => !assertion.passed)
    ) {
      throw new Error(`Installed HTTP smoke failed: ${report}`)
    }
  } finally {
    server.stop(true)
  }

  await command(
    npmExecutable,
    [
      "uninstall",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installRoot,
      "tuiminal",
      hostTarget.npmPackage,
    ],
    { env: { npm_config_cache: join(temporaryRoot, "npm-cache") } },
  )
  console.log(`Release smoke passed for all manifests and ${hostTarget.id} runtime`)
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
