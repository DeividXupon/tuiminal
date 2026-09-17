import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { requestFromHttpFile } from "../model/http-file"
import type { HttpProjectRequestItem, HttpRequestDefinition } from "../model/types"
import { ensureHttpWorkspaceDirectory, HTTP_WORKING_DIRECTORY } from "../services/context"
import {
  scanHttpProject,
  watchHttpProject,
  type HttpProjectCollection,
} from "../storage/collections"
import { GLOBAL_HTTP_ENVIRONMENT_NAME } from "../model/environment-scope"
import {
  environmentVariableContext,
  httpEnvironmentsForRequest,
  loadHttpEnvironmentCatalog,
  type HttpEnvironmentCatalog,
  type HttpEnvironment,
} from "../storage/environments"
import {
  createGlobalHttpEnvironment,
  deleteGlobalHttpEnvironment,
  replaceGlobalHttpEnvironment,
  saveGlobalHttpVariables,
  type CreateGlobalHttpEnvironmentInput,
} from "../storage/global-environments"

export function useHttpProject(root = HTTP_WORKING_DIRECTORY) {
  const [project, setProject] = useState<HttpProjectCollection>({
    root,
    files: [],
    directories: [],
    errors: [],
  })
  const [environmentCatalog, setEnvironmentCatalog] = useState<HttpEnvironmentCatalog>({
    scopes: [],
  })
  const [activeEnvironmentName, setActiveEnvironmentName] = useState<string | null>(null)
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
        await ensureHttpWorkspaceDirectory(root)
        const [nextProject, nextEnvironmentCatalog] = await Promise.all([
          scanHttpProject(root),
          loadHttpEnvironmentCatalog(root, []),
        ])
        if (state.disposed || refreshStateRef.current !== state) return
        setProject(nextProject)
        setEnvironmentCatalog(nextEnvironmentCatalog)
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
    () =>
      httpEnvironmentsForRequest(environmentCatalog).filter(
        (environment) => environment.name !== GLOBAL_HTTP_ENVIRONMENT_NAME,
      ),
    [environmentCatalog],
  )
  const globals = useMemo(
    () =>
      httpEnvironmentsForRequest(environmentCatalog).find(
        (environment) => environment.name === GLOBAL_HTTP_ENVIRONMENT_NAME,
      ),
    [environmentCatalog],
  )
  useEffect(() => {
    setActiveEnvironmentName((current) => {
      if (current && environments.some((environment) => environment.name === current)) {
        return current
      }
      return null
    })
  }, [environments])
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
      return environmentVariableContext(activeEnvironment, fileVariables, {}, globals)
    },
    [activeEnvironment, globals, project.files],
  )

  const selectEnvironment = useCallback((name: string | null) => {
    setActiveEnvironmentName(name)
  }, [])

  const createEnvironment = useCallback(
    async (input: CreateGlobalHttpEnvironmentInput) => {
      const result = await createGlobalHttpEnvironment(root, input)
      await refresh()
      setActiveEnvironmentName(result.environmentName)
      return result
    },
    [refresh, root],
  )

  const replaceEnvironment = useCallback(
    async (originalName: string, input: CreateGlobalHttpEnvironmentInput) => {
      const result = await replaceGlobalHttpEnvironment(root, originalName, input)
      setActiveEnvironmentName((current) =>
        current === originalName ? result.environmentName : current,
      )
      await refresh()
      return result
    },
    [refresh, root],
  )

  const deleteEnvironment = useCallback(
    async (name: string) => {
      const result = await deleteGlobalHttpEnvironment(root, name)
      setActiveEnvironmentName((current) => (current === name ? null : current))
      await refresh()
      return result
    },
    [refresh, root],
  )

  const saveGlobals = useCallback(
    async (input: Omit<CreateGlobalHttpEnvironmentInput, "environmentName">) => {
      const result = await saveGlobalHttpVariables(root, input.variables)
      await refresh()
      return result
    },
    [refresh, root],
  )

  return {
    root,
    project,
    projectRequests,
    environments,
    globals,
    activeEnvironment,
    activeEnvironmentName,
    refresh,
    variablesForRequest,
    selectEnvironment,
    createEnvironment,
    replaceEnvironment,
    deleteEnvironment,
    saveGlobals,
  }
}
