import { assertPublishableCandidate, PUBLICATION_REPOSITORY } from "./publication-model"

const runId = process.env.CANDIDATE_RUN_ID ?? ""
const sha = process.env.GITHUB_SHA ?? ""
if (
  process.env.GITHUB_REPOSITORY !== PUBLICATION_REPOSITORY ||
  process.env.GITHUB_REF !== "refs/heads/main" ||
  !/^\d+$/.test(runId)
)
  throw new Error("Select a candidate run from the protected main branch")

async function github(path: string) {
  const child = Bun.spawn(["gh", "api", `repos/${PUBLICATION_REPOSITORY}/${path}`], {
    stdout: "pipe",
    stderr: "inherit",
  })
  const body = await new Response(child.stdout).text()
  if ((await child.exited) !== 0) throw new Error(`GitHub verification failed: ${path}`)
  return JSON.parse(body)
}

const run = await github(`actions/runs/${runId}`)
const { jobs } = await github(`actions/runs/${runId}/jobs?per_page=100`)
assertPublishableCandidate(run, jobs, sha)
const main = await github("git/ref/heads/main")
if (main.object.sha !== sha) throw new Error("Main moved after this publication was requested")
const checks = await github(
  `actions/workflows/check.yml/runs?head_sha=${sha}&event=push&per_page=10`,
)
if (
  !checks.workflow_runs.some(
    (check: { head_sha: string; conclusion: string }) =>
      check.head_sha === sha && check.conclusion === "success",
  )
)
  throw new Error("The normal quality workflow must also pass on this exact commit")
console.log(`Qualified candidate ${runId}: ${sha}`)
