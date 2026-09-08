import { useCallback, useEffect, useMemo, useState } from "react"
import { requestFromHttpFile } from "../model/http-file"
import type { HttpProjectRequestItem, HttpRequestDefinition } from "../model/types"
import { HTTP_WORKING_DIRECTORY } from "../services/context"
import {
  scanHttpProject,
  watchHttpProject,
  type HttpProjectCollection,
} from "../storage/collections"
import {
  DEFAULT_HTTP_WORKSPACE_CONFIG,
  loadHttpWorkspaceConfigSnapshot,
  saveHttpWorkspaceConfig,
  type HttpWorkspaceConfig,
} from "../storage/config"
import {
  createPrivateHttpEnvironment,
  environmentVariableContext,
  httpEnvironmentScopeDirectory,
  httpEnvironmentsForRequest,
  loadHttpEnvironmentCatalog,
  type CreatePrivateHttpEnvironmentInput,
  type HttpEnvironmentCatalog,
  type HttpEnvironment,
} from "../storage/environments"

export function useHttpProject(requestPath?: string | null, root = HTTP_WORKING_DIRECTORY) {
  const [project, setProject] = useState<HttpProjectCollection>({ root, files: [], errors: [] })
  const [environmentCatalog, setEnvironmentCatalog] = useState<HttpEnvironmentCatalog>({
    scopes: [],
  })
  const [activeEnvironmentName, setActiveEnvironmentName] = useState<string | null>(null)
  const [workspaceConfig, setWorkspaceConfig] = useState(DEFAULT_HTTP_WORKSPACE_CONFIG)
  const [workspaceConfigSourceHash, setWorkspaceConfigSourceHash] = useState<string | null>(null)
  const [workspaceConfigError, setWorkspaceConfigError] = useState("")

  const refresh = useCallback(async () => {
    const [nextProject, nextConfig] = await Promise.all([
      scanHttpProject(root),
      loadHttpWorkspaceConfigSnapshot(root),
    ])
    const nextEnvironmentCatalog = await loadHttpEnvironmentCatalog(
      root,
      nextProject.files.map((file) => file.path),
    )
    setProject(nextProject)
    setEnvironmentCatalog(nextEnvironmentCatalog)
    setWorkspaceConfig(nextConfig.config)
    setWorkspaceConfigSourceHash(nextConfig.sourceHash)
    setWorkspaceConfigError(nextConfig.error)
  }, [root])

  useEffect(() => {
    let disposed = false
    let stopWatching: (() => void) | undefined
    void refresh()
    void watchHttpProject(root, () => {
      if (!disposed) void refresh()
    }).then((stop) => {
      if (disposed) stop()
      else stopWatching = stop
    })
    return () => {
      disposed = true
      stopWatching?.()
    }
  }, [refresh, root])

  const projectRequests = useMemo<HttpProjectRequestItem[]>(
    () =>
      project.files.flatMap((file) =>
        file.requests.map((block) => ({
          filePath: file.path,
          request: requestFromHttpFile(file, block),
        })),
      ),
    [project.files],
  )
  const environments = useMemo<HttpEnvironment[]>(
    () => httpEnvironmentsForRequest(environmentCatalog, requestPath),
    [environmentCatalog, requestPath],
  )
  useEffect(() => {
    setActiveEnvironmentName((current) => {
      if (current && environments.some((environment) => environment.name === current)) {
        return current
      }
      const preferred = workspaceConfig.defaultEnvironment
      return preferred && environments.some((environment) => environment.name === preferred)
        ? preferred
        : null
    })
  }, [environments, workspaceConfig.defaultEnvironment])
  const activeEnvironment = environments.find(
    (environment) => environment.name === activeEnvironmentName,
  )
  const variablesForRequest = useCallback(
    (request: HttpRequestDefinition) => {
      const source = request.source
      const fileVariables =
        source.kind === "file"
          ? project.files.find((file) => file.path === source.path)?.variables
          : undefined
      const scopedEnvironment = activeEnvironmentName
        ? httpEnvironmentsForRequest(
            environmentCatalog,
            source.kind === "file" ? source.path : null,
          ).find((environment) => environment.name === activeEnvironmentName)
        : undefined
      return environmentVariableContext(scopedEnvironment, fileVariables)
    },
    [activeEnvironmentName, environmentCatalog, project.files],
  )

  const selectEnvironment = useCallback((name: string | null) => {
    setActiveEnvironmentName(name)
  }, [])

  const createPrivateEnvironment = useCallback(
    async (input: CreatePrivateHttpEnvironmentInput) => {
      const result = await createPrivateHttpEnvironment(
        root,
        input,
        undefined,
        httpEnvironmentScopeDirectory(requestPath),
      )
      await refresh()
      setActiveEnvironmentName(result.environmentName)
      return result
    },
    [refresh, requestPath, root],
  )

  const saveWorkspaceConfig = useCallback(
    async (config: HttpWorkspaceConfig, expectedHash: string | null) => {
      const saved = await saveHttpWorkspaceConfig(root, config, expectedHash)
      setWorkspaceConfig(saved.config)
      setWorkspaceConfigSourceHash(saved.sourceHash)
      setWorkspaceConfigError("")
      return saved
    },
    [root],
  )

  return {
    root,
    project,
    projectRequests,
    environments,
    activeEnvironment,
    activeEnvironmentName,
    privateEnvironmentPath: [
      httpEnvironmentScopeDirectory(requestPath),
      "http-client.private.env.json",
    ]
      .filter(Boolean)
      .join("/"),
    workspaceConfig,
    workspaceConfigSourceHash,
    workspaceConfigError,
    refresh,
    variablesForRequest,
    selectEnvironment,
    createPrivateEnvironment,
    saveWorkspaceConfig,
  }
}
