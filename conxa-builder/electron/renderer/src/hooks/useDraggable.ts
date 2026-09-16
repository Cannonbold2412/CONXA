import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clampPosition, type CopilotPosition } from '@/store/copilotStore'

type UseDraggableOptions = {
  onDrag: (pos: CopilotPosition) => void
  onDragEnd: (pos: CopilotPosition) => void
  size?: number
  /** Pixels of movement before a pointerdown counts as a drag rather than a click. */
  threshold?: number
}

/** Drag-to-reposition via native Pointer Events — no dependency needed. `setPointerCapture`
 *  keeps delivering move/up to the same element even once the cursor outruns it, so no
 *  document-level listener is required. `wasDragged` lets a caller's onClick ignore the
 *  trailing click that follows a drag's pointerup. */
export function useDraggable(position: CopilotPosition, { onDrag, onDragEnd, size, threshold = 4 }: UseDraggableOptions) {
  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const wasDragged = useRef(false)

  const onPointerDown = (e: ReactPointerEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y }
    wasDragged.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.startX
    const dy = e.clientY - drag.current.startY
    if (!wasDragged.current && Math.hypot(dx, dy) < threshold) return
    wasDragged.current = true
    onDrag(clampPosition({ x: drag.current.originX + dx, y: drag.current.originY + dy }, size))
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    const started = drag.current
    drag.current = null
    if (!started) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!wasDragged.current) return
    const dx = e.clientX - started.startX
    const dy = e.clientY - started.startY
    onDragEnd(clampPosition({ x: started.originX + dx, y: started.originY + dy }, size))
  }

  return { onPointerDown, onPointerMove, onPointerUp, wasDragged }
}
