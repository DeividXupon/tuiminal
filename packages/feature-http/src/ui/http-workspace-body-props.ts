import type { HttpVariableContext } from "../model/types"
import type { InputRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import type { HttpCollectionSettings } from "../hooks/use-http-collection-settings"
import type { HttpEnvironmentTabs } from "../hooks/use-http-environment-tabs"
import type { HttpRequestTableKey } from "../hooks/use-http-request-tables"
import type { HttpLayout } from "../model/layout"
import type {
  HttpAssertionDefinition,
  HttpRequestDefinition,
  HttpBodyKind,
  HttpAuth,
  HttpKeyValue,
  HttpNavigationView,
  HttpProjectRequestItem,
  HttpMultipartPart,
  HttpPane,
  HttpRequestView,
  HttpRequestMoreView,
  HttpResponseView,
  HttpWorkspaceState,
} from "../model/types"
import type { HttpCookie } from "../services/cookies"
import type { HttpPreparedRequestPreview } from "../services/request-preview"
import type { HttpCollectionTreeRow, HttpCollectionFile } from "../model/collection-tree"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionRunTarget } from "../hooks/use-http-collection-runner"
import type { HttpKey } from "../model/keyboard-types"
import type { HttpSourceMode } from "../model/source-mode"
import type { PostmanCollectionFolder } from "../postman/sync"
import type { PostmanWorkspace } from "../postman/api"
type Scripts = NonNullable<HttpRequestDefinition["scripts"]>
export type HttpWorkspaceBodyProps = {
  oauth?: {
    environmentName: string | null
    variablesForRequest: (request: HttpRequestDefinition) => HttpVariableContext
  }
  active: boolean
  interactionBlocked?: boolean
  state: HttpWorkspaceState
  layout: HttpLayout
  height: number
  registerHeaderInput: (documentId: string, input: InputRenderable | null) => void
  registerBodyEditor: (documentId: string, editor: TextareaRenderable | null) => void
  registerRawScroll: (documentId: string, scroll: ScrollBoxRenderable | null) => void
  registerScroll: (documentId: string, scroll: ScrollBoxRenderable | null) => void
  registerResponseSearch: (documentId: string, input: InputRenderable | null) => void
  registerCollectionSearch: (input: InputRenderable | null) => void
  requestTableKeyRef: {
    current: ((key: HttpRequestTableKey) => boolean) | null
  }
  collectionTreeKeyRef: { current: ((key: HttpKey) => boolean) | null }
  onSelectDocument: (documentId: string) => void
  onNavigationView: (view: HttpNavigationView) => void
  onCloseNavigation: () => void
  onSelectPane: (pane: HttpPane) => void
  onSelectRequestView: (documentId: string, view: HttpRequestView, focusControl?: boolean) => void
  onSelectRequestMoreView: (documentId: string, view: HttpRequestMoreView) => void
  onSelectResponseView: (documentId: string, view: HttpResponseView) => void
  onResponsePresentationChange: (
    documentId: string,
    patch: Partial<HttpWorkspaceState["documents"][number]["responsePresentation"]>,
  ) => void
  onQueryChange: (documentId: string, entries: HttpKeyValue[]) => void
  onPathChange: (documentId: string, entries: HttpKeyValue[]) => void
  onHeadersChange: (documentId: string, headers: HttpKeyValue[]) => void
  onAuthChange: (documentId: string, auth: HttpAuth) => void
  onBodyChange: (documentId: string, value: string) => void
  onBodyFormChange: (documentId: string, entries: HttpKeyValue[]) => void
  onBodyKindChange: (documentId: string, kind: HttpBodyKind) => void
  onBodyMultipartChange: (documentId: string, parts: HttpMultipartPart[]) => void
  onBodyFilesChange: (documentId: string, paths: string[]) => void
  onCancel: (documentId: string) => void
  onSend: (documentId: string) => void
  projectRequests: HttpProjectRequestItem[]
  projectDirectories: string[]
  projectFiles: HttpCollectionFile[]
  postmanFolders: PostmanCollectionFolder[]
  postmanWorkspace: PostmanWorkspace | null
  onPostmanWorkspaceChange: (workspace: PostmanWorkspace) => void
  projectErrors: number
  sourceMode: HttpSourceMode
  onOpenProjectRequest: (item: HttpProjectRequestItem) => void
  onImportCollection: () => void
  onOpenPostman: (action?: "create-workspace") => void
  onRunCollection: (collection: HttpCollectionRunTarget) => void
  onManageCollection: (
    action: HttpCollectionAction,
    row: HttpCollectionTreeRow | null,
    name?: string,
  ) => Promise<boolean | string>
  onNameChange: (documentId: string, name: string) => void
  onScriptsChange: (documentId: string, value: Scripts) => void
  onDocsChange: (documentId: string, value: string) => void
  onMethodChange: (documentId: string, method: string) => void
  onOptionsChange: (documentId: string, options: HttpRequestDefinition["options"]) => void
  onAssertionsChange: (documentId: string, assertions: HttpAssertionDefinition[]) => void
  onChainChange: (documentId: string, chain: NonNullable<HttpRequestDefinition["chain"]>) => void
  onImportCurl: () => void
  onExportCurl: () => void
  onDuplicate: (documentId: string) => void
  onMove: () => void
  onDelete: () => void
  cookies: HttpCookie[]
  onCopyResponse: (documentId: string, content: string, label: string) => void
  onSaveResponse: (documentId: string) => void
  onOpenResponse: (documentId: string) => void
  onDownloadResponse: (documentId: string) => void
  onCancelDownload: () => void
  downloadingDocumentId: string | null
  collectionSettings: HttpCollectionSettings
  environments: HttpEnvironmentTabs
  preparedPreview: HttpPreparedRequestPreview | null
  onSplitRatioChange: (ratio: number) => void
}
