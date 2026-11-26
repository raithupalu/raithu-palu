import { Link } from 'react-router-dom';

interface NotFoundStateProps {
  title?: string;
  description?: string;
  backPath?: string;
  backLabel?: string;
}

export function NotFoundState({
  title = 'Page Not Found',
  description = 'The requested Raithu Palu view does not exist or is scheduled for a future implementation phase.',
  backPath = '/',
  backLabel = 'Return to Foundation Overview',
}: NotFoundStateProps) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-emerald-900/15 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-dairy-meadow text-xl font-bold text-dairy-pasture">
        404
      </div>
      <h2 className="mt-5 text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="mt-6">
        <Link
          to={backPath}
          className="inline-flex items-center justify-center rounded-lg bg-dairy-pasture px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-dairy-pastureDark"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
