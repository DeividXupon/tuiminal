import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const resources = [
  ["PR", "pr-session", "registerPullRequestSessionDisposer", "disposePullRequestResources"],
  ["Issue", "issue-session", "registerIssueResourceDisposer", "disposeIssueResources"],
  ["Inbox", "inbox-session", "registerInboxDisposer", "disposeInboxResources"],
] as const

async function isolatedRegistry(module: string, register: string, dispose: string, body: string) {
  const url = pathToFileURL(
    resolve(import.meta.dir, `../src/features/git/services/${module}.ts`),
  ).href
  const source = `const { ${register}: register, ${dispose}: dispose } = await import(${JSON.stringify(url)}); ${body}`
  const child = Bun.spawn([process.execPath, "-e", source], { stdout: "pipe", stderr: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect(stderr).toBe("")
  expect(exitCode).toBe(0)
  return JSON.parse(stdout)
}

test.each(resources)(
  "%s disposal isolates synchronous failures and awaits every owned callback",
  async (_name, module, register, dispose) => {
    const result = await isolatedRegistry(
      module,
      register,
      dispose,
      `
    const events = [];
    let error = null;
    register(() => { events.push("throwing"); throw new Error("fixture failure") });
    register(async () => { await Bun.sleep(10); events.push("async") });
    register(() => { events.push("last") });
    try { await dispose() } catch (failure) { error = failure.message }
    const count = events.length;
    try { await dispose() } catch {}
    console.log(JSON.stringify({ events, count, error }));
  `,
    )
    expect(result).toEqual({ events: ["throwing", "last", "async"], count: 3, error: null })
  },
)

test.each(resources)(
  "%s disposal does not erase a newly registered generation",
  async (_name, module, register, dispose) => {
    const result = await isolatedRegistry(
      module,
      register,
      dispose,
      `
    const events = [];
    register(() => { events.push("first"); register(() => events.push("next")) });
    await dispose();
    const first = [...events];
    await dispose();
    console.log(JSON.stringify({ first, events }));
  `,
    )
    expect(result).toEqual({ first: ["first"], events: ["first", "next"] })
  },
)
