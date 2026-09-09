import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const roots: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })))
})

test("CLI help documents all three independent transport authorizations", async () => {
  const child = Bun.spawn(
    [process.execPath, resolve(import.meta.dir, "../bin/tuiminal.ts"), "http", "run", "--help"],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(code).toBe(0)
  expect(stderr).toBe("")
  for (const flag of [
    "--allow-private-redirect-to",
    "--allow-http-redirect-to",
    "--allow-insecure-tls",
  ])
    expect(stdout).toContain(flag)
})

test("the CLI requires an exact redirect destination and sends each approved hop once", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-redirect-cli-"))
  roots.push(root)
  const received: { body: string; authorization: string | null }[] = []
  const destination = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      received.push({
        body: await request.text(),
        authorization: request.headers.get("authorization"),
      })
      return Response.json({ ok: true })
    },
  })
  servers.push(destination)
  const origin = `http://127.0.0.1:${destination.port}`
  let initialRequests = 0
  const source = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      initialRequests++
      return new Response(null, { status: 307, headers: { location: `${origin}/target` } })
    },
  })
  servers.push(source)
  await writeFile(
    resolve(root, "redirect.http"),
    `### Redirect\nPOST http://127.0.0.1:${source.port}/start\nAuthorization: Bearer FAKE_CLI_REDIRECT_SECRET\n\nbody-fixture\n`,
  )
  const run = async (flags: string[]) => {
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(import.meta.dir, "../bin/tuiminal.ts"),
        "http",
        "run",
        "redirect.http",
        "--report",
        "json",
        ...flags,
      ],
      {
        cwd: root,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(stderr).toBe("")
    expect(stdout).not.toContain("FAKE_CLI_REDIRECT_SECRET")
    return { code, report: JSON.parse(stdout) }
  }
  const denied = await run([])
  expect(denied.code).toBe(3)
  expect(denied.report.cases[0].requests[0].error.kind).toBe("redirect")
  expect(initialRequests).toBe(1)
  expect(received).toHaveLength(0)
  const allowed = await run(["--allow-private-redirect-to", origin])
  expect(allowed.code).toBe(0)
  expect(allowed.report.cases[0].requests[0].status).toBe(200)
  expect(initialRequests).toBe(2)
  expect(received).toEqual([{ body: "body-fixture", authorization: null }])
})
