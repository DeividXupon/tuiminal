// Used only by repository tests. The release build replaces this module with a stub.
import type { FeatureId } from "./model"
import { registerFeature } from "./registry"
export async function loadSourceFeature(id: FeatureId) {
  switch (id) {
    case "database":
      return registerFeature(id, await import("@xupon/tuiminal-feature-database"))
    case "git":
      return registerFeature(id, await import("@xupon/tuiminal-feature-git"))
    case "runner":
      return registerFeature(id, await import("@xupon/tuiminal-feature-runner"))
    case "http":
      return registerFeature(id, await import("@xupon/tuiminal-feature-http"))
    case "terminal":
      return registerFeature(id, await import("@xupon/tuiminal-feature-terminal"))
  }
}
export async function sourceHttpCommand(command: "run" | "import", args: string[]) {
  return command === "run"
    ? (await import("@xupon/tuiminal-feature-http/cli/run")).runHttpHeadless(args)
    : (await import("@xupon/tuiminal-feature-http/cli/import")).importHttpCollectionCli(args)
}
