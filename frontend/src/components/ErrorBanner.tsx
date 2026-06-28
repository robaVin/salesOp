import { TriangleAlert, X } from 'lucide-react'

interface ErrorBannerProps {
  message: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="fixed inset-x-0 top-14 z-40 mx-auto w-full max-w-2xl px-4">
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow">
        <TriangleAlert size={16} className="mt-0.5 flex-none" />
        <p className="flex-1 leading-relaxed">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 text-red-700 hover:bg-red-100"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
