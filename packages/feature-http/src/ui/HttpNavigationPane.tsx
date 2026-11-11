import type { HttpCollectionSettingsTarget } from "../model/collection-settings"
import { HttpBoxSelection } from "./HttpBoxSelection"
import type { InputRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { ButtonRenderable } from "@tuiparts/core/button"
import { Button } from "@tuiparts/react/button"
import { useRenderer } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { COLORS, focusedPanelBorder } from "@xupon/tuiminal-core/settings/theme"
import { displayWidth, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import { InlineButton } from "@xupon/tuiminal-core/ui/InlineButton"
import type { HttpNavigationView, HttpProjectRequestItem, HttpWorkspaceState } from "../model/types"
import { HttpCollectionTree } from "./HttpCollectionTree"
import type { HttpCollectionTreeRow, HttpCollectionFile } from "../model/collection-tree"
import type { HttpCollectionAction } from "../hooks/use-http-collection-management"
import type { HttpCollectionRunTarget } from "../hooks/use-http-collection-runner"
import type { HttpKey } from "../model/keyboard-types"
import { HttpEnvironmentNavigation } from "./HttpEnvironmentNavigation"
import type { HttpEnvironmentTabs } from "../hooks/use-http-environment-tabs"
import type { HttpSourceMode } from "../model/source-mode"
import type { PostmanCollectionFolder } from "../postman/sync"
import type { PostmanWorkspace } from "../postman/api"
import { httpMethodColor } from "./http-method-colors"

export function HttpNavigationPane({
  state,
  visible,
  focused,
  overlay,
  position,
  onViewChange,
  onSelectDocument,
  onClose,
  onFocus,
  projectRequests,
  projectDirectories,
  projectFiles,
  postmanFolders,
  postmanWorkspace,
  onPostmanWorkspaceChange,
  projectErrors,
  sourceMode,
  onOpenProjectRequest,
  onImportCollection,
  onOpenPostman,
  onRunCollection,
  onManageCollection,
  onCollectionSettings,
  registerCollectionSearch,
  collectionTreeKeyRef,
  environments,
}: {
  state: HttpWorkspaceState
  visible: boolean
  focused: boolean
  overlay: boolean
  position: { left: number; top: number; width: number; height: number }
  onViewChange: (view: HttpNavigationView) => void
  onSelectDocument: (documentId: string) => void
  onClose: () => void
  onFocus: () => void
  projectRequests: HttpProjectRequestItem[]
  projectDirectories: string[]
  projectFiles: HttpCollectionFile[]
  postmanFolders: PostmanCollectionFolder[]
  postmanWorkspace: PostmanWorkspace | null
  onPostmanWorkspaceChange: (workspace: PostmanWorkspace) => void
  projectErrors: number
  sourceMode: HttpSourceMode
  onOpenProjectRequest: (request: HttpProjectRequestItem) => void
  onImportCollection: () => void
  onOpenPostman: (action?: "create-workspace") => void
  onRunCollection: (collection: HttpCollectionRunTarget) => void
  onCollectionSettings: (target: HttpCollectionSettingsTarget) => void
  onManageCollection: (
    action: HttpCollectionAction,
    row: HttpCollectionTreeRow | null,
    name?: string,
  ) => Promise<boolean | string>
  registerCollectionSearch: (input: InputRenderable | null) => void
  collectionTreeKeyRef: { current: ((key: HttpKey) => boolean) | null }
  environments: HttpEnvironmentTabs
}) {
  const contentWidth = Math.max(8, position.width - 4)
  const compactTabs = contentWidth < 28
  const collectionRef = useRef<ButtonRenderable | null>(null)
  const environmentsRef = useRef<ButtonRenderable | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [collectionSelection, setCollectionSelection] = useState<string | null>(
    `workspace:${sourceMode}`,
  )
  const renderer = useRenderer()
  useEffect(() => {
    if (!visible || !focused || state.overlay || state.navigationView === "environments") return
    const timer = setTimeout(() => {
      if (renderer.root.findDescendantById("http-collection-menu")) return
      collectionRef.current?.focus()
    })
    return () => clearTimeout(timer)
  }, [focused, state.navigationView, state.overlay, visible, renderer])
  return (
    <box
      id="http-navigation-pane"
      visible={visible}
      style={{
        position: "absolute",
        ...position,
        zIndex: overlay ? 50 : 1,
        ...focusedPanelBorder(focused, COLORS.http),
        backgroundColor: COLORS.panel,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: "hidden",
      }}
    >
      <HttpBoxSelection id="http-navigation-pane" />
      <box
        style={{
          height: 1,
          flexShrink: 0,
          flexDirection: "row",
          backgroundColor: COLORS.panelRaised,
        }}
      >
        <InlineButton
          id="http-navigation-collection"
          buttonRef={collectionRef}
          label={compactTabs ? "[C]" : "[C] Coleção"}
          accent={COLORS.http}
          active={state.navigationView === "collection"}
          onPress={() => {
            onFocus()
            onViewChange("collection")
          }}
        />
        <InlineButton
          id="http-navigation-environments"
          buttonRef={environmentsRef}
          label={compactTabs ? "[E]" : "[E] Ambientes"}
          accent={COLORS.http}
          active={state.navigationView === "environments"}
          onPress={() => {
            onFocus()
            onViewChange("environments")
          }}
        />
      </box>
      <scrollbox
        id="http-collection-scroll"
        ref={scrollRef}
        scrollY
        viewportCulling={false}
        style={{ flexGrow: 1, paddingTop: 1 }}
      >
        {state.navigationView === "collection" ? (
          <>
            <HttpCollectionTree
              state={state}
              active={visible && focused && !state.overlay}
              sourceMode={sourceMode}
              postmanWorkspace={postmanWorkspace}
              onPostmanWorkspaceChange={onPostmanWorkspaceChange}
              contentWidth={contentWidth}
              projectRequests={projectRequests}
              projectDirectories={projectDirectories}
              projectFiles={projectFiles}
              postmanFolders={postmanFolders}
              projectErrors={projectErrors}
              selection={collectionSelection}
              setSelection={setCollectionSelection}
              registerSearchInput={registerCollectionSearch}
              keyRef={collectionTreeKeyRef}
              scrollRef={scrollRef}
              onFocus={onFocus}
              onOpen={onOpenProjectRequest}
              onImport={onImportCollection}
              onPostman={onOpenPostman}
              onRun={onRunCollection}
              onManage={onManageCollection}
              onSettings={onCollectionSettings}
            />
            {state.documents.some((document) => document.request.source.kind === "scratch") ? (
              <text content={translateUi("SCRATCH")} style={{ fg: COLORS.muted }} />
            ) : null}
            {state.documents
              .filter((document) => document.request.source.kind === "scratch")
              .map((document) => (
                <Button
                  key={document.request.id}
                  id={`http-navigation-document-${document.request.id}`}
                  height={1}
                  flexShrink={0}
                  onPress={() => {
                    onFocus()
                    onSelectDocument(document.request.id)
                  }}
                >
                  <box
                    style={{
                      height: 1,
                      flexDirection: "row",
                      backgroundColor:
                        document.request.id === state.activeDocumentId
                          ? COLORS.diffModifiedBg
                          : COLORS.panel,
                    }}
                  >
                    <text content=" " style={{ fg: COLORS.text }} />
                    <text
                      content={document.request.method}
                      style={{ fg: httpMethodColor(document.request.method) }}
                    />
                    <text
                      content={` ${truncateDisplay(document.request.name, Math.max(1, contentWidth - displayWidth(document.request.method) - 3))} `}
                      style={{ fg: COLORS.text }}
                    />
                  </box>
                </Button>
              ))}
          </>
        ) : (
          <HttpEnvironmentNavigation
            environments={environments}
            width={contentWidth}
            active={visible && focused && !state.overlay}
          />
        )}
      </scrollbox>
      {overlay ? (
        <InlineButton label="[Esc] Fechar" accent={COLORS.http} onPress={onClose} />
      ) : null}
    </box>
  )
}
