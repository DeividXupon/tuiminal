import { DEFAULT_ISSUE_SECTIONS } from "../../model/issue/config"
import { translateUi } from "@xupon/tuiminal-core/i18n/index"
import {
  DEFAULT_DEMO_ISSUE_SECTION,
  DEMO_ISSUE_SECTIONS,
  demoIssuesForSection,
} from "../../model/issue/fixtures"
import { orderIssueItems } from "../../model/issue/sections"
import type { IssueSection, IssueSummary } from "../../model/issue/types"
import { repositorySelectionLabel } from "../../model/git-configuration"
import type { IssueDashboardState } from "./useIssueDashboard"

export type IssueDashboardPresentation = {
  sections: readonly IssueSection[]
  section: IssueSection
  items: readonly IssueSummary[]
  counts: Readonly<Record<string, number | null>>
  title: string
  meta: string
  scope: string
  showDashboard: boolean
}

function sectionsForDashboard(dashboard: IssueDashboardState) {
  if (dashboard.status === "demo") return DEMO_ISSUE_SECTIONS
  if (dashboard.status === "ready") return dashboard.profile.sections
  return DEFAULT_ISSUE_SECTIONS
}

function itemsForDashboard(dashboard: IssueDashboardState, section: IssueSection) {
  const limit = section.limit ?? Number.POSITIVE_INFINITY
  if (dashboard.status === "demo") {
    return orderIssueItems(demoIssuesForSection(section.id), section.sort).slice(0, limit)
  }
  if (dashboard.status === "ready" && dashboard.section.id === section.id) {
    return orderIssueItems(dashboard.items, section.sort).slice(0, limit)
  }
  return []
}

function countsForDashboard(dashboard: IssueDashboardState, sections: readonly IssueSection[]) {
  if (dashboard.status === "demo") {
    return Object.fromEntries(
      sections.map((section) => [section.id, demoIssuesForSection(section.id).length]),
    )
  }
  return Object.fromEntries(
    sections.map((section) => [
      section.id,
      dashboard.status === "ready" && section.id === dashboard.section.id
        ? (dashboard.totalCount ?? dashboard.items.length)
        : null,
    ]),
  )
}

function dashboardMeta(dashboard: IssueDashboardState) {
  if (dashboard.status === "demo") return "MODO DEMO · nenhuma issue remota será alterada"
  if (dashboard.status === "ready") return `${dashboard.auth.host} · @${dashboard.auth.viewerLogin}`
  if (dashboard.status === "requirements") {
    return dashboard.capabilities.reason === "missing"
      ? "GITHUB CLI NÃO ENCONTRADO"
      : "GITHUB CLI DESATUALIZADO"
  }
  if (dashboard.status === "authentication") return "AUTENTICAÇÃO GITHUB NECESSÁRIA"
  if (dashboard.status === "config-error") return "ERRO NA CONFIGURAÇÃO"
  if (dashboard.status === "error") {
    return dashboard.kind === "not-authenticated"
      ? "AUTENTICAÇÃO GITHUB NECESSÁRIA"
      : "ERRO NO GITHUB"
  }
  return "CARREGANDO GITHUB…"
}

function dashboardScope(dashboard: IssueDashboardState) {
  if (dashboard.status === "demo") {
    return translateUi("ESCOPO: fixture local · nenhum acesso ao GitHub")
  }
  if (dashboard.status === "ready") {
    const total = dashboard.totalCount ?? "?"
    const state = translateUi(
      dashboard.partial ? "PARCIAL" : dashboard.fromCache ? "CACHE" : "ATUALIZADO",
    )
    const scope =
      dashboard.scope.mode === "account"
        ? translateUi("TODOS OS PROJETOS DA CONTA")
        : repositorySelectionLabel(dashboard.profile.repositories, translateUi("REPOSITÓRIOS"))
    const scopeState = dashboard.scope.partial ? ` · ${translateUi("ESCOPO PARCIAL")}` : ""
    return `${scope}${scopeState} · ${dashboard.loadedCount}/${total} ISSUES · ${state}`
  }
  if (dashboard.status === "idle" || dashboard.status === "loading") {
    return translateUi("DESCOBRINDO PROJETOS DA CONTA…")
  }
  return ""
}

export function issueDashboardPresentation(
  dashboard: IssueDashboardState,
  sectionIndex: number,
): IssueDashboardPresentation {
  const sections = sectionsForDashboard(dashboard)
  const section = sections[sectionIndex] ?? sections[0] ?? DEFAULT_DEMO_ISSUE_SECTION
  return {
    sections,
    section,
    items: itemsForDashboard(dashboard, section),
    counts: countsForDashboard(dashboard, sections),
    title: dashboard.status === "demo" ? "ISSUES · DEMO" : "ISSUES",
    meta: dashboardMeta(dashboard),
    scope: dashboardScope(dashboard),
    showDashboard: dashboard.status === "demo" || dashboard.status === "ready",
  }
}
