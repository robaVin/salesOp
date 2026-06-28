import { useEffect, useRef } from 'react'

/**
 * Sequence-style chord: hold modifier(s), press first key, then second key
 * within `windowMs`. Used for Shift+A → C.
 */
export function useChord(opts: {
  modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean }
  firstKey: string
  secondKey: string
  windowMs?: number
  onFire: () => void
}) {
  const armedAt = useRef<number | null>(null)

  useEffect(() => {
    function shouldIgnoreTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable ||
        target.getAttribute('role') === 'textbox'
      )
    }

    function onKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreTarget(e.target)) return
      const modifiersOk =
        (opts.modifiers.shift ?? false) === e.shiftKey &&
        (opts.modifiers.ctrl ?? false) === e.ctrlKey &&
        (opts.modifiers.meta ?? false) === e.metaKey &&
        (opts.modifiers.alt ?? false) === e.altKey

      const key = e.key.toLowerCase()
      const now = Date.now()
      const w = opts.windowMs ?? 1200

      if (armedAt.current != null && now - armedAt.current < w) {
        if (key === opts.secondKey.toLowerCase()) {
          e.preventDefault()
          armedAt.current = null
          opts.onFire()
          return
        }
        armedAt.current = null
      }

      if (modifiersOk && key === opts.firstKey.toLowerCase()) {
        armedAt.current = now
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.firstKey, opts.secondKey, opts.windowMs])
}
