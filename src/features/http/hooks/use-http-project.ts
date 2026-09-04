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
  loadHttpEnvironments,
  type CreatePrivateHttpEnvironmentInput,
  type HttpEnvironment,
} from "../storage/environments"

export function useHttpProject(root = HTTP_WORKING_DIRECTORY) {
  const [project, setProject] = useState<HttpProjectCollection>({ root, files: [], errors: [] })
  const [environments, setEnvironments] = useState<HttpEnvironment[]>([])
  const [activeEnvironmentName, setActiveEnvironmentName] = useState<string | null>(null)
  const [workspaceConfig, setWorkspaceConfig] = useState(DEFAULT_HTTP_WORKSPACE_CONFIG)
  const [workspaceConfigSourceHash, setWorkspaceConfigSourceHash] = useState<string | null>(null)
  const [workspaceConfigError, setWorkspaceConfigError] = useState("")

  const refresh = useCallback(async () => {
    const [nextProject, nextEnvironments, nextConfig] = await Promise.all([
      scanHttpProject(root),
      loadHttpEnvironments(root),
      loadHttpWorkspaceConfigSnapshot(root),
    ])
    setProject(nextProject)
    setEnvironments(nextEnvironments)
    setWorkspaceConfig(nextConfig.config)
    setWorkspaceConfigSourceHash(nextConfig.sourceHash)
    setWorkspaceConfigError(nextConfig.error)
    setActiveEnvironmentName((current) => {
      if (current && nextEnvironments.some((environment) => environment.name === current)) {
        return current
      }
      const preferred = nextConfig.config.defaultEnvironment
      return preferred && nextEnvironments.some((environment) => environment.name === preferred)
        ? preferred
        : null
    })
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
      return environmentVariableContext(activeEnvironment, fileVariables)
    },
    [activeEnvironment, project.files],
  )

  const selectEnvironment = useCallback((name: string | null) => {
    setActiveEnvironmentName(name)
  }, [])

  const createPrivateEnvironment = useCallback(
    async (input: CreatePrivateHttpEnvironmentInput) => {
      const result = await createPrivateHttpEnvironment(root, input)
      await refresh()
      setActiveEnvironmentName(result.environmentName)
      return result
    },
    [refresh, root],
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
