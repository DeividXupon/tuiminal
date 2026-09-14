import { plugin } from "bun"

// Runs only in the version test's child process. A metadata-only command must
// not import settings, translation catalogs, feature code or their dependencies.
plugin({
  name: "cli-version-import-guard",
  setup(build) {
    build.onLoad({ filter: /[/\\]packages[/\\](?:core|feature-[^/\\]+)[/\\]src[/\\]/ }, () => {
      throw new Error("Version command loaded an application runtime module")
    })
  },
})
