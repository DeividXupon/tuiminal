import {
  useNotifications,
  useNotificationFromValue,
} from "@xupon/tuiminal-core/notifications/index"
import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type ComponentType,
} from "react"
import { FeatureController } from "./controller"
import { FeatureInstaller } from "./FeatureInstaller"
import { preferredInstalledFeature, type FeatureId } from "./model"
import { resolveToolLaunch } from "../tool-catalog"
import { COLORS } from "@xupon/tuiminal-core/settings/theme"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"

function useWorkspaceState(createController: () => FeatureController) {
  const [controller] = useState(createController)
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot)
  const [requested] = useState(() => {
    const launch = resolveToolLaunch(
      process.env.TUIMINAL_INITIAL_TAB,
      process.env.TUIMINAL_ONLY_TAB,
    )
    return launch.onlyTab ?? launch.initialTab
  })
  const { notify } = useNotifications()
  const previous = useRef<number | null>(null)
  const installerModal = useRef(false)
  useNotificationFromValue(state.error, { source: "Ferramentas oficiais", kind: "error" })
  useEffect(() => {
    if (!state.ready) return
    if (previous.current !== null && state.installed.length > previous.current)
      notify({
        source: "Ferramentas oficiais",
        kind: "success",
        message: "Ferramenta instalada. Pressione [Enter] para abrir.",
      })
    if (previous.current !== null && state.installed.length < previous.current && !state.error)
      notify({
        source: "Ferramentas oficiais",
        kind: "success",
        message: "Ferramenta desinstalada.",
      })
    previous.current = state.installed.length
  }, [state.ready, state.installed.length, state.error, notify])
  const [installer, setInstaller] = useState<FeatureId | true | false>(
    process.env.TUIMINAL_OPEN_FEATURES === "1",
  )
  useEffect(() => {
    let active = true
    const isolated = resolveToolLaunch(undefined, process.env.TUIMINAL_ONLY_TAB).onlyTab !== null
    void controller.initialize(requested, isolated).then(() => {
      if (!active) return
      const installed = controller.snapshot().installed
      if (!installed.length || (isolated && !installed.includes(requested))) setInstaller(requested)
    })
    return () => {
      active = false
      controller.dispose()
    }
  }, [controller, requested])
  const initial = preferredInstalledFeature(state.installed, requested)
  const showInstaller = installer !== false || initial === null
  return {
    controller,
    state,
    initial,
    requested,
    installer,
    showInstaller,
    setInstaller,
    installerModal,
  }
}
type Workspace = ReturnType<typeof useWorkspaceState>
const Context = createContext<Workspace | null>(null)
export function useFeatureWorkspace() {
  const workspace = useContext(Context)
  if (!workspace) throw new Error("Feature workspace is missing")
  return workspace
}
export function withFeatures(
  Component: ComponentType,
  createController = () => new FeatureController(),
) {
  return function FeatureWorkspace() {
    const workspace = useWorkspaceState(createController)
    return (
      <Context.Provider value={workspace}>
        {workspace.state.ready ? (
          createElement(Component)
        ) : (
          <box
            style={{
              flexGrow: 1,
              backgroundColor: COLORS.canvas,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <text
              content={translateUi("Carregando ferramentas oficiais…")}
              style={{ fg: COLORS.muted }}
            />
          </box>
        )}
      </Context.Provider>
    )
  }
}
export function WorkspaceInstaller({
  onlyTool,
  onOpen,
  onUninstall,
  blocked,
  onClose,
  onSettings,
}: {
  onlyTool: FeatureId | null
  onOpen: (id: FeatureId) => void
  onUninstall: (id: FeatureId) => void
  blocked: boolean
  onClose: () => void
  onSettings: () => void
}) {
  const { controller, state, installer, requested, installerModal } = useFeatureWorkspace()
  return (
    <FeatureInstaller
      onlyTool={onlyTool}
      state={state}
      selected={
        typeof installer === "string" ? installer : state.installed.length ? null : requested
      }
      blocked={blocked}
      modalOpenRef={installerModal}
      onInstall={(ids) => void controller.install(ids)}
      onUninstall={onUninstall}
      onCancel={() => controller.cancel()}
      onOpen={onOpen}
      onClose={onClose}
      onSettings={onSettings}
    />
  )
}
