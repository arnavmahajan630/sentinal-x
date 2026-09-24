import { FolderOpen } from 'lucide-react';

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b px-6">
      <button
        type="button"
        disabled
        title="Available once the indexer lands (C1)"
        className="inline-flex items-center gap-2 rounded-lg border bg-surface-alt px-4 py-2 text-[13px] font-medium text-fg/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FolderOpen className="size-4" />
        Load project
      </button>
    </header>
  );
}
