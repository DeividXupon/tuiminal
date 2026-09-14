export function shouldLoadNextPage({
  selectedIndex,
  itemCount,
  hasNextPage,
  loading,
}: {
  selectedIndex: number
  itemCount: number
  hasNextPage: boolean
  loading: boolean
}) {
  return hasNextPage && !loading && itemCount > 0 && selectedIndex >= itemCount - 1
}

export function remoteDashboardHasNextPage(state: { status: string; hasNextPage?: boolean }) {
  return state.status === "ready" && state.hasNextPage === true
}
