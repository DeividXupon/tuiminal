import type {
  BoxRenderable,
  InputRenderable,
  ScrollBoxRenderable,
  SelectRenderable,
  TextareaRenderable,
} from "@opentui/core"
import { createRef } from "react"

/** Each demo mount owns its native refs; none point into the retained live workspace. */
export function tutorialRefs() {
  return {
    commandPanelRef: createRef<BoxRenderable>(),
    commandListRef: createRef<SelectRenderable>(),
    processListRef: createRef<SelectRenderable>(),
    manualInputRef: createRef<InputRenderable>(),
    logFilterRef: createRef<InputRenderable>(),
    logScrollRef: createRef<ScrollBoxRenderable>(),
    processInputRef: createRef<InputRenderable>(),
    historyPanelRef: createRef<BoxRenderable>(),
    historyListRef: createRef<SelectRenderable>(),
    projectSearchRef: createRef<InputRenderable>(),
    projectListRef: createRef<SelectRenderable>(),
    directoryListRef: createRef<SelectRenderable>(),
    dialogRef: createRef<BoxRenderable>(),
    nameRef: createRef<InputRenderable>(),
    scrollRef: createRef<ScrollBoxRenderable>(),
    input: createRef<TextareaRenderable>(),
    list: createRef<SelectRenderable>(),
  }
}
