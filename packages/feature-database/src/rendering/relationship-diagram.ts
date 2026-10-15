import { padDisplayEnd, translateUi, truncateDisplay } from "@xupon/tuiminal-core/i18n/index"
import type { DatabaseRelationship, DatabaseTable } from "../model/types"

function clean(value: string) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? " " : character
  }).join("")
}

function boxTop(width: number) {
  return `+${"-".repeat(width - 2)}+`
}

function boxContent(value: string, width: number) {
  return `|${padDisplayEnd(truncateDisplay(clean(value), width - 4), width - 4)}  |`
}

function blank(width: number) {
  return " ".repeat(width)
}

function tableName(schema: string, table: string) {
  return `${schema}.${table}`
}

function columns(values: string[]) {
  return values.map(clean).join(", ") || "—"
}

function relationEndpoints(table: DatabaseTable, relation: DatabaseRelationship) {
  const selected = tableName(table.schema, table.name)
  const related = tableName(relation.relatedSchema, relation.relatedTable)
  return relation.direction === "incoming"
    ? {
        source: related,
        sourceColumns: relation.relatedColumns,
        target: selected,
        targetColumns: relation.columns,
      }
    : {
        source: selected,
        sourceColumns: relation.columns,
        target: related,
        targetColumns: relation.relatedColumns,
      }
}

function renderStacked(table: DatabaseTable, relationships: DatabaseRelationship[], width: number) {
  const boxWidth = Math.max(12, Math.min(42, width))
  const lines: string[] = []
  for (const relation of relationships) {
    const endpoint = relationEndpoints(table, relation)
    if (lines.length) lines.push("")
    lines.push(truncateDisplay(clean(relation.name), width))
    lines.push(boxTop(boxWidth))
    lines.push(boxContent(endpoint.source, boxWidth))
    lines.push(boxContent(columns(endpoint.sourceColumns), boxWidth))
    lines.push(boxTop(boxWidth))
    lines.push("  |")
    lines.push("  v")
    lines.push(boxTop(boxWidth))
    lines.push(boxContent(endpoint.target, boxWidth))
    lines.push(boxContent(columns(endpoint.targetColumns), boxWidth))
    lines.push(boxTop(boxWidth))
  }
  return lines
}

function renderSelf(table: DatabaseTable, relation: DatabaseRelationship, width: number) {
  const boxWidth = Math.max(12, Math.min(42, width))
  return [
    truncateDisplay(`${clean(relation.name)} (${translateUi("auto-relação")})`, width),
    boxTop(boxWidth),
    boxContent(tableName(table.schema, table.name), boxWidth),
    boxContent(`${columns(relation.columns)} ---> ${columns(relation.relatedColumns)}`, boxWidth),
    boxTop(boxWidth),
  ]
}

function renderWideLane(
  left: DatabaseRelationship | undefined,
  right: DatabaseRelationship | undefined,
  sideWidth: number,
  centerWidth: number,
) {
  const gap = "    "
  const sideBlank = blank(sideWidth)
  const center = (value: string) => boxContent(value, centerWidth)
  const leftTop = left ? boxTop(sideWidth) : sideBlank
  const rightTop = right ? boxTop(sideWidth) : sideBlank
  const leftTable = left
    ? boxContent(tableName(left.relatedSchema, left.relatedTable), sideWidth)
    : sideBlank
  const rightTable = right
    ? boxContent(tableName(right.relatedSchema, right.relatedTable), sideWidth)
    : sideBlank
  const leftColumns = left ? boxContent(columns(left.relatedColumns), sideWidth) : sideBlank
  const rightColumns = right ? boxContent(columns(right.relatedColumns), sideWidth) : sideBlank
  return [
    `${leftTop}${gap}${center("")}${gap}${rightTop}`,
    `${leftTable}${left ? "--->" : gap}${center(left ? columns(left.columns) : "")}${gap}${rightTable}`,
    `${leftColumns}${gap}${center(right ? columns(right.columns) : "")}${right ? "--->" : gap}${rightColumns}`,
    `${leftTop}${gap}${center("")}${gap}${rightTop}`,
  ]
}

function renderWide(table: DatabaseTable, relationships: DatabaseRelationship[], width: number) {
  const incoming = relationships.filter((relation) => relation.direction === "incoming")
  const outgoing = relationships.filter((relation) => relation.direction === "outgoing")
  const sideWidth = Math.min(26, Math.floor((width - 34) / 2))
  const centerWidth = Math.min(30, width - sideWidth * 2 - 8)
  const leftBlank = blank(sideWidth)
  const center = (value: string) => boxContent(value, centerWidth)
  const lines = [
    `${leftBlank}    ${boxTop(centerWidth)}`,
    `${leftBlank}    ${center(tableName(table.schema, table.name))}`,
    `${leftBlank}    ${boxTop(centerWidth)}`,
  ]

  for (let index = 0; index < Math.max(incoming.length, outgoing.length); index += 1) {
    lines.push(...renderWideLane(incoming[index], outgoing[index], sideWidth, centerWidth))
  }
  lines.push(`${leftBlank}    ${boxTop(centerWidth)}`)
  return lines
}

export function renderDatabaseRelationshipDiagram(
  table: DatabaseTable,
  relationships: DatabaseRelationship[],
  availableWidth: number,
) {
  const width = Math.max(12, Math.floor(availableWidth))
  if (!relationships.length) return []
  const selfRelations = relationships.filter(
    (relation) => relation.relatedSchema === table.schema && relation.relatedTable === table.name,
  )
  const otherRelations = relationships.filter((relation) => !selfRelations.includes(relation))
  const lines =
    width >= 74 && otherRelations.length
      ? renderWide(table, otherRelations, width)
      : renderStacked(table, otherRelations, width)
  for (const relation of selfRelations) {
    if (lines.length) lines.push("")
    lines.push(...renderSelf(table, relation, width))
  }
  return lines
}
