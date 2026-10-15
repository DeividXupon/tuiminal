type RemoteSection<Column extends string, Sort extends string> = {
  id: string
  title: string
  query: string
  columns?: Column[]
  sort?: Sort
  limit?: number
}

type RemoteProfile<Column extends string, Sort extends string> = {
  host: string
  repositories: string[]
  sections: RemoteSection<Column, Sort>[]
  previewPosition?: "auto" | "right" | "bottom"
}

type RemoteConfigOptions<Column extends string, Sort extends string> = {
  defaultSections: readonly RemoteSection<Column, Sort>[]
  previousDefaultSets: readonly (readonly RemoteSection<Column, Sort>[])[]
  columns: readonly Column[]
  sorts: readonly Sort[]
  validRepository: (repository: string) => boolean
}

export function configObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

function sectionOptions<Column extends string, Sort extends string>(
  section: Record<string, unknown>,
  options: RemoteConfigOptions<Column, Sort>,
) {
  const columns = Array.isArray(section.columns)
    ? section.columns.filter(
        (column): column is Column =>
          typeof column === "string" && options.columns.includes(column as Column),
      )
    : []
  const sort =
    typeof section.sort === "string" && options.sorts.includes(section.sort as Sort)
      ? (section.sort as Sort)
      : undefined
  const limit =
    typeof section.limit === "number" && Number.isFinite(section.limit)
      ? Math.floor(Math.min(100, Math.max(1, section.limit)))
      : undefined
  return {
    ...(columns.length ? { columns: [...new Set(columns)] } : {}),
    ...(sort ? { sort } : {}),
    ...(limit ? { limit } : {}),
  }
}

function sectionsValue<Column extends string, Sort extends string>(
  value: unknown,
  options: RemoteConfigOptions<Column, Sort>,
): RemoteSection<Column, Sort>[] {
  if (!Array.isArray(value)) return options.defaultSections.map((section) => ({ ...section }))
  const identifiers = new Set<string>()
  const sections = value.flatMap((entry) => {
    const section = configObject(entry)
    const id = typeof section?.id === "string" ? section.id.trim() : ""
    const title = typeof section?.title === "string" ? section.title.trim() : ""
    const query = typeof section?.query === "string" ? section.query.trim() : ""
    if (!section || !id || !title || !query || identifiers.has(id)) return []
    identifiers.add(id)
    return [{ id, title, query, ...sectionOptions(section, options) }]
  })
  const isPreviousDefault = options.previousDefaultSets.some(
    (defaults) =>
      sections.length === defaults.length &&
      sections.every((section, index) => {
        const previous = defaults[index]
        return (
          previous?.id === section.id &&
          previous.title === section.title &&
          previous.query === section.query &&
          section.columns === undefined &&
          section.sort === undefined &&
          section.limit === undefined
        )
      }),
  )
  return isPreviousDefault ? options.defaultSections.map((section) => ({ ...section })) : sections
}

function profileValue<Column extends string, Sort extends string>(
  value: unknown,
  defaultHost: string,
  options: RemoteConfigOptions<Column, Sort>,
): RemoteProfile<Column, Sort> | null {
  const profile = configObject(value)
  if (!profile) return null
  const repositories = Array.isArray(profile.repositories)
    ? profile.repositories.filter(
        (repository): repository is string =>
          typeof repository === "string" && options.validRepository(repository),
      )
    : []
  const sections = sectionsValue(profile.sections, options)
  return {
    host:
      typeof profile.host === "string" && profile.host.trim() ? profile.host.trim() : defaultHost,
    repositories: [...new Set(repositories)],
    sections: sections.length
      ? sections
      : options.defaultSections.map((section) => ({ ...section })),
    ...(profile.previewPosition === "right" || profile.previewPosition === "bottom"
      ? { previewPosition: profile.previewPosition }
      : profile.previewPosition === "auto"
        ? { previewPosition: "auto" as const }
        : {}),
  }
}

function profilesValue<Column extends string, Sort extends string>(
  value: unknown,
  defaultHost: string,
  options: RemoteConfigOptions<Column, Sort>,
): Record<string, RemoteProfile<Column, Sort>> {
  const profiles = configObject(value) ?? {}
  return Object.fromEntries(
    Object.entries(profiles).flatMap(([path, rawProfile]) => {
      const profile = profileValue(rawProfile, defaultHost, options)
      return path.trim() && profile ? [[path, profile]] : []
    }),
  )
}

function repoPathsValue(value: unknown): Record<string, string[]> {
  const mappings = configObject(value) ?? {}
  return Object.fromEntries(
    Object.entries(mappings).flatMap(([repository, paths]) => {
      if (!repository.includes("/") || !Array.isArray(paths)) return []
      const validPaths = paths.filter(
        (path): path is string => typeof path === "string" && Boolean(path.trim()),
      )
      return validPaths.length ? [[repository, [...new Set(validPaths)]]] : []
    }),
  )
}

/** Shared PR/Issue persisted-value normalization; tool-specific defaults stay with the caller. */
export function parseRemoteConfigBase<Column extends string, Sort extends string>(
  root: Record<string, unknown>,
  options: RemoteConfigOptions<Column, Sort>,
) {
  const defaults = configObject(root.defaults) ?? {}
  const preview = configObject(defaults.preview) ?? {}
  const host =
    typeof defaults.host === "string" && defaults.host.trim() ? defaults.host.trim() : "github.com"
  const position: "auto" | "right" | "bottom" =
    preview.position === "right" || preview.position === "bottom" ? preview.position : "auto"
  return {
    defaults: {
      host,
      pageSize: Math.floor(boundedNumber(defaults.pageSize, 20, 1, 100)),
      refreshSeconds: Math.floor(boundedNumber(defaults.refreshSeconds, 300, 30, 3_600)),
      preview: {
        open: preview.open !== false,
        position,
        widthRatio: boundedNumber(preview.widthRatio, 0.45, 0.25, 0.7),
        heightRatio: boundedNumber(preview.heightRatio, 0.5, 0.3, 0.7),
      },
    },
    profiles: profilesValue(root.profiles, host, options),
    repoPaths: repoPathsValue(root.repoPaths),
  }
}
