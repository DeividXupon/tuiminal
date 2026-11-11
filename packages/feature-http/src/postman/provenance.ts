import type { Snapshot } from "./snapshot"

export type PostmanEntry = {
  key: string
  requestId: string
  remoteHash: string
  baseline: Snapshot
}
export type PostmanFolder = { id: string; path: string; remoteHash: string }
export type PostmanCollectionFolder = PostmanFolder & { filePath: string }
export type PostmanProvenance = {
  version: 1
  collectionId: string
  collectionName?: string
  requestMappingVersion?: number
  workspaceId?: string
  collectionHash?: string
  entries: PostmanEntry[]
  folders?: PostmanFolder[]
}
