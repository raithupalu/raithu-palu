interface EmptyStateProps {
  title?: string;
  message?: string;
  compact?: boolean;
}

export function EmptyState({
  title = 'No Records Available',
  message = 'No matching items were found.',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-center ${
        compact ? 'p-6' : 'p-10'
      }`}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-dairy-meadow text-sm font-bold text-dairy-pasture"
        aria-hidden="true"
      >
        RP
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>
    </div>
  );
}
