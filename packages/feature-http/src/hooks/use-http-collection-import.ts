import { useCallback, useState } from "react"
import {
  applyHttpCollectionImport,
  previewHttpCollectionImport,
  type HttpCollectionImportPreview,
} from "../services/collection-import"

type ImportState = {
  sourcePath: string
  preview: HttpCollectionImportPreview | null
  busy: boolean
  error: string
}

const INITIAL_STATE: ImportState = {
  sourcePath: "",
  preview: null,
  busy: false,
  error: "",
}

export function useHttpCollectionImport({
  root,
  refreshProject,
  closeOverlay,
  setNotice,
}: {
  root: string
  refreshProject: () => Promise<void>
  closeOverlay: () => void
  setNotice: (notice: string) => void
}) {
  const [state, setState] = useState<ImportState>(INITIAL_STATE)

  const open = useCallback(() => setState(INITIAL_STATE), [])
  const setSourcePath = useCallback((sourcePath: string) => {
    setState((current) => ({ ...current, sourcePath, preview: null, error: "" }))
  }, [])
  const back = useCallback(() => {
    setState((current) => ({ ...current, preview: null, error: "" }))
  }, [])

  const apply = useCallback(async () => {
    if (state.busy) return
    setState((current) => ({ ...current, busy: true, error: "" }))
    try {
      if (!state.preview) {
        const preview = await previewHttpCollectionImport(root, state.sourcePath)
        setState((current) => ({ ...current, preview, busy: false }))
        return
      }
      const result = await applyHttpCollectionImport(root, state.preview)
      await refreshProject()
      setNotice(`COLEÇÃO IMPORTADA · ${result.outputPath}`)
      setState(INITIAL_STATE)
      closeOverlay()
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [closeOverlay, refreshProject, root, setNotice, state])

  return {
    ...state,
    open,
    setSourcePath,
    back,
    apply,
  }
}
