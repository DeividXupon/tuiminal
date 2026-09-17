import { featureErrorMessage } from "./errors"
import { downloadFeature, type FeatureProgress } from "./download"
import { featureEnvironment } from "./environment"
import { loadFeature } from "./loader"
import { sourceFeaturesEnabled } from "./mode"
import { FEATURE_IDS, preferredInstalledFeature, type FeatureId } from "./model"

export type FeatureState = {
  ready: boolean
  installed: readonly FeatureId[]
  busy: FeatureId | null
  removing?: FeatureId | null
  progress: FeatureProgress | null
  error: string
}
type Environment = Awaited<ReturnType<typeof featureEnvironment>>
export class FeatureController {
  private listeners = new Set<() => void>()
  private state: FeatureState = {
    ready: false,
    installed: [],
    busy: null,
    progress: null,
    error: "",
  }
  private environment: Environment | null = null
  private operation: AbortController | null = null
  private removing = false
  private disposed = false
  private openGeneration = 0
  constructor(
    private dependencies = {
      environment: featureEnvironment,
      load: loadFeature,
      source: sourceFeaturesEnabled(),
    },
  ) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<FeatureState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  async initialize(requested?: FeatureId | null, isolated = false) {
    if (this.disposed || this.state.ready) return
    try {
      let installed: FeatureId[]
      if (this.dependencies.source) installed = [...FEATURE_IDS]
      else {
        this.environment = await this.dependencies.environment()
        const environment = this.environment
        const results = await Promise.all(
          environment.catalog.artifacts.map(async (artifact) =>
            (await environment.store.installed(artifact)) ? artifact.id : null,
          ),
        )
        installed = results.filter((id): id is FeatureId => id !== null)
      }
      if (this.disposed) return
      const initial = isolated
        ? requested && installed.includes(requested)
          ? requested
          : null
        : preferredInstalledFeature(installed, requested ?? undefined)
      if (initial) await this.dependencies.load(initial)
      this.update({ installed, ready: true })
    } catch (error) {
      this.update({
        ready: true,
        error: featureErrorMessage(error),
      })
    }
  }
  async open(id: FeatureId) {
    if (!this.state.installed.includes(id) || this.operation || this.removing || this.disposed)
      return false
    const generation = ++this.openGeneration
    this.update({ busy: id, error: "" })
    try {
      await this.dependencies.load(id)
      return !this.disposed && generation === this.openGeneration
    } catch (error) {
      if (generation === this.openGeneration)
        this.update({
          error: featureErrorMessage(error),
          installed: this.state.installed.filter((feature) => feature !== id),
        })
      return false
    } finally {
      if (generation === this.openGeneration) this.update({ busy: null })
    }
  }
  async install(ids: readonly FeatureId[]) {
    if (this.operation || this.state.busy || this.removing || this.disposed) return
    const operation = new AbortController()
    this.operation = operation
    const timer = setTimeout(
      () => operation.abort(new Error("Feature installation timed out")),
      120_000,
    )
    try {
      this.update({ error: "" })
      const environment = this.environment ?? (await this.dependencies.environment())
      this.environment = environment
      for (const id of [...new Set(ids)]) {
        operation.signal.throwIfAborted()
        if (this.state.installed.includes(id)) continue
        const artifact = environment.catalog.artifacts.find((item) => item.id === id)
        if (!artifact) throw new Error("Unknown official feature")
        this.update({ busy: id, progress: { received: 0, total: artifact.size } })
        const files = await downloadFeature(
          artifact,
          new URL(artifact.filename, environment.baseUrl),
          {
            signal: operation.signal,
            allowLocalFiles: environment.allowLocalFiles,
            onProgress: (progress) => this.update({ progress }),
          },
        )
        await environment.store.publish(artifact, files, operation.signal)
        this.update({ installed: [...this.state.installed, id] })
      }
    } catch (error) {
      this.update({
        error: operation.signal.aborted
          ? "Instalação de ferramenta cancelada"
          : featureErrorMessage(error),
      })
    } finally {
      clearTimeout(timer)
      if (this.operation === operation) this.operation = null
      this.update({ busy: null, progress: null })
    }
  }
  async uninstall(id: FeatureId, retire: () => Promise<void>) {
    if (
      this.disposed ||
      this.operation ||
      this.state.busy ||
      this.removing ||
      !this.state.installed.includes(id)
    )
      return false
    this.removing = true
    this.update({ busy: id, removing: id, progress: null, error: "" })
    try {
      const environment = this.environment ?? (await this.dependencies.environment())
      const artifact = environment.catalog.artifacts.find((item) => item.id === id)
      if (!artifact) throw new Error("Unknown official feature")
      if (this.disposed) return false
      await retire()
      if (this.disposed) return false
      try {
        await environment.store.remove(artifact)
      } catch (error) {
        // A failed recursive removal may already have removed some files.
        if (!(await environment.store.installed(artifact)))
          this.update({
            installed: this.state.installed.filter((feature) => feature !== id),
            error: "Não foi possível desinstalar a ferramenta. Tente novamente.",
          })
        throw error
      }
      this.update({ installed: this.state.installed.filter((feature) => feature !== id) })
      return true
    } catch {
      this.update({ error: "Não foi possível desinstalar a ferramenta. Tente novamente." })
      return false
    } finally {
      this.removing = false
      this.update({ busy: null, removing: null })
    }
  }
  cancel() {
    this.operation?.abort()
  }
  dispose() {
    this.disposed = true
    this.cancel()
    this.listeners.clear()
  }
}
