interface LoadingStateProps {
  title?: string;
  message?: string;
  compact?: boolean;
}

export function LoadingState({
  title = 'Loading Raithu Palu...',
  message = 'Please wait while data is being retrieved.',
  compact = false,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-center shadow-sm ${
        compact ? 'p-5' : 'p-10'
      }`}
    >
      <div
        className="h-9 w-9 animate-spin rounded-full border-4 border-dairy-meadow border-t-dairy-pasture"
        aria-hidden="true"
      />
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
    </div>
  );
}
