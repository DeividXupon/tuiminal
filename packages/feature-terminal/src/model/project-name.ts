/** Last path segment of a local or remote project directory. */
export function projectName(path: string) {
  return (
    path
      .replace(/[\\/]+$/u, "")
      .split(/[\\/]/u)
      .at(-1) || path
  )
}
