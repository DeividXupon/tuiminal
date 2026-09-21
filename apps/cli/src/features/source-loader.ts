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
export async function sourceHttpCommand(command: "run" | "import" | "postman", args: string[]) {
  if (command === "run")
    return (await import("@xupon/tuiminal-feature-http/cli/run")).runHttpHeadless(args)
  if (command === "import")
    return (await import("@xupon/tuiminal-feature-http/cli/import")).importHttpCollectionCli(args)
  return (await import("@xupon/tuiminal-feature-http/cli/postman")).postmanCli(args)
}
export async function sourceTerminalSidebar(args: string[]) {
  return (await import("@xupon/tuiminal-feature-terminal/cli/sidebar")).runTerminalSidebarCli(args)
}
