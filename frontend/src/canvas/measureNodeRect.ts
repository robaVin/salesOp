/**
 * Resolve the on-screen DOMRect of a React Flow node by its id. React Flow
 * stamps `data-id="<nodeId>"` onto each rendered node container, so we can
 * find it without coupling to RF internals.
 *
 * Returns null when the node isn't currently in the DOM (e.g. virtualised
 * out of view). Callers should fall back to an arbitrary viewport rect.
 */
export interface ScreenRect {
  top: number
  left: number
  width: number
  height: number
}

export function measureNodeRect(nodeId: string): ScreenRect | null {
  const el = document.querySelector<HTMLElement>(`[data-id="${CSS.escape(nodeId)}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

export function focusedTargetRect(): ScreenRect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(1080, vw * 0.86)
  const height = Math.min(820, vh * 0.86)
  return {
    top: (vh - height) / 2,
    left: (vw - width) / 2,
    width,
    height,
  }
}

export function immersiveTargetRect(): ScreenRect {
  return {
    top: 0,
    left: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}
