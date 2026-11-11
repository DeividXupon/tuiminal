import type { useHttpProject } from "./use-http-project"
import {
  belongsToHttpSource,
  pathsForHttpSource,
  requestsForHttpSource,
  type HttpSourceMode,
} from "../model/source-mode"

export function httpSourceProject(
  project: ReturnType<typeof useHttpProject>,
  mode: HttpSourceMode,
  workspaceId?: string,
) {
  const workspaceCollections = new Map(
    project.postmanCollections
      .filter((item) => item.workspaceId === workspaceId)
      .map((item) => [item.filePath, item]),
  )
  return {
    projectRequests: requestsForHttpSource(project.projectRequests, mode).filter(
      (item) => mode === "local" || workspaceCollections.has(item.filePath),
    ),
    sourceFiles: project.project.files
      .filter(
        (file) =>
          belongsToHttpSource(file.path, mode) &&
          (mode === "local" || workspaceCollections.has(file.path)),
      )
      .map((file) => {
        const name = workspaceCollections.get(file.path)?.name
        return name === undefined ? file : { ...file, name }
      }),
    sourceDirectories:
      mode === "postman" ? [] : pathsForHttpSource(project.project.directories, mode),
    sourcePostmanFolders: project.postmanFolders.filter((folder) =>
      workspaceCollections.has(folder.filePath),
    ),
  }
}

export function httpSourceRuntime(
  project: ReturnType<typeof useHttpProject>,
  postman: ReturnType<typeof import("./use-http-postman").useHttpPostman>,
  mode: HttpSourceMode,
) {
  if (mode === "postman")
    return {
      ...postman.view,
      activeEnvironment: undefined,
      activeEnvironmentName: postman.session?.environmentName ?? null,
      variablesForRequest: postman.view.variablesForRequest,
      refreshProject: postman.refresh,
    }
  return {
    ...httpSourceProject(project, mode),
    activeEnvironment: project.activeEnvironment,
    activeEnvironmentName: project.activeEnvironmentName,
    variablesForRequest: project.variablesForRequest,
    refreshProject: project.refresh,
  }
}
