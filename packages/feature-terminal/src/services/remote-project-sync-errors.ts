export class RemoteProjectSyncError extends Error {}
export class RemoteProjectSyncCollisionError extends RemoteProjectSyncError {}
export class RemoteProjectSyncLocalChangesError extends RemoteProjectSyncError {}
export class RemoteProjectSyncLocalRaceError extends RemoteProjectSyncError {}
