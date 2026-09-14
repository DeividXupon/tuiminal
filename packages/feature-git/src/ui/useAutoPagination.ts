import { useEffect } from "react"
import { shouldLoadNextPage } from "../model/remote-pagination"

export function useAutoPagination({
  selectedIndex,
  itemCount,
  hasNextPage,
  loading,
  onLoadMore,
}: {
  selectedIndex: number
  itemCount: number
  hasNextPage: boolean
  loading: boolean
  onLoadMore: () => void
}) {
  useEffect(() => {
    if (shouldLoadNextPage({ selectedIndex, itemCount, hasNextPage, loading })) onLoadMore()
  }, [hasNextPage, itemCount, loading, onLoadMore, selectedIndex])
}

export function useAutoPage(
  selectedIndex: number,
  itemCount: number,
  hasNextPage: boolean,
  loading: boolean,
  onLoadMore: () => void,
) {
  useAutoPagination({ selectedIndex, itemCount, hasNextPage, loading, onLoadMore })
}
