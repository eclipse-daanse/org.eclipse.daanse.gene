import { reactive } from 'tsm:vue'

export function usePanZoom() {
  const view = reactive({ x: 0, y: 0, scale: 1 })
  let isPanning = false
  let panStartX = 0
  let panStartY = 0
  let viewStartX = 0
  let viewStartY = 0

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(5, view.scale * factor))
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    view.x = cx - (cx - view.x) * (newScale / view.scale)
    view.y = cy - (cy - view.y) * (newScale / view.scale)
    view.scale = newScale
  }

  function onPanStart(e: PointerEvent) {
    // Left or middle mouse button starts panning
    if (e.button === 0 || e.button === 1) {
      isPanning = true
      panStartX = e.clientX
      panStartY = e.clientY
      viewStartX = view.x
      viewStartY = view.y
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  }

  function onPanMove(e: PointerEvent) {
    if (!isPanning) return
    view.x = viewStartX + (e.clientX - panStartX)
    view.y = viewStartY + (e.clientY - panStartY)
  }

  function onPanEnd() {
    isPanning = false
  }

  function fitToContent(bbox: { x: number; y: number; w: number; h: number }, containerW: number, containerH: number) {
    if (bbox.w <= 0 || bbox.h <= 0) return
    const pad = 20
    const scaleX = (containerW - pad * 2) / bbox.w
    const scaleY = (containerH - pad * 2) / bbox.h
    const scale = Math.min(scaleX, scaleY, 1.5)
    view.scale = scale
    view.x = (containerW - bbox.w * scale) / 2 - bbox.x * scale
    view.y = (containerH - bbox.h * scale) / 2 - bbox.y * scale
  }

  return { view, onWheel, onPanStart, onPanMove, onPanEnd, fitToContent }
}
