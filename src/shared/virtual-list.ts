export interface VirtualWindow {
  start: number
  end: number
  paddingTop: number
  paddingBottom: number
}

export function calculateVirtualWindow(
  itemCount: number,
  rowHeight: number,
  viewportHeight: number,
  scrollTop: number,
  overscan: number
): VirtualWindow {
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visibleCount = Math.ceil(viewportHeight / rowHeight)
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(itemCount, firstVisible + visibleCount + overscan)
  return {
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, itemCount - end) * rowHeight
  }
}
