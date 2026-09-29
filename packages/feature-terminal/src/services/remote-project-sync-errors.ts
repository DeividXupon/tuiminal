export class RemoteProjectSyncError extends Error {}
export class RemoteProjectSyncCollisionError extends RemoteProjectSyncError {}
export class RemoteProjectSyncLocalChangesError extends RemoteProjectSyncError {}
export class RemoteProjectSyncLocalRaceError extends RemoteProjectSyncError {}

export function remoteProjectSyncProcessError(stderr: string, fallback: string) {
  const message = stderr.trim()
  const normalized = message.toLowerCase()
  if (
    normalized.includes("kex_exchange_identification") ||
    normalized.includes("ssh_exchange_identification") ||
    normalized.includes("connection reset by peer") ||
    normalized.includes("connection closed by remote host")
  )
    return new RemoteProjectSyncError(
      "A conexão SSH foi encerrada; verifique o perfil remoto e tente novamente.",
    )
  return new RemoteProjectSyncError(message || fallback)
}
