import { expect, spyOn, test } from "bun:test"
import { createRemoteLiveDiffSource } from "../packages/feature-terminal/src/services/remote-live-diff"
import { RemoteLiveDiffProtocol } from "../packages/feature-terminal/src/services/remote-live-diff-protocol"

const target = {
  profile: { id: "fixture", name: "fixture", host: "fixture" },
  workingDirectory: "/fixture",
}

// The protocol is exercised separately; these tests check how source reads use
// it without starting SSH or inspecting the developer's filesystem.
const options = { command: [process.execPath, "-e", "process.stdin.resume()"] }

test("remote snapshots bound metadata batches and keep every file's metadata aligned", async () => {
  const paths = Array.from({ length: 40 }, (_, index) => `file-${index}.ts`)
  const batches: string[][] = []
  const request = spyOn(RemoteLiveDiffProtocol.prototype, "request").mockImplementation(
    async (operation, fields) => {
      if (operation === "status")
        return { status: 0, stdout: paths.map((path) => `?? ${path}\0`).join(""), stderr: "" }
      if (operation === "head") return { status: 128, stdout: "", stderr: "" }
      if (operation !== "file-info") throw new Error(`Unexpected operation: ${operation}`)
      const records = (fields[1] ?? "").split("\n")
      batches.push(records)
      return {
        status: 0,
        stdout: records
          .map((record) => `100\t1\thash\t${paths.indexOf(record.slice(1)) + 1}\t0\n`)
          .join(""),
        stderr: "",
      }
    },
  )
  const source = createRemoteLiveDiffSource(target, options)
  try {
    const snapshot = await source.readRoot(target.workingDirectory, new AbortController().signal)
    expect(batches.map((batch) => batch.length)).toEqual([16, 16, 8])
    expect(snapshot.files.map((file) => file.path)).toEqual(paths)
    expect(snapshot.files.map((file) => file.additions)).toEqual(paths.map((_, index) => index + 1))
    expect(snapshot.truncated).toBe(false)
  } finally {
    source.close()
    request.mockRestore()
  }
})

test.each([
  { status: 127, stderr: "git: not found", failure: true },
  { status: 128, stderr: "fatal: detected dubious ownership in repository", failure: true },
  { status: 128, stderr: "fatal: not a git repository", failure: false },
])(
  "remote root discovery distinguishes Git errors: $stderr",
  async ({ status, stderr, failure }) => {
    const request = spyOn(RemoteLiveDiffProtocol.prototype, "request").mockResolvedValue({
      status,
      stdout: "",
      stderr,
    })
    const source = createRemoteLiveDiffSource(target, options)
    try {
      const root = source.repositoryRoot(target.workingDirectory, new AbortController().signal)
      if (failure) await expect(root).rejects.toThrow(stderr)
      else await expect(root).resolves.toBeNull()
    } finally {
      source.close()
      request.mockRestore()
    }
  },
)
