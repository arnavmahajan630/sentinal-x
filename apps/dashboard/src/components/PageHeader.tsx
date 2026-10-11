export function PageHeader({
  title,
  tagline,
  quote,
  breadcrumb,
}: {
  title: string;
  tagline: string;
  quote?: string;
  breadcrumb?: string;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span>{breadcrumb}</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 text-sm text-muted">{tagline}</p>
        </div>
        {quote && (
          <div className="hidden max-w-sm text-right lg:block">
            <p className="text-xs italic text-muted/90">“{quote}”</p>
            <p className="text-[11px] text-muted/60 mt-0.5">— Sentinel-X</p>
          </div>
        )}
      </div>
    </div>
  );
}

