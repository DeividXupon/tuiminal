import { DEFAULT_PULL_REQUEST_SECTIONS } from "../../model/pr/config"
import {
  DEFAULT_DEMO_PULL_REQUEST_SECTION,
  DEMO_PULL_REQUEST_SECTIONS,
  demoPullRequestsForSection,
} from "../../model/pr/fixtures"
import { orderPullRequestItems } from "../../model/pr/sections"
import type { PullRequestSection, PullRequestSummary } from "../../model/pr/types"
import { repositorySelectionLabel } from "../../model/git-configuration"
import type { PullRequestDashboardState } from "./usePullRequestDashboard"

export type PullRequestDashboardPresentation = {
  sections: readonly PullRequestSection[]
  section: PullRequestSection
  items: readonly PullRequestSummary[]
  counts: Readonly<Record<string, number | null>>
  title: string
  meta: string
  scope: string
  showDashboard: boolean
}

function sectionsForDashboard(dashboard: PullRequestDashboardState) {
  if (dashboard.status === "demo") return DEMO_PULL_REQUEST_SECTIONS
  if (dashboard.status === "ready") return dashboard.profile.sections
  return DEFAULT_PULL_REQUEST_SECTIONS
}

function itemsForDashboard(dashboard: PullRequestDashboardState, section: PullRequestSection) {
  const limit = section.limit ?? Number.POSITIVE_INFINITY
  if (dashboard.status === "demo") {
    return orderPullRequestItems(demoPullRequestsForSection(section.id), section.sort).slice(
      0,
      limit,
    )
  }
  if (dashboard.status === "ready" && dashboard.section.id === section.id) {
    return orderPullRequestItems(dashboard.items, section.sort).slice(0, limit)
  }
  return []
}

function countsForDashboard(
  dashboard: PullRequestDashboardState,
  sections: readonly PullRequestSection[],
) {
  if (dashboard.status === "demo") {
    return Object.fromEntries(
      sections.map((section) => [section.id, demoPullRequestsForSection(section.id).length]),
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

function dashboardMeta(dashboard: PullRequestDashboardState) {
  if (dashboard.status === "demo") return "MODO DEMO · integração GitHub ainda não conectada"
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

function dashboardScope(dashboard: PullRequestDashboardState) {
  if (dashboard.status === "demo") return "ESCOPO: fixture local · nenhum acesso ao GitHub"
  if (dashboard.status === "ready") {
    const total = dashboard.totalCount ?? "?"
    const state = dashboard.partial ? "PARCIAL" : dashboard.fromCache ? "CACHE" : "ATUALIZADO"
    const scope =
      dashboard.scope.mode === "account"
        ? translateUi("TODOS OS PROJETOS DA CONTA")
        : repositorySelectionLabel(dashboard.profile.repositories, translateUi("REPOSITÓRIOS"))
    const scopeState = dashboard.scope.partial ? ` · ${translateUi("ESCOPO PARCIAL")}` : ""
    return `${scope}${scopeState} · ${dashboard.loadedCount}/${total} PRs · ${translateUi(state)}`
  }
  if (dashboard.status === "idle" || dashboard.status === "loading") {
    return "DESCOBRINDO PROJETOS DA CONTA…"
  }
  return ""
}

export function pullRequestDashboardPresentation(
  dashboard: PullRequestDashboardState,
  sectionIndex: number,
): PullRequestDashboardPresentation {
  const sections = sectionsForDashboard(dashboard)
  const section = sections[sectionIndex] ?? sections[0] ?? DEFAULT_DEMO_PULL_REQUEST_SECTION
  return {
    sections,
    section,
    items: itemsForDashboard(dashboard, section),
    counts: countsForDashboard(dashboard, sections),
    title: dashboard.status === "demo" ? "PULL REQUESTS · DEMO" : "PULL REQUESTS",
    meta: dashboardMeta(dashboard),
    scope: dashboardScope(dashboard),
    showDashboard: dashboard.status === "demo" || dashboard.status === "ready",
  }
}

import { translateUi } from "@xupon/tuiminal-core/i18n/index"
