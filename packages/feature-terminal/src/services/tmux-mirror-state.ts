import { TMUX_SIDEBAR_MUTATION_OPTION, TMUX_SIDEBAR_OPTION } from "../model/tmux"
import {
  fitTmuxLayout,
  formatTmuxLayout,
  parseTmuxLayout,
  tmuxLayoutPanes,
  type TmuxLayout,
  type TmuxPaneSize,
} from "../model/tmux-layout"
import { runTmux } from "./tmux-command"

const WINDOW_FORMAT = `#{window_id}\t#{window_width}\t#{window_height}\t#{window_layout}\t#{window_visible_layout}\t#{window_zoomed_flag}\t#{${TMUX_SIDEBAR_MUTATION_OPTION}}`
const PANE_FORMAT = `pane\t#{pane_id}\t#{pane_width}\t#{pane_height}\t#{pane_active}\t#{${TMUX_SIDEBAR_OPTION}}`
const CLIENT_FORMAT = "client\t#{window_id}"
const WINDOW_SIZE_MODES = new Set(["largest", "smallest", "manual", "latest"])

export async function inspectTmuxMirrorWindow(socket: string, target: string) {
  const output = await runTmux([
    "-S",
    socket,
    "display-message",
    "-p",
    "-t",
    target,
    WINDOW_FORMAT,
    ";",
    "show-options",
    "-wq",
    "-t",
    target,
    "window-size",
    ";",
    "show-options",
    "-wv",
    "-t",
    target,
    "window-size",
    ";",
    "list-panes",
    "-t",
    target,
    "-F",
    PANE_FORMAT,
    ";",
    "list-clients",
    "-F",
    CLIENT_FORMAT,
  ])
  const [header = "", ...lines] = output.trimEnd().split("\n")
  const [id, width, height, layout, visible, zoomed, sidebarMutation = ""] = header.split("\t")
  if (!/^@\d+$/.test(id ?? "") || !Number(width) || !Number(height) || !layout || !visible)
    throw new Error("Não foi possível ler o painel tmux.")
  const panes = lines
    .filter((line) => line.startsWith("pane\t"))
    .map((line) => {
      const [, pane, columns, rows, active, sidebar] = line.split("\t")
      return {
        id: pane ?? "",
        columns: Number(columns),
        rows: Number(rows),
        active: active === "1",
        sidebar: sidebar === "1",
      }
    })
  const mode = lines.find((line) => line.startsWith("window-size "))?.slice(12) ?? null
  const effectiveMode = lines.find((line) => WINDOW_SIZE_MODES.has(line)) ?? mode ?? "largest"
  return {
    id: id ?? "",
    width: Number(width),
    height: Number(height),
    layout,
    visible,
    zoomed: zoomed === "1",
    panes,
    mode,
    effectiveMode,
    sidebarMutation,
    visibleToClient: lines.some((line) => line === `client\t${id}`),
  }
}

export type TmuxMirrorSnapshot = Awaited<ReturnType<typeof inspectTmuxMirrorWindow>>

export const tmuxMirrorFingerprint = (snapshot: TmuxMirrorSnapshot) =>
  [
    snapshot.width,
    snapshot.height,
    snapshot.layout,
    snapshot.visible,
    snapshot.zoomed,
    snapshot.mode,
    snapshot.effectiveMode,
  ].join("\t")

const paneSet = (snapshot: TmuxMirrorSnapshot) =>
  tmuxLayoutPanes(parseTmuxLayout(snapshot.layout)).sort().join(",")

export const sameTmuxMirrorPanes = (first: TmuxMirrorSnapshot, second: TmuxMirrorSnapshot) =>
  paneSet(first) === paneSet(second)

export const sameTmuxLayoutPanes = (snapshot: TmuxMirrorSnapshot, layout: TmuxLayout) =>
  snapshot.panes
    .map((pane) => pane.id)
    .sort()
    .join(",") === tmuxLayoutPanes(layout).sort().join(",")

export function isTmuxSidebarOnlyChange(current: TmuxMirrorSnapshot, previous: TmuxMirrorSnapshot) {
  const mutationChanged = current.sidebarMutation !== previous.sidebarMutation
  const pendingMatch = /^pending:(\d+)-/.exec(current.sidebarMutation)
  const mutationPending = Boolean(
    pendingMatch && Math.abs(Date.now() - Number(pendingMatch[1])) <= 10_000,
  )
  if (
    (tmuxMirrorFingerprint(current) === tmuxMirrorFingerprint(previous) && !mutationChanged) ||
    current.zoomed !== previous.zoomed ||
    current.mode !== previous.mode ||
    current.effectiveMode !== previous.effectiveMode
  )
    return false
  const currentPanes = new Map(current.panes.map((pane) => [pane.id, pane]))
  const previousContent = previous.panes.filter((pane) => !pane.sidebar)
  if (mutationPending && previousContent.every((pane) => currentPanes.has(pane.id))) return true
  if (
    !mutationChanged &&
    !current.panes.some((pane) => pane.sidebar) &&
    !previous.panes.some((pane) => pane.sidebar)
  )
    return false
  const currentContent = new Map(
    current.panes.filter((pane) => !pane.sidebar).map((pane) => [pane.id, pane]),
  )
  const currentSidebarIds = new Set(
    current.panes.filter((pane) => pane.sidebar).map((pane) => pane.id),
  )
  const stablePreviousContent = previousContent.filter((pane) => !currentSidebarIds.has(pane.id))
  if (
    currentContent.size !== stablePreviousContent.length ||
    !stablePreviousContent.every((pane) => currentContent.has(pane.id))
  )
    return false
  const currentSidebars = current.panes
    .filter((pane) => pane.sidebar)
    .map((pane) => pane.id)
    .sort()
    .join(",")
  const previousSidebars = previous.panes
    .filter((pane) => pane.sidebar)
    .map((pane) => pane.id)
    .sort()
    .join(",")
  if (mutationChanged || currentSidebars !== previousSidebars) return true
  return stablePreviousContent.every((pane) => {
    const candidate = currentContent.get(pane.id)
    return candidate?.columns === pane.columns && candidate.rows === pane.rows
  })
}

export function tmuxLayoutPadding(
  node: TmuxLayout,
  snapshot: TmuxMirrorSnapshot,
  result = new Map<string, number>(),
) {
  if (node.pane) {
    const pane = snapshot.panes.find((pane) => pane.id === node.pane)
    result.set(node.pane, Math.max(0, node.height - (pane?.rows ?? node.height)))
  }
  for (const child of node.children) tmuxLayoutPadding(child, snapshot, result)
  return result
}

export function requestedTmuxMirrorLayout(
  tree: TmuxLayout,
  rowPadding: ReadonlyMap<string, number>,
  original: TmuxMirrorSnapshot,
  requests: Iterable<TmuxPaneSize & { pane: string }>,
) {
  const sizes = new Map<string, TmuxPaneSize>()
  for (const request of requests) {
    const previous = sizes.get(request.pane)
    sizes.set(request.pane, {
      columns: Math.min(previous?.columns ?? Infinity, request.columns),
      rows: Math.min(
        previous?.rows ?? Infinity,
        request.rows + (rowPadding.get(request.pane) ?? 0),
      ),
    })
  }
  const zoomedPane = original.zoomed ? original.panes.find((pane) => pane.active)?.id : undefined
  const viewport = zoomedPane ? sizes.get(zoomedPane) : undefined
  if (zoomedPane) sizes.delete(zoomedPane)
  const layout = fitTmuxLayout(tree, sizes, rowPadding, viewport)
  return { layout, formatted: formatTmuxLayout(layout), zoomedPane }
}
