import type * as database from "@xupon/tuiminal-feature-database"
import type * as git from "@xupon/tuiminal-feature-git"
import type * as runner from "@xupon/tuiminal-feature-runner"
import type * as http from "@xupon/tuiminal-feature-http"
import type * as terminal from "@xupon/tuiminal-feature-terminal"
import type { FeatureId } from "./model"

export type FeatureModules = {
  database: typeof database
  git: typeof git
  runner: typeof runner
  http: typeof http
  terminal: typeof terminal
}
const modules: Partial<FeatureModules> = {}
export function loadedFeature<T extends FeatureId>(id: T): FeatureModules[T] | undefined {
  return modules[id]
}
export function registerFeature<T extends FeatureId>(id: T, module: FeatureModules[T]) {
  modules[id] = module
}
export function requireFeature<T extends FeatureId>(id: T): FeatureModules[T] {
  const module = loadedFeature(id)
  if (!module) throw new Error(`Official feature ${id} is not loaded`)
  return module
}
