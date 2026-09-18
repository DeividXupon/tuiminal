// Shared instances used by the private official-feature payload format.
import { registerFeatureHost } from "@xupon/tuiminal-core/runtime/feature-host"
import * as shared0 from "react"
import * as shared1 from "react/jsx-runtime"
import * as shared2 from "react/jsx-dev-runtime"
import * as shared3 from "@opentui/core"
import * as shared4 from "@opentui/react"
import * as shared5 from "@tuiparts/core/button"
import * as shared6 from "@tuiparts/react/button"
import * as shared7 from "@xupon/tuiminal-core/data/defined-properties"
import * as shared8 from "@xupon/tuiminal-core/i18n/index"
import * as shared9 from "@xupon/tuiminal-core/i18n/localized-jsx/jsx-dev-runtime"
import * as shared10 from "@xupon/tuiminal-core/i18n/localized-jsx/jsx-runtime"
import * as shared11 from "@xupon/tuiminal-core/keyboard/scope"
import * as shared12 from "@xupon/tuiminal-core/lifecycle/shutdown"
import * as shared13 from "@xupon/tuiminal-core/notifications/index"
import * as shared14 from "@xupon/tuiminal-core/process/owned-process"
import * as shared15 from "@xupon/tuiminal-core/security/sensitive-data"
import * as shared16 from "@xupon/tuiminal-core/settings/theme"
import * as shared17 from "@xupon/tuiminal-core/storage/atomic-file"
import * as shared18 from "@xupon/tuiminal-core/storage/project-files"
import * as shared19 from "@xupon/tuiminal-core/ui/DirectionalButton"
import * as shared20 from "@xupon/tuiminal-core/ui/InlineButton"
import * as shared21 from "@xupon/tuiminal-core/ui/MountWhen"
import * as shared22 from "@xupon/tuiminal-core/ui/PasswordInput"
import * as shared23 from "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay"
import * as shared24 from "@xupon/tuiminal-core/ui/ShortcutText"
import * as shared25 from "@xupon/tuiminal-core/ui/brand"
import * as shared26 from "@xupon/tuiminal-core/ui/directional-shortcut"
import * as shared27 from "@xupon/tuiminal-core/ui/selectMouse"
import * as shared28 from "@xupon/tuiminal-core/ui/syntax-style"
import * as shared29 from "@xupon/tuiminal-core/runtime/feature-host"
import * as shared30 from "@xupon/tuiminal-core/ui/ModalSurface"

export function prepareFeatureHost(version: string, sqliteWorkerCommand: () => string[]) {
  registerFeatureHost({
    version,
    sqliteWorkerCommand,
    modules: {
      react: shared0,
      "react/jsx-runtime": shared1,
      "react/jsx-dev-runtime": shared2,
      "@opentui/core": shared3,
      "@opentui/react": shared4,
      "@tuiparts/core/button": shared5,
      "@tuiparts/react/button": shared6,
      "@xupon/tuiminal-core/data/defined-properties": shared7,
      "@xupon/tuiminal-core/i18n/index": shared8,
      "@xupon/tuiminal-core/i18n/localized-jsx/jsx-dev-runtime": shared9,
      "@xupon/tuiminal-core/i18n/localized-jsx/jsx-runtime": shared10,
      "@xupon/tuiminal-core/keyboard/scope": shared11,
      "@xupon/tuiminal-core/lifecycle/shutdown": shared12,
      "@xupon/tuiminal-core/notifications/index": shared13,
      "@xupon/tuiminal-core/process/owned-process": shared14,
      "@xupon/tuiminal-core/security/sensitive-data": shared15,
      "@xupon/tuiminal-core/settings/theme": shared16,
      "@xupon/tuiminal-core/storage/atomic-file": shared17,
      "@xupon/tuiminal-core/storage/project-files": shared18,
      "@xupon/tuiminal-core/ui/DirectionalButton": shared19,
      "@xupon/tuiminal-core/ui/InlineButton": shared20,
      "@xupon/tuiminal-core/ui/MountWhen": shared21,
      "@xupon/tuiminal-core/ui/PasswordInput": shared22,
      "@xupon/tuiminal-core/ui/PlasmaLoadingOverlay": shared23,
      "@xupon/tuiminal-core/ui/ShortcutText": shared24,
      "@xupon/tuiminal-core/ui/brand": shared25,
      "@xupon/tuiminal-core/ui/directional-shortcut": shared26,
      "@xupon/tuiminal-core/ui/selectMouse": shared27,
      "@xupon/tuiminal-core/ui/syntax-style": shared28,
      "@xupon/tuiminal-core/runtime/feature-host": shared29,
      "@xupon/tuiminal-core/ui/ModalSurface": shared30,
    },
  })
}
