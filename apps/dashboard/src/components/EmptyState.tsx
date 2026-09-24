import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
}) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed bg-surface/40 px-6 py-24 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <div className="text-base font-medium">{title}</div>
      <div className="mt-1 text-[13px] text-muted">{hint}</div>
    </div>
  );
}
