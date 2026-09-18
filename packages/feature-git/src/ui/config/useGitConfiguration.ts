import { useCallback, useEffect, useRef, useState } from "react"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import { unifiedRepositorySelection } from "../../model/git-configuration"
import { issueProfileForRoot, type IssueProfile } from "../../model/issue/config"
import type { IssueSection } from "../../model/issue/types"
import { pullRequestProfileForRoot, type PullRequestProfile } from "../../model/pr/config"
import type { PullRequestSection } from "../../model/pr/types"
import { gitDiffsTargetForScope } from "../../model/local-target"
import { resolveGitProjectContext, type GitProjectContext } from "../../services/git"
import { detectGhCapabilities } from "../../services/github/auth"
import { loadGitHubRepositoryCatalog } from "../../services/github/repository-catalog"
import {
  discoverLocalGitProjects,
  loadLocalGitTarget,
  switchLocalGitBranch,
  type LocalGitProject,
  type LocalGitTarget,
} from "../../services/local-target"
import type { GhTransportOptions } from "../../services/github/transport"
import { loadIssueConfig, updateIssueProfile } from "../../storage/issue/config"
import { loadPullRequestConfig, updatePullRequestProfile } from "../../storage/pr/config"
import { loadGitDiffsConfig, updateGitDiffsTarget } from "../../storage/local/config"
import { loadGitBrowserConfig, saveGitBrowserConfig } from "../../storage/browser/config"
import type { GitBrowser } from "../../model/browser"

export type GitConfigurationChange = "local" | "remote"

export type GitConfigurationReadyState = {
  status: "ready"
  context: GitProjectContext
  host: string
  pullRequestProfile: PullRequestProfile
  issueProfile: IssueProfile
  repositories: string[]
  availableRepositories: string[]
  scopeMismatch: boolean
  repositoriesLoading: boolean
  repositoryError: string
  partial: boolean
  localTarget: LocalGitTarget
  availableLocalProjects: LocalGitProject[]
  localProjectsLoading: boolean
  localProjectError: string
  browser: GitBrowser
  browserError: string
}

export type GitConfigurationState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | GitConfigurationReadyState

function transportFromEnvironment(): GhTransportOptions {
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return executable ? { executable } : {}
}

function uniqueRepositories(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function uniqueLocalProjects(values: readonly LocalGitProject[]) {
  return [...new Map(values.map((project) => [project.root, project])).values()].sort(
    (left, right) => left.name.localeCompare(right.name) || left.root.localeCompare(right.root),
  )
}

function failureMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : translateUi("Não foi possível salvar a configuração.")
}

async function loadInitialGitConfiguration(
  signal: AbortSignal,
): Promise<GitConfigurationReadyState> {
  const context = await resolveGitProjectContext()
  signal.throwIfAborted()
  const pullRequests = loadPullRequestConfig()
  const issues = loadIssueConfig()
  const local = loadGitDiffsConfig()
  const browser = loadGitBrowserConfig()
  if (pullRequests.error || issues.error) {
    throw new Error(pullRequests.error ?? issues.error ?? "Invalid Git configuration")
  }
  const fallbackLocalRoot = context.isRepository ? context.root : context.launchDirectory
  const configuredLocalRoot = gitDiffsTargetForScope(local.config, context.root, fallbackLocalRoot)
  let localTarget = await loadLocalGitTarget(configuredLocalRoot)
  signal.throwIfAborted()
  let localProjectError = local.error ?? ""
  if (!localTarget.isRepository && configuredLocalRoot !== fallbackLocalRoot) {
    localTarget = await loadLocalGitTarget(fallbackLocalRoot)
    localProjectError ||= translateUi(
      "O projeto local salvo não está mais disponível; usando o projeto inicial.",
    )
  }
  const fallback = context.remote
  const pullRequestProfile = pullRequestProfileForRoot(pullRequests.config, context.root, fallback)
  const issueProfile = issueProfileForRoot(issues.config, context.root, fallback)
  const pullRequestsExplicit = Boolean(pullRequests.config.profiles[context.root])
  const issuesExplicit = Boolean(issues.config.profiles[context.root])
  const selection = unifiedRepositorySelection({
    pullRequests: pullRequestProfile.repositories,
    issues: issueProfile.repositories,
    pullRequestsExplicit,
    issuesExplicit,
  })
  let host = fallback?.host ?? pullRequestProfile.host
  if (issuesExplicit) host = issueProfile.host
  if (pullRequestsExplicit) host = pullRequestProfile.host
  return {
    status: "ready",
    context,
    host,
    pullRequestProfile,
    issueProfile,
    repositories: selection.repositories,
    availableRepositories: uniqueRepositories([
      ...(fallback ? [fallback.repository] : []),
      ...pullRequestProfile.repositories,
      ...issueProfile.repositories,
    ]),
    scopeMismatch: selection.mismatch || pullRequestProfile.host !== issueProfile.host,
    repositoriesLoading: true,
    repositoryError: "",
    partial: false,
    localTarget,
    availableLocalProjects: localTarget.isRepository ? [localTarget] : [],
    localProjectsLoading: true,
    localProjectError,
    browser: browser.browser,
    browserError: browser.error ?? "",
  }
}

async function loadRepositoryCatalog(state: GitConfigurationReadyState, signal: AbortSignal) {
  const transport = { ...transportFromEnvironment(), signal }
  const capabilities = await detectGhCapabilities(transport)
  signal.throwIfAborted()
  if (!capabilities.supported) {
    throw new Error(
      capabilities.reason === "missing"
        ? translateUi("GitHub CLI não encontrado. Instale gh 2.40.0 ou mais recente.")
        : translateUi("GitHub CLI desatualizado. Instale gh 2.40.0 ou mais recente."),
    )
  }
  return loadGitHubRepositoryCatalog({ host: state.host, options: transport })
}

function mergeRepositoryCatalog(
  current: GitConfigurationState,
  catalog: Awaited<ReturnType<typeof loadGitHubRepositoryCatalog>>,
): GitConfigurationState {
  if (current.status !== "ready") return current
  return {
    ...current,
    availableRepositories: uniqueRepositories([
      ...current.availableRepositories,
      ...catalog.repositories,
    ]),
    repositoriesLoading: false,
    partial: catalog.partial,
  }
}

function repositoryLoadFailure(
  current: GitConfigurationState,
  error: unknown,
): GitConfigurationState {
  if (current.status !== "ready") return { status: "error", error: failureMessage(error) }
  return { ...current, repositoriesLoading: false, repositoryError: failureMessage(error) }
}

function mergeLocalProjects(
  current: GitConfigurationState,
  projects: readonly LocalGitProject[],
): GitConfigurationState {
  if (current.status !== "ready") return current
  return {
    ...current,
    availableLocalProjects: uniqueLocalProjects([
      ...(current.localTarget.isRepository ? [current.localTarget] : []),
      ...projects,
    ]),
    localProjectsLoading: false,
  }
}

function localProjectLoadFailure(
  current: GitConfigurationState,
  error: unknown,
): GitConfigurationState {
  if (current.status !== "ready") return { status: "error", error: failureMessage(error) }
  return { ...current, localProjectsLoading: false, localProjectError: failureMessage(error) }
}

export function useGitConfiguration(
  open: boolean,
  onChanged: (change: GitConfigurationChange) => void,
) {
  const [state, setState] = useState<GitConfigurationState>({ status: "loading" })
  const [notice, setNotice] = useState("")
  const readerRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    readerRef.current?.abort()
    const reader = new AbortController()
    readerRef.current = reader
    const publish = (update: (current: GitConfigurationState) => GitConfigurationState) => {
      if (reader.signal.aborted) return
      setState((current) => (reader.signal.aborted ? current : update(current)))
    }
    setState({ status: "loading" })
    setNotice("")
    try {
      const initial = await loadInitialGitConfiguration(reader.signal)
      if (reader.signal.aborted) return
      setState(initial)
      await Promise.all([
        loadRepositoryCatalog(initial, reader.signal).then(
          (catalog) => publish((current) => mergeRepositoryCatalog(current, catalog)),
          (error) => publish((current) => repositoryLoadFailure(current, error)),
        ),
        discoverLocalGitProjects(initial.localTarget.root).then(
          (projects) => publish((current) => mergeLocalProjects(current, projects)),
          (error) => publish((current) => localProjectLoadFailure(current, error)),
        ),
      ])
    } catch (error) {
      publish((current) => repositoryLoadFailure(current, error))
    }
  }, [])

  useEffect(() => {
    if (open) void load()
    return () => {
      readerRef.current?.abort()
    }
  }, [load, open])

  const savePullRequestSections = (sections: PullRequestSection[]) => {
    if (state.status !== "ready") return false
    const profile = { ...state.pullRequestProfile, sections }
    try {
      updatePullRequestProfile({
        root: state.context.root,
        fallbackProfile: state.pullRequestProfile,
        update: () => profile,
      })
      setState({ ...state, pullRequestProfile: profile })
      setNotice(translateUi("Configuração Git salva."))
      onChanged("remote")
      return true
    } catch (error) {
      setNotice(failureMessage(error))
      return false
    }
  }

  const saveIssueSections = (sections: IssueSection[]) => {
    if (state.status !== "ready") return false
    const profile = { ...state.issueProfile, sections }
    try {
      updateIssueProfile({
        root: state.context.root,
        fallbackProfile: state.issueProfile,
        update: () => profile,
      })
      setState({ ...state, issueProfile: profile })
      setNotice(translateUi("Configuração Git salva."))
      onChanged("remote")
      return true
    } catch (error) {
      setNotice(failureMessage(error))
      return false
    }
  }

  const saveRepositories = (repositories: string[]) => {
    if (state.status !== "ready") return false
    try {
      updatePullRequestProfile({
        root: state.context.root,
        fallbackProfile: state.pullRequestProfile,
        update: (profile) => ({ ...profile, host: state.host, repositories }),
      })
      updateIssueProfile({
        root: state.context.root,
        fallbackProfile: state.issueProfile,
        update: (profile) => ({ ...profile, host: state.host, repositories }),
      })
      setState({
        ...state,
        repositories,
        pullRequestProfile: { ...state.pullRequestProfile, host: state.host, repositories },
        issueProfile: { ...state.issueProfile, host: state.host, repositories },
        scopeMismatch: false,
      })
      setNotice(translateUi("Escopo de repositórios salvo para PR e Issues."))
      onChanged("remote")
      return true
    } catch (error) {
      setNotice(failureMessage(error))
      onChanged("remote")
      return false
    }
  }

  const saveLocalProject = async (root: string) => {
    if (state.status !== "ready") return false
    setNotice("")
    try {
      const target = await loadLocalGitTarget(root)
      if (!target.isRepository) {
        throw new Error(translateUi("O projeto selecionado não é um repositório Git."))
      }
      updateGitDiffsTarget({ scope: state.context.root, repositoryRoot: target.root })
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              localTarget: target,
              availableLocalProjects: uniqueLocalProjects([
                target,
                ...current.availableLocalProjects,
              ]),
              localProjectError: "",
            }
          : current,
      )
      setNotice(translateUi("Projeto local dos Diffs salvo."))
      onChanged("local")
      return true
    } catch (error) {
      setNotice(failureMessage(error))
      return false
    }
  }

  const saveLocalBranch = async (branch: string) => {
    if (state.status !== "ready" || !state.localTarget.isRepository) return false
    setNotice("")
    try {
      const target = await switchLocalGitBranch(state.localTarget.root, branch)
      setState((current) =>
        current.status === "ready" ? { ...current, localTarget: target } : current,
      )
      setNotice(translateUi("Branch local alterada."))
      onChanged("local")
      return true
    } catch (error) {
      setNotice(failureMessage(error))
      return false
    }
  }

  const saveBrowser = (browser: GitBrowser) => {
    if (state.status !== "ready") return false
    try {
      saveGitBrowserConfig(browser)
      setState((current) =>
        current.status === "ready" ? { ...current, browser, browserError: "" } : current,
      )
      setNotice(translateUi("Navegador do Git salvo."))
      return true
    } catch (error) {
      setNotice(failureMessage(error))
      return false
    }
  }

  return {
    state,
    notice,
    reload: load,
    savePullRequestSections,
    saveIssueSections,
    saveRepositories,
    saveLocalProject,
    saveLocalBranch,
    saveBrowser,
  }
}
