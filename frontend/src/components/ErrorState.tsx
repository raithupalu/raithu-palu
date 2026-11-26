interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Unable to Complete Request',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-left shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-700"
          aria-hidden="true"
        >
          !
        </span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-red-900">{title}</h3>
          <p className="mt-1 text-sm text-red-800">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              Retry Check
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
