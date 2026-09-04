type DefinedProperties<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>
}

/** Normalize optional fields at configuration/serialization boundaries. Keeps null. */
export function definedProperties<T extends object>(value: T): DefinedProperties<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as DefinedProperties<T>
}
