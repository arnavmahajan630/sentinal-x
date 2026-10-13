import { Layers, PanelLeftClose } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { NAV } from '@/nav';
import { cn } from '@/lib/utils';
import { useProject } from '@/context/ProjectContext';
import { fetchFindings } from '@/lib/api';
import { HealthPills } from './HealthPills';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenProjectModal?: () => void;
}

export function Sidebar({ isCollapsed = false, onToggleCollapse }: SidebarProps) {
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
    <aside
      className={cn(
        'flex h-full flex-col bg-surface/80 transition-all duration-300 ease-in-out shrink-0 overflow-hidden',
        isCollapsed
          ? 'w-0 border-r-0 opacity-0 pointer-events-none'
          : 'w-64 border-r border-border/80 opacity-100 py-5',
      )}
    >
      {/* Brand Header & Compact Collapse Toggle */}
      <div className="flex items-center justify-between px-4 pb-4">
        <NavLink
          to="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-85 cursor-pointer min-w-0"
          title="Return to Repositories Landing Page"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary via-indigo-600 to-secondary text-white shadow-md shadow-primary/20 shrink-0">
            <Layers className="size-5" />
          </span>
          <div className="leading-tight truncate">
            <div className="text-[16px] font-bold tracking-tight text-fg truncate">Sentinel-X</div>
            <div className="whitespace-nowrap text-[10.5px] font-medium text-muted truncate">
              Security Platform
            </div>
          </div>
        </NavLink>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface-alt hover:text-fg transition-colors cursor-pointer shrink-0"
            title="Collapse sidebar (⌘B)"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 overflow-y-auto" aria-label="Primary">
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/overview'}
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

      {/* System Health Status Pills */}
      <div className="mt-auto border-t border-border/80 pt-3">
        <HealthPills />
      </div>
    </aside>
  );
}
