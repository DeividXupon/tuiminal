import { randomUUID } from "node:crypto"
import type {
  RemoteProjectSyncChange,
  RemoteProjectSyncMapping,
  RemoteProjectSyncReview,
  RemoteProjectSyncStatus,
} from "../model/remote-project-sync"
import type { RemoteCodexTarget } from "../model/sessions"
import {
  RemoteProjectSyncCollisionError,
  RemoteProjectSyncLocalChangesError,
  RemoteProjectSyncLocalRaceError,
} from "./remote-project-sync-errors"
import { remoteProjectSyncWorkerCommand } from "./remote-project-sync-worker-runtime"
import type {
  RemoteProjectSyncWorkerRequest,
  RemoteProjectSyncWorkerResponse,
} from "./remote-project-sync-worker-protocol"

type WorkerResult =
  | Extract<RemoteProjectSyncWorkerResponse, { kind: "review" }>
  | Extract<RemoteProjectSyncWorkerResponse, { kind: "page" }>
  | Extract<RemoteProjectSyncWorkerResponse, { kind: "complete" }>

type WithoutId<T> = T extends { id: string } ? Omit<T, "id"> : never
type WorkerRequestWithoutId = WithoutId<RemoteProjectSyncWorkerRequest>

type PendingRequest = {
  resolve: (response: WorkerResult) => void
  reject: (error: Error) => void
}

function responseError(response: Extract<RemoteProjectSyncWorkerResponse, { kind: "error" }>) {
  if (response.code === "collision") return new RemoteProjectSyncCollisionError(response.message)
  if (response.code === "local-changes")
    return new RemoteProjectSyncLocalChangesError(response.message)
  if (response.code === "local-race") return new RemoteProjectSyncLocalRaceError(response.message)
  return new Error(response.message)
}

export class RemoteProjectSyncWorkerClient {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly process
  private cancelTimer: ReturnType<typeof setTimeout> | undefined
  private cancelling = false
  private closed = false

  constructor(
    private readonly localPath: string,
    private readonly onStatus: (status: RemoteProjectSyncStatus) => void,
  ) {
    this.process = Bun.spawn({
      cmd: remoteProjectSyncWorkerCommand(),
      env: { ...process.env },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      serialization: "advanced",
      ipc: (message: RemoteProjectSyncWorkerResponse) => this.receive(message),
    })
    void this.process.exited.then((code) => {
      if (this.cancelTimer) clearTimeout(this.cancelTimer)
      this.closed = true
      const error = this.cancelling
        ? new Error("Operação cancelada.")
        : new Error(`O processo de sincronização terminou sem resposta (código ${code}).`)
      for (const request of this.pending.values()) request.reject(error)
      this.pending.clear()
    })
  }

  private receive(message: RemoteProjectSyncWorkerResponse) {
    if (message.kind === "progress") {
      if (message.state === "checking")
        this.onStatus({ kind: "checking", localPath: this.localPath, phase: message.phase })
      else if (message.state === "cancelling")
        this.onStatus({ kind: "cancelling", localPath: this.localPath })
      else
        this.onStatus({
          kind: "syncing",
          localPath: this.localPath,
          progress: message.progress ?? 0,
          phase: message.phase,
        })
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.kind === "error") pending.reject(responseError(message))
    else if (message.kind === "cancelled") pending.reject(new Error("Operação cancelada."))
    else pending.resolve(message)
  }

  private request(request: WorkerRequestWithoutId) {
    if (this.closed) return Promise.reject(new Error("O processo de sincronização foi encerrado."))
    const id = randomUUID()
    return new Promise<WorkerResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      try {
        this.process.send({ ...request, id } as RemoteProjectSyncWorkerRequest)
      } catch (error) {
        this.pending.delete(id)
        reject(
          error instanceof Error ? error : new Error("Não foi possível iniciar a sincronização."),
        )
      }
    })
  }

  async inspect(
    remote: RemoteCodexTarget,
    mapping: RemoteProjectSyncMapping,
  ): Promise<RemoteProjectSyncReview> {
    const response = await this.request({
      kind: "inspect",
      remote,
      destination: this.localPath,
      mapping,
    })
    if (response.kind !== "review") throw new Error("Resposta de sincronização inválida.")
    return response.review
  }

  async synchronize(
    remote: RemoteCodexTarget,
    mapping?: RemoteProjectSyncMapping,
  ): Promise<RemoteProjectSyncMapping> {
    const response = await this.request({
      kind: "synchronize",
      remote,
      destination: this.localPath,
      mapping,
    })
    if (response.kind !== "complete") throw new Error("Resposta de sincronização inválida.")
    return response.mapping
  }

  async apply(): Promise<RemoteProjectSyncMapping> {
    const response = await this.request({ kind: "apply" })
    if (response.kind !== "complete") throw new Error("Resposta de sincronização inválida.")
    return response.mapping
  }

  async page(offset: number): Promise<{ offset: number; changes: RemoteProjectSyncChange[] }> {
    const response = await this.request({ kind: "page", offset })
    if (response.kind !== "page") throw new Error("Resposta de sincronização inválida.")
    return { offset: response.offset, changes: response.changes }
  }

  cancel() {
    if (this.closed) return
    this.cancelling = true
    this.onStatus({ kind: "cancelling", localPath: this.localPath })
    try {
      this.process.send({
        id: randomUUID(),
        kind: "cancel",
      } satisfies RemoteProjectSyncWorkerRequest)
      this.cancelTimer = setTimeout(() => this.process.kill(), 1_000)
    } catch {
      this.process.kill()
    }
  }

  dispose() {
    if (this.closed) return
    if (this.cancelTimer) clearTimeout(this.cancelTimer)
    this.closed = true
    this.process.kill()
  }
}
