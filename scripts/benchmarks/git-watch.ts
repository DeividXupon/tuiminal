import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { defineBenchmark } from "./harness"

export async function gitLiveCheckWatchBenchmark({
  parent,
  root,
  fakeGh,
}: {
  parent: string
  root: string
  fakeGh: string
}) {
  const { loadPullRequestDetails } = await import(
    "../../packages/feature-git/src/services/github/details"
  )
  const { PullRequestWatchScheduler } = await import(
    "../../packages/feature-git/src/services/pr-watch"
  )
  const { DEMO_PULL_REQUESTS } = await import("../../packages/feature-git/src/model/pr/fixtures")
  const item = DEMO_PULL_REQUESTS[0]
  if (!item) throw new Error("Missing PR watch fixture")
  const checkFile = join(parent, "benchmark-pr-check-state")

  return defineBenchmark({
    id: "git.pr_ci_watch_gh_poll",
    tool: "git",
    description: "Poll PR checks through fake gh until a pending check succeeds and notifies",
    beforeEach: () => rmSync(checkFile, { force: true }),
    run: async () => {
      const states: string[] = []
      let notices = 0
      const notified = Promise.withResolvers<void>()
      const scheduler = new PullRequestWatchScheduler(
        async (current, signal) => {
          const details = await loadPullRequestDetails({
            identity: current.identity,
            options: {
              executable: fakeGh,
              cwd: root,
              signal,
              env: { BENCHMARK_GH_CHECK_STATE_FILE: checkFile },
            },
          })
          if (!details) throw new Error("PR watch details missing")
          states.push(details.checks[0]?.state ?? "missing")
          return details.checks
        },
        () => {
          notices += 1
          notified.resolve()
        },
        { intervalMs: 2, random: () => 0.5 },
      )
      const timeout = setTimeout(() => notified.reject(new Error("PR check poll timed out")), 2_000)
      try {
        if (!scheduler.watch(item)) throw new Error("PR watch was not started")
        await notified.promise
        return {
          reads: existsSync(checkFile) ? Number(readFileSync(checkFile, "utf8")) : 0,
          states,
          notices,
          watching: scheduler.isWatching(item),
        }
      } finally {
        clearTimeout(timeout)
        scheduler.dispose()
      }
    },
    verify: (result) => {
      if (
        result.reads !== 2 ||
        result.states.join(",") !== "pending,success" ||
        result.notices !== 1 ||
        result.watching
      ) {
        throw new Error("Real gh check polling did not settle after success")
      }
    },
  })
}
