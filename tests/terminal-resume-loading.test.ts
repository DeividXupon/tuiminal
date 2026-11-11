import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  publishCodexResumeThreads,
  resetCodexResumeThreadsForTests,
} from "../packages/feature-terminal/src/model/codex-resume-threads"
import { resetOpenCodeResumeThreadsForTests } from "../packages/feature-terminal/src/model/opencode-resume-threads"
import { loadRemoteCodexResumeThreadsPage } from "../packages/feature-terminal/src/services/codex-resume"
import { readCodexResumePage } from "../packages/feature-terminal/src/services/codex-resume-page"
import * as openCode from "../packages/feature-terminal/src/services/opencode-observer"
import { refreshOpenCodeThreadsFromServer } from "../packages/feature-terminal/src/services/opencode-resume-hydration"

const roots: string[] = []
let fetchSpy: ReturnType<typeof spyOn> | undefined
afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
  resetCodexResumeThreadsForTests()
  resetOpenCodeResumeThreadsForTests()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("Codex search fills the roster over one reader even when the server caps each page", async () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    id: `thread-${index}`,
    name: `Task ${index}`,
    cwd: "/synthetic",
    recencyAt: 120 - index,
  }))
  const read = mock(async (cursor: string | null, limit: number, _index: number) => {
    const start = Number(cursor ?? 0)
    const data = rows.slice(start, start + Math.min(50, limit))
    return {
      result: {
        data,
        nextCursor: start + data.length < rows.length ? String(start + data.length) : null,
      },
    }
  })
  const page = await readCodexResumePage({ limit: 120, collect: true }, read)
  expect(page.threads).toHaveLength(120)
  expect(page.hasMore).toBe(false)
  expect(read.mock.calls).toEqual([
    [null, 120, 0],
    ["50", 70, 1],
    ["100", 20, 2],
  ])
})

test("Codex collection stops when a provider repeats its pagination cursor", async () => {
  const read = mock(async () => ({
    result: {
      data: [{ id: "one", cwd: "/synthetic" }],
      nextCursor: "same",
    },
  }))
  const page = await readCodexResumePage({ limit: 120, collect: true }, read)
  expect(read).toHaveBeenCalledTimes(2)
  expect(page.threads).toHaveLength(1)
})

function proxyOptions() {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-resume-loading-"))
  roots.push(root)
  const log = join(root, "requests.jsonl")
  return {
    log,
    options: {
      limit: 120,
      collect: true,
      executable: [
        process.execPath,
        join(import.meta.dir, "fixtures/codex-proxy-fixture.ts"),
        "resume-slow",
        '{"result":{}}',
        log,
      ],
    },
  }
}
const profile = { id: "synthetic", name: "Synthetic", host: "synthetic" }

test("a slow Codex response does not keep a completed remote roster loading until the SSH deadline", async () => {
  const { log, options } = proxyOptions()
  const started = performance.now()
  const page = await loadRemoteCodexResumeThreadsPage(
    profile,
    new AbortController().signal,
    options,
  )
  expect(page.threads.map((thread) => thread.id)).toEqual(["remote-1"])
  expect(performance.now() - started).toBeLessThan(4_000)
  expect(readFileSync(log, "utf8")).toContain('"limit":120')
  expect(readFileSync(log, "utf8")).toContain('"thread/turns/list"')
})

test("unchanged Codex responses are reused instead of requesting history again", async () => {
  publishCodexResumeThreads(
    [
      {
        id: "remote-1",
        title: "Cached",
        preview: "",
        lastResponse: "Cached answer",
        cwd: "/srv/project",
        projectName: "project",
        gitBranch: "",
        updatedAt: 10_000,
        state: "idle",
        remoteProfileId: profile.id,
      },
    ],
    profile.id,
  )
  const { log, options } = proxyOptions()
  const page = await loadRemoteCodexResumeThreadsPage(
    profile,
    new AbortController().signal,
    options,
  )
  expect(page.threads[0]?.lastResponse).toBe("Cached answer")
  expect(readFileSync(log, "utf8")).not.toContain('"thread/turns/list"')
})

test("OpenCode shares one history budget across batches and preserves its usable list", async () => {
  fetchSpy = spyOn(openCode, "fetchOpenCodeJson").mockImplementation(
    (_base, _path, _directory, signal) =>
      new Promise((_resolve, reject) => {
        signal.throwIfAborted()
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      }),
  )
  const sessions = Array.from({ length: 24 }, (_, index) => ({
    id: `ses_${index}`,
    title: `Task ${index}`,
    directory: "/synthetic",
    updatedAt: 1000 - index,
  }))
  const started = performance.now()
  const result = await refreshOpenCodeThreadsFromServer(
    "http://synthetic.invalid",
    "/synthetic",
    new AbortController().signal,
    "v2",
    undefined,
    undefined,
    sessions,
    24,
  )
  expect(result).toHaveLength(24)
  expect(fetchSpy).toHaveBeenCalledTimes(6)
  expect(performance.now() - started).toBeLessThan(4_000)
})
