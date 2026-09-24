export function PageHeader({
  title,
  tagline,
  quote,
}: {
  title: string;
  tagline: string;
  quote?: string;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-8">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{tagline}</p>
      </div>
      {quote && (
        <p className="hidden max-w-xs text-right text-[13px] italic text-muted lg:block">
          “{quote}”
        </p>
      )}
    </div>
  );
}
