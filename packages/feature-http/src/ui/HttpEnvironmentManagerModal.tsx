import { useKeyboard, useRenderer } from "@opentui/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  HttpEnvironmentCreateForm,
  HttpEnvironmentList,
  environmentFormRows,
  type HttpEnvironmentFormMode,
  type HttpEnvironmentRow,
} from "./HttpEnvironmentManagerContent"
import {
  environmentFocusId,
  environmentKeyIsHandled,
  consumeEnvironmentKey,
  type EnvironmentManagerProps,
  type EnvironmentKeyEvent,
  type EnvironmentScreen,
} from "./http-environment-manager-keyboard"
import {
  HttpEnvironmentDeleteConfirm,
  HttpEnvironmentManagerShell,
} from "./HttpEnvironmentManagerShell"

export function HttpEnvironmentManagerModal({
  environments,
  globals,
  activeName,
  terminalWidth,
  terminalHeight,
  onSelect,
  onCreate,
  onReplace,
  onDelete,
  onSaveGlobals,
  onClose,
}: EnvironmentManagerProps) {
  const renderer = useRenderer()
  const [screen, setScreen] = useState<EnvironmentScreen>("list")
  const [originalName, setOriginalName] = useState<string | null>(null)
  const [selection, setSelection] = useState(() =>
    Math.max(0, environments.findIndex((environment) => environment.name === activeName) + 1),
  )
  const [name, setName] = useState("")
  const [rows, setRows] = useState<HttpEnvironmentRow[]>(() => [
    { id: crypto.randomUUID(), name: "", value: "" },
  ])
  const [mode, setMode] = useState<HttpEnvironmentFormMode>("overview")
  const [target, setTarget] = useState<"name" | "table">("name")
  const [rowIndex, setRowIndex] = useState(0)
  const [column, setColumn] = useState<0 | 1>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const width = Math.max(46, Math.min(86, terminalWidth - 4))
  const height = Math.max(14, Math.min(28, terminalHeight - 2))
  const choices = useMemo<Array<string | null>>(
    () => [null, ...environments.map((environment) => environment.name)],
    [environments],
  )

  useEffect(() => {
    const id = environmentFocusId(screen, mode, choices[selection], rowIndex, column)
    const timer = setTimeout(() => renderer.root.findDescendantById(id)?.focus(), 0)
    return () => clearTimeout(timer)
  }, [choices, column, mode, renderer, rowIndex, screen, selection])

  const beginCreate = useCallback(() => {
    setOriginalName(null)
    setName("")
    setRows([{ id: crypto.randomUUID(), name: "", value: "" }])
    setMode("overview")
    setTarget("name")
    setRowIndex(0)
    setColumn(0)
    setError("")
    setScreen("create")
  }, [])

  const beginEdit = useCallback(
    (environmentName: string) => {
      const environment = environments.find((item) => item.name === environmentName)
      if (!environment) return
      setOriginalName(environmentName)
      setName(environmentName)
      setRows(environmentFormRows(environment))
      setMode("overview")
      setTarget("name")
      setRowIndex(0)
      setColumn(0)
      setError("")
      setScreen("edit")
    },
    [environments],
  )

  const beginGlobals = useCallback(() => {
    setOriginalName(null)
    setName("Globals")
    setRows(environmentFormRows(globals))
    setMode("overview")
    setTarget("table")
    setRowIndex(0)
    setColumn(0)
    setError("")
    setScreen("globals")
  }, [globals])

  const beginDelete = useCallback((environmentName: string) => {
    setOriginalName(environmentName)
    setError("")
    setScreen("delete")
  }, [])

  const updateRow = useCallback((index: number, cell: 0 | 1, value: string) => {
    setRows((current) => {
      const next = current.map((row, rowNumber) =>
        rowNumber === index ? { ...row, [cell === 0 ? "name" : "value"]: value } : row,
      )
      if (index === next.length - 1 && value && next.length <= 100) {
        next.push({ id: crypto.randomUUID(), name: "", value: "" })
      }
      return next
    })
  }, [])

  const save = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      const input = {
        environmentName: name,
        variables: rows
          .filter((row) => row.name || row.value)
          .map(({ name: variableName, value }) => ({ name: variableName, value })),
      }
      if (screen === "globals") await onSaveGlobals(input)
      else if (screen === "edit" && originalName) await onReplace(originalName, input)
      else await onCreate(input)
      if (screen === "create") onClose()
      else setScreen("list")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [busy, name, onClose, onCreate, onReplace, onSaveGlobals, originalName, rows, screen])

  const confirmDelete = useCallback(async () => {
    if (busy || !originalName) return
    setBusy(true)
    setError("")
    try {
      await onDelete(originalName)
      setSelection(0)
      setScreen("list")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }, [busy, onDelete, originalName])

  const select = useCallback(
    (selected: string | null) => {
      onSelect(selected)
      onClose()
    },
    [onClose, onSelect],
  )

  const enterTarget = useCallback(
    (selected: "name" | "table") => {
      setTarget(selected)
      if (selected === "name") {
        if (screen !== "globals") setMode("name")
      } else {
        setMode(rows.every((row) => !row.name && !row.value) ? "cell" : "table")
        setRowIndex(0)
        setColumn(0)
      }
    },
    [rows, screen],
  )

  const nextCell = useCallback(
    (backwards: boolean) => {
      if (backwards && rowIndex === 0 && column === 0) {
        if (screen !== "globals") setMode("name")
        return
      }
      const nextColumn = column === 0 ? 1 : 0
      const nextIndex = rowIndex + (backwards ? (column === 0 ? -1 : 0) : column === 1 ? 1 : 0)
      if (!backwards && nextIndex >= rows.length && rows.length <= 100) {
        setRows((current) => [...current, { id: crypto.randomUUID(), name: "", value: "" }])
      }
      setRowIndex(Math.max(0, Math.min(nextIndex, 100)))
      setColumn(nextColumn)
    },
    [column, rowIndex, rows.length, screen],
  )

  const handleListKey = useCallback(
    (event: EnvironmentKeyEvent) => {
      switch (event.name) {
        case "escape":
          return onClose()
        case "n":
          return beginCreate()
        case "g":
          return beginGlobals()
        case "e":
          return choices[selection] ? beginEdit(choices[selection]) : undefined
        case "d":
          return choices[selection] ? beginDelete(choices[selection]) : undefined
        case "up":
        case "k":
          return setSelection((current) => (current - 1 + choices.length) % choices.length)
        case "down":
        case "j":
          return setSelection((current) => (current + 1) % choices.length)
        case "enter":
        case "return":
          return select(choices[selection] ?? null)
      }
    },
    [beginCreate, beginDelete, beginEdit, beginGlobals, choices, onClose, select, selection],
  )

  const leaveCreateMode = useCallback(() => {
    if (mode === "cell") setMode("table")
    else if (mode === "overview") setScreen("list")
    else setMode("overview")
  }, [mode])

  const handleChooseKey = useCallback(
    (name: string) => {
      if ((name === "up" || name === "k") && screen !== "globals") setTarget("name")
      else if (name === "down" || name === "j") setTarget("table")
      else if (name === "enter" || name === "return") enterTarget(target)
    },
    [enterTarget, screen, target],
  )

  const handleTableKey = useCallback(
    (name: string) => {
      if (name === "up" || name === "k") setRowIndex((current) => Math.max(0, current - 1))
      else if (name === "down" || name === "j") {
        setRowIndex((current) => Math.min(rows.length - 1, current + 1))
      } else if (name === "left" || name === "h") setColumn(0)
      else if (name === "right" || name === "l") setColumn(1)
      else if (name === "enter" || name === "return") setMode("cell")
    },
    [rows.length],
  )

  const handleFormCommonKey = useCallback((event: EnvironmentKeyEvent) => {
    if (event.name === "/") setMode("choose")
    else return false
    return true
  }, [])

  const handleCreateKey = useCallback(
    (event: EnvironmentKeyEvent) => {
      if (event.ctrl && event.name === "s") return void save()
      if (event.name === "escape") return leaveCreateMode()
      switch (mode) {
        case "name":
          if (event.name === "tab") enterTarget("table")
          return
        case "cell":
          if (event.name === "tab") nextCell(Boolean(event.shift))
          return
        case "choose":
          handleChooseKey(event.name)
          return
        case "overview":
          handleFormCommonKey(event)
          return
        case "table":
          if (!handleFormCommonKey(event)) handleTableKey(event.name)
          return
      }
    },
    [
      save,
      enterTarget,
      handleChooseKey,
      handleFormCommonKey,
      handleTableKey,
      leaveCreateMode,
      mode,
      nextCell,
    ],
  )

  const handleKey = useCallback(
    (event: EnvironmentKeyEvent) => {
      if (!environmentKeyIsHandled(screen, mode, event)) return
      consumeEnvironmentKey(event)
      if (screen === "list") handleListKey(event)
      else if (screen === "delete") {
        if (event.name === "escape") setScreen("list")
        else if (event.name === "y") void confirmDelete()
      } else handleCreateKey(event)
    },
    [confirmDelete, handleCreateKey, handleListKey, mode, screen],
  )

  useKeyboard(handleKey)

  return (
    <HttpEnvironmentManagerShell
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
      width={width}
      height={height}
      onClose={
        screen === "list"
          ? onClose
          : screen === "delete"
            ? () => setScreen("list")
            : leaveCreateMode
      }
      closeLabel={screen === "list" ? "[Esc] Fechar" : "[Esc] Voltar"}
    >
      {screen === "list" ? (
        <HttpEnvironmentList
          environments={environments}
          activeName={activeName}
          selection={selection}
          contentWidth={width - 4}
          onSelect={select}
          onCreate={beginCreate}
          onOpenGlobals={beginGlobals}
          onEdit={beginEdit}
          onDelete={beginDelete}
        />
      ) : screen === "delete" ? (
        <HttpEnvironmentDeleteConfirm
          name={originalName ?? ""}
          error={error}
          busy={busy}
          onCancel={() => setScreen("list")}
          onConfirm={() => void confirmDelete()}
        />
      ) : (
        <HttpEnvironmentCreateForm
          formKind={screen}
          name={name}
          rows={rows}
          mode={mode}
          target={target}
          rowIndex={rowIndex}
          column={column}
          busy={busy}
          error={error}
          onNameChange={setName}
          onRowChange={updateRow}
          onChooseName={() => enterTarget("name")}
          onChooseTable={() => enterTarget("table")}
          onSave={() => void save()}
          onFocusName={() => setMode("name")}
          onFocusCell={(index, cell) => {
            setRowIndex(index)
            setColumn(cell)
            setMode("cell")
          }}
        />
      )}
    </HttpEnvironmentManagerShell>
  )
}
