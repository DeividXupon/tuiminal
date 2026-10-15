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
  const workspacePaths = new Set(
    project.postmanCollections
      .filter((item) => item.workspaceId === workspaceId)
      .map((item) => item.filePath),
  )
  return {
    projectRequests: requestsForHttpSource(project.projectRequests, mode).filter(
      (item) => mode === "local" || workspacePaths.has(item.filePath),
    ),
    sourceFiles: project.project.files.filter(
      (file) =>
        belongsToHttpSource(file.path, mode) && (mode === "local" || workspacePaths.has(file.path)),
    ),
    sourceDirectories:
      mode === "postman" ? [] : pathsForHttpSource(project.project.directories, mode),
    sourcePostmanFolders: project.postmanFolders.filter((folder) =>
      workspacePaths.has(folder.filePath),
    ),
  }
}
