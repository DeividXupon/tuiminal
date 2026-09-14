import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  const refreshStateRef = useRef<{
    root: string
    disposed: boolean
    queued: boolean
    pending: Promise<void> | null
  }>({ root, disposed: false, queued: false, pending: null })
  if (refreshStateRef.current.root !== root) {
    refreshStateRef.current = { root, disposed: false, queued: false, pending: null }
  }

  const refresh = useCallback(() => {
    const state = refreshStateRef.current
    state.queued = true
    if (state.pending) return state.pending

    const run = async () => {
      while (state.queued && !state.disposed) {
        state.queued = false
        const [nextProject, nextConfig] = await Promise.all([
          scanHttpProject(root),
          loadHttpWorkspaceConfigSnapshot(root),
        ])
        const nextEnvironmentCatalog = await loadHttpEnvironmentCatalog(
          root,
          nextProject.files.map((file) => file.path),
        )
        if (state.disposed || refreshStateRef.current !== state) return
        setProject(nextProject)
        setEnvironmentCatalog(nextEnvironmentCatalog)
        setWorkspaceConfig(nextConfig.config)
        setWorkspaceConfigSourceHash(nextConfig.sourceHash)
        setWorkspaceConfigError(nextConfig.error)
      }
    }
    const pending = run()
    state.pending = pending
    void pending.then(
      () => {
        if (state.pending === pending) state.pending = null
      },
      () => {
        if (state.pending === pending) state.pending = null
      },
    )
    return pending
  }, [root])

  useEffect(() => {
    const state = refreshStateRef.current
    state.disposed = false
    let stopWatching: (() => void) | undefined
    void refresh()
    void watchHttpProject(root, () => {
      if (!state.disposed) void refresh()
    }).then((stop) => {
      if (state.disposed) stop()
      else stopWatching = stop
    })
    return () => {
      state.disposed = true
      state.queued = false
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
