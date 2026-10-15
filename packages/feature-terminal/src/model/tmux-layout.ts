export type TmuxLayout = {
  width: number
  height: number
  pane?: string
  direction?: "row" | "column"
  children: TmuxLayout[]
}
export type TmuxPaneSize = { columns: number; rows: number }
const invalidLayout = () => new Error("Não foi possível ler o painel tmux.")

class TmuxLayoutParser {
  private offset: number

  constructor(private value: string) {
    this.offset = value.indexOf(",") + 1
  }

  parse() {
    const root = this.read(0)
    if (this.offset !== this.value.length) throw invalidLayout()
    return root
  }

  private readChildren(end: string, depth: number) {
    const children: TmuxLayout[] = []
    do {
      children.push(this.read(depth + 1))
    } while (this.value[this.offset++] === ",")
    if (this.value[this.offset - 1] !== end) throw invalidLayout()
    return children
  }

  private readHeader() {
    const match = /^(\d+)x(\d+),\d+,\d+/.exec(this.value.slice(this.offset))
    if (!match) throw invalidLayout()
    this.offset += match[0].length
    const node: TmuxLayout = { width: Number(match[1]), height: Number(match[2]), children: [] }
    if (!node.width || !node.height) throw invalidLayout()
    return node
  }

  private readPane(node: TmuxLayout) {
    const pane = /^\d+/.exec(this.value.slice(this.offset))?.[0]
    if (!pane) throw invalidLayout()
    this.offset += pane.length
    node.pane = `%${pane}`
    return node
  }

  private readGroup(node: TmuxLayout, opening: string, depth: number) {
    if (opening !== "{" && opening !== "[") throw invalidLayout()
    node.direction = opening === "{" ? "row" : "column"
    node.children = this.readChildren(opening === "{" ? "}" : "]", depth)
    return node
  }

  private read(depth: number): TmuxLayout {
    if (depth > 64) throw invalidLayout()
    const node = this.readHeader()
    const next = this.value[this.offset++] ?? ""
    return next === "," ? this.readPane(node) : this.readGroup(node, next, depth)
  }
}

/** tmux's layout string retains the existing pane IDs and split topology. */
export function parseTmuxLayout(value: string): TmuxLayout {
  return new TmuxLayoutParser(value).parse()
}

export function tmuxLayoutPanes(node: TmuxLayout): string[] {
  return node.pane ? [node.pane] : node.children.flatMap(tmuxLayoutPanes)
}

type Measured = Omit<TmuxLayout, "children"> & {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  children: Measured[]
}

function measure(
  node: TmuxLayout,
  sizes: ReadonlyMap<string, TmuxPaneSize>,
  padding: ReadonlyMap<string, number>,
): Measured {
  const size = node.pane && sizes.get(node.pane)
  const children = node.children.map((child) => measure(child, sizes, padding))
  const minHeight = 1 + (padding.get(node.pane ?? "") ?? 0)
  const result: Measured = {
    ...node,
    children,
    width: size ? size.columns : node.width,
    height: Math.max(minHeight, size ? size.rows : node.height),
    minWidth: 1,
    minHeight,
    maxWidth: size ? size.columns : Infinity,
    maxHeight: size ? size.rows : Infinity,
  }
  if (!children.length) return result
  for (const axis of ["Width", "Height"] as const) {
    const dimension = axis === "Width" ? "width" : "height"
    const along = node.direction === (axis === "Width" ? "row" : "column")
    const sum = (values: number[]) =>
      values.reduce((total, value) => total + value, children.length - 1)
    result[`min${axis}`] = along
      ? sum(children.map((child) => child[`min${axis}`]))
      : Math.max(...children.map((child) => child[`min${axis}`]))
    result[`max${axis}`] = along
      ? sum(children.map((child) => child[`max${axis}`]))
      : Math.min(...children.map((child) => child[`max${axis}`]))
    const preferred = along
      ? sum(children.map((child) => child[dimension]))
      : Math.max(...children.map((child) => child[dimension]))
    result[dimension] = Math.max(result[`min${axis}`], Math.min(preferred, result[`max${axis}`]))
  }
  return result
}

function distribute(children: Measured[], dimension: "width" | "height", total: number) {
  const axis = dimension === "width" ? "Width" : "Height"
  const values = children.map((child) => child[dimension])
  let remaining = total - values.reduce((sum, value) => sum + value, 0)
  while (remaining) {
    const growing = remaining > 0
    const available = children
      .map((child, index) => ({
        index,
        room: growing ? child[`max${axis}`] - values[index]! : values[index]! - child[`min${axis}`],
      }))
      .filter(({ room }) => room > 0)
    if (!available.length) break
    const share = Math.ceil(Math.abs(remaining) / available.length)
    for (const { index, room } of available) {
      const change = Math.min(room, share, Math.abs(remaining)) * (growing ? 1 : -1)
      values[index]! += change
      remaining -= change
    }
  }
  return values
}

function place(node: Measured, width = node.width, height = node.height): TmuxLayout {
  if (!node.children.length) return { ...node, width, height }
  const horizontal = node.direction === "row"
  const lengths = distribute(
    node.children,
    horizontal ? "width" : "height",
    (horizontal ? width : height) - node.children.length + 1,
  )
  return {
    ...node,
    width,
    height,
    children: node.children.map((child, index) =>
      place(child, horizontal ? lengths[index]! : width, horizontal ? height : lengths[index]!),
    ),
  }
}

/** Shared axes use the smallest requested size so every mirror can show its pane. */
export function fitTmuxLayout(
  root: TmuxLayout,
  sizes: ReadonlyMap<string, TmuxPaneSize>,
  padding: ReadonlyMap<string, number> = new Map(),
  viewport?: TmuxPaneSize,
) {
  const measured = measure(root, sizes, padding)
  return place(
    measured,
    Math.max(measured.minWidth, Math.min(measured.maxWidth, viewport?.columns ?? measured.width)),
    Math.max(measured.minHeight, Math.min(measured.maxHeight, viewport?.rows ?? measured.height)),
  )
}

export function formatTmuxLayout(root: TmuxLayout) {
  function format(node: TmuxLayout, x: number, y: number): string {
    const header = `${node.width}x${node.height},${x},${y}`
    if (node.pane) return `${header},${node.pane.slice(1)}`
    const horizontal = node.direction === "row"
    const children = node.children
      .map((child) => {
        const value = format(child, x, y)
        if (horizontal) x += child.width + 1
        else y += child.height + 1
        return value
      })
      .join(",")
    return `${header}${horizontal ? "{" : "["}${children}${horizontal ? "}" : "]"}`
  }
  const body = format(root, 0, 0)
  let checksum = 0
  for (const char of body)
    checksum = (((checksum >> 1) | ((checksum & 1) << 15)) + char.charCodeAt(0)) & 0xffff
  return `${checksum.toString(16).padStart(4, "0")},${body}`
}
