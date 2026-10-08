import { Layers, Settings as SettingsIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { NAV } from '@/nav';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/ProjectContext';
import { fetchFindings } from '@/lib/api';
import { HealthPills } from './HealthPills';

export function Sidebar({ onOpenProjectModal }: { onOpenProjectModal?: () => void }) {
  const { activeProject } = useProject();

  // Query findings to display count badge on Findings nav item
  const { data: findings } = useQuery({
    queryKey: ['findings-count', activeProject?.projectId],
    queryFn: () => (activeProject ? fetchFindings(activeProject.projectId, 'open') : Promise.resolve([])),
    enabled: Boolean(activeProject),
    refetchInterval: 8000,
  });

  const openFindingsCount = findings?.length ?? 0;

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-surface/80 py-5">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 pb-5">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-secondary text-white shadow-md shadow-primary/20">
          <Layers className="size-5" />
        </span>
        <div className="leading-tight">
          <div className="text-[16px] font-bold tracking-tight text-fg">Sentinel-X</div>
          <div className="whitespace-nowrap text-[10.5px] font-medium text-muted">
            Application Security Platform
          </div>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto" aria-label="Primary">
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between rounded-lg border border-transparent px-3 py-2 text-[13.5px] font-medium text-fg/75 transition-colors hover:bg-surface-alt hover:text-fg',
                isActive && 'border-primary/40 bg-primary/10 text-primary font-semibold',
              )
            }
          >
            <div className="flex items-center gap-3">
              <Icon className="size-[17px] shrink-0 text-muted transition-colors group-hover:text-fg" />
              <span>{label}</span>
            </div>

            {/* Dynamic badge for Findings */}
            {label === 'Findings' && openFindingsCount > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-danger px-1.5 py-0.5 text-[10.5px] font-bold text-white shadow-xs">
                {openFindingsCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Active Project Card */}
      <div className="mx-3 mt-3 rounded-xl border bg-surface-alt/40 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Active Project
          </span>
          <button
            type="button"
            onClick={onOpenProjectModal}
            className="text-[10.5px] text-primary hover:underline"
          >
            Switch
          </button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary font-semibold text-[11px]">
            {activeProject ? activeProject.name.slice(0, 2).toUpperCase() : '--'}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-medium text-fg">
              {activeProject ? activeProject.name : 'No project loaded'}
            </div>
            <div className="truncate text-[11px] text-muted">
              {activeProject ? `${activeProject.gitBranch || 'main'} · ${activeProject.gitHead ? activeProject.gitHead.slice(0, 7) : 'head'}` : 'Click Switch to load'}
            </div>
          </div>
        </div>
      </div>

      {/* System Health Status Pills */}
      <div className="mt-3 border-t border-border/80 pt-3">
        <HealthPills />
      </div>

      {/* User / Instance Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border/80 px-4 pt-3 text-fg/80">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-surface-alt text-[12px] font-semibold text-fg">
            A
          </span>
          <div className="leading-tight">
            <div className="text-[12.5px] font-medium text-fg">Arnav</div>
            <div className="text-[10.5px] text-muted">Local Instance</div>
          </div>
        </div>
        <NavLink
          to="/settings"
          className="text-muted transition-colors hover:text-fg"
          title="Settings"
        >
          <SettingsIcon className="size-4" />
        </NavLink>
      </div>
    </aside>
  );
}
