import type {
  HttpDocumentState,
  HttpHistoryEntry,
  HttpJumpTarget,
  HttpPane,
  HttpWorkspaceOverlay as HttpWorkspaceOverlayKind,
} from "../model/types"
import type {
  HttpCollectionImportFormat,
  HttpCollectionImportPreview,
} from "../services/collection-import"
import type {
  HttpExternalConflictPreview,
  HttpExternalConflictResolution,
} from "../storage/conflicts"
import type {
  CreatePrivateHttpEnvironmentInput,
  CreatePrivateHttpEnvironmentResult,
  HttpEnvironment,
} from "../storage/environments"
import type { HttpWorkspaceConfig } from "../storage/config"
import { HttpCollectionImportModal } from "./HttpCollectionImportModal"
import { HttpCollectionRunnerModal } from "./HttpCollectionRunnerModal"
import { HttpDiscardDocumentModal } from "./HttpDiscardDocumentModal"
import { HttpCurlModal } from "./HttpCurlModal"
import { HttpExternalConflictModal } from "./HttpExternalConflictModal"
import { HttpEnvironmentManagerModal } from "./HttpEnvironmentManagerModal"
import { HttpHistoryDiffModal } from "./HttpHistoryDiffModal"
import { HttpRequestFileModal } from "./HttpRequestFileModal"
import { HttpWorkspaceOverlay } from "./HttpWorkspaceOverlay"
import { HttpWorkspaceSettingsModal } from "./HttpWorkspaceSettingsModal"
import type { HttpInsecureTlsApproval } from "../model/tls-policy"

export function HttpWorkspaceOverlays({
  overlay,
  document,
  activePane,
  terminalWidth,
  terminalHeight,
  historyDiff,
  curl,
  curlCommand,
  onCurlCommandChange,
  onApplyCurl,
  onCopyCurl,
  onJump,
  onClose,
  moveTarget,
  onMoveTargetChange,
  onApplyRequestFileAction,
  collectionImport,
  collectionRunner,
  environment,
  onOpenWorkspaceSettings,
  externalConflict,
  pendingCloseName,
  onConfirmCloseDocument,
  onCancelCloseDocument,
}: {
  overlay: HttpWorkspaceOverlayKind
  document: HttpDocumentState
  activePane: HttpPane
  terminalWidth: number
  terminalHeight: number
  historyDiff: [HttpHistoryEntry, HttpHistoryEntry] | null
  curl: string
  curlCommand: string
  onCurlCommandChange: (value: string) => void
  onApplyCurl: () => void
  onCopyCurl: () => void
  onJump: (target: HttpJumpTarget) => void
  onClose: () => void
  moveTarget: string
  onMoveTargetChange: (path: string) => void
  onApplyRequestFileAction: () => void
  collectionImport: {
    format: HttpCollectionImportFormat
    sourcePath: string
    outputDirectory: string
    preview: HttpCollectionImportPreview | null
    busy: boolean
    error: string
    setFormat: (format: HttpCollectionImportFormat) => void
    setSourcePath: (path: string) => void
    setOutputDirectory: (path: string) => void
    apply: () => Promise<void>
    back: () => void
  }
  collectionRunner: {
    targetName: string | null
    datasetPath: string
    setDatasetPath: (path: string) => void
    concurrency: number
    status: "idle" | "running" | "complete" | "cancelled"
    cases: import("../services/collection-runner").HttpRunCase[]
    error: string
    pendingTlsApproval: HttpInsecureTlsApproval | null
    cycleTarget: () => void
    cycleConcurrency: () => void
    approvePendingTls: () => void
    cancel: () => void
    run: () => Promise<void>
  }
  environment: {
    environments: HttpEnvironment[]
    activeEnvironmentName: string | null
    privateEnvironmentPath: string
    selectEnvironment: (name: string | null) => void
    createPrivateEnvironment: (
      input: CreatePrivateHttpEnvironmentInput,
    ) => Promise<CreatePrivateHttpEnvironmentResult>
    workspaceConfig: HttpWorkspaceConfig
    workspaceConfigSourceHash: string | null
    workspaceConfigError: string
    saveWorkspaceConfig: (
      config: HttpWorkspaceConfig,
      expectedHash: string | null,
    ) => Promise<unknown>
  }
  onOpenWorkspaceSettings: () => void
  externalConflict: {
    externalConflict: HttpExternalConflictPreview | null
    resolvingExternalConflict: boolean
    resolveExternalConflict: (resolution: HttpExternalConflictResolution) => void
    cancelExternalConflict: () => void
  }
  pendingCloseName: string
  onConfirmCloseDocument: () => void
  onCancelCloseDocument: () => void
}) {
  return (
    <>
      {overlay === "jump" || overlay === "help" ? (
        <HttpWorkspaceOverlay
          overlay={overlay}
          document={document}
          activePane={activePane}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onJump={onJump}
          onClose={onClose}
        />
      ) : null}
      {overlay === "curl-import" || overlay === "curl-export" ? (
        <HttpCurlModal
          mode={overlay}
          curl={curl}
          command={curlCommand}
          onCommandChange={onCurlCommandChange}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onApplyImport={onApplyCurl}
          onCopy={onCopyCurl}
          onClose={onClose}
        />
      ) : null}
      {overlay === "history-diff" && historyDiff ? (
        <HttpHistoryDiffModal
          entries={historyDiff}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onClose={onClose}
        />
      ) : null}
      {overlay === "request-move" || overlay === "request-delete" ? (
        <HttpRequestFileModal
          mode={overlay}
          requestName={document.request.name}
          currentPath={document.request.source.kind === "file" ? document.request.source.path : ""}
          targetPath={moveTarget}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onTargetPathChange={onMoveTargetChange}
          onApply={onApplyRequestFileAction}
          onClose={onClose}
        />
      ) : null}
      {overlay === "collection-import" ? (
        <HttpCollectionImportModal
          {...collectionImport}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onFormatChange={collectionImport.setFormat}
          onSourcePathChange={collectionImport.setSourcePath}
          onOutputDirectoryChange={collectionImport.setOutputDirectory}
          onApply={() => void collectionImport.apply()}
          onBack={collectionImport.back}
          onClose={onClose}
        />
      ) : null}
      {overlay === "collection-runner" ? (
        <HttpCollectionRunnerModal
          {...collectionRunner}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onDatasetPathChange={collectionRunner.setDatasetPath}
          onCycleTarget={collectionRunner.cycleTarget}
          onCycleConcurrency={collectionRunner.cycleConcurrency}
          onApproveInsecureTls={collectionRunner.approvePendingTls}
          onRun={() => void collectionRunner.run()}
          onClose={() => {
            collectionRunner.cancel()
            onClose()
          }}
        />
      ) : null}
      {overlay === "external-conflict" && externalConflict.externalConflict ? (
        <HttpExternalConflictModal
          conflict={externalConflict.externalConflict}
          busy={externalConflict.resolvingExternalConflict}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onResolve={externalConflict.resolveExternalConflict}
          onClose={() => {
            externalConflict.cancelExternalConflict()
            onClose()
          }}
        />
      ) : null}
      {overlay === "environment-manager" ? (
        <HttpEnvironmentManagerModal
          environments={environment.environments}
          activeName={environment.activeEnvironmentName}
          privateEnvironmentPath={environment.privateEnvironmentPath}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onSelect={environment.selectEnvironment}
          onCreate={environment.createPrivateEnvironment}
          onOpenWorkspaceSettings={onOpenWorkspaceSettings}
          onClose={onClose}
        />
      ) : null}
      {overlay === "workspace-settings" ? (
        <HttpWorkspaceSettingsModal
          config={environment.workspaceConfig}
          sourceHash={environment.workspaceConfigSourceHash}
          sourceError={environment.workspaceConfigError}
          environments={environment.environments}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onSave={environment.saveWorkspaceConfig}
          onClose={onClose}
        />
      ) : null}
      {overlay === "discard-document" ? (
        <HttpDiscardDocumentModal
          requestName={pendingCloseName}
          terminalWidth={terminalWidth}
          terminalHeight={terminalHeight}
          onConfirm={onConfirmCloseDocument}
          onClose={onCancelCloseDocument}
        />
      ) : null}
    </>
  )
}
