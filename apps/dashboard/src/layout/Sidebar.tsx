import { Layers } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { NAV } from '@/nav';
import { cn } from '@/lib/utils';
import { HealthPills } from './HealthPills';

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-surface/60 py-5">
      <div className="flex items-center gap-3 px-4 pb-6">
        <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-secondary text-white">
          <Layers className="size-5" />
        </span>
        <div className="leading-tight">
          <div className="text-lg font-semibold tracking-tight">Sentinel-X</div>
          <div className="whitespace-nowrap text-[10.5px] text-muted">
            Application Security Platform
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Primary">
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-[14px] text-fg/80 transition-colors hover:bg-surface-alt hover:text-fg',
                isActive && 'border-primary/40 bg-primary/10 text-fg',
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mt-4 rounded-lg border bg-surface-alt/40 px-3 py-2.5">
        <div className="text-[11px] uppercase tracking-wide text-muted">Active Project</div>
        <div className="text-[13px] text-fg/90">No project loaded</div>
      </div>

      <div className="mt-4 border-t pt-4">
        <HealthPills />
      </div>
    </aside>
  );
}
