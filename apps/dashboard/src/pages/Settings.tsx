import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Box,
  Brain,
  Database,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { fetchHealth } from '@/lib/api';
import { useProject } from '@/context/ProjectContext';
import { useTheme } from '@/context/ThemeContext';

export function Settings() {
  const { activeProject } = useProject();
  const { theme, toggleTheme } = useTheme();

  const { data: health } = useQuery({
    queryKey: ['health-status'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  });

  const getStatusIcon = (state?: string) => {
    switch (state) {
      case 'online':
        return <CheckCircle2 className="size-4 text-emerald-400" />;
      case 'offline':
        return <XCircle className="size-4 text-danger" />;
      default:
        return <HelpCircle className="size-4 text-amber-400" />;
    }
  };

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Engine, LLM provider, and sandbox configuration.
        </p>
      </div>

      {/* Component Health Cards */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">
          Component Health & Services
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Analysis Engine */}
          <div className="rounded-xl border bg-surface/70 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Server className="size-4" />
              </span>
              {getStatusIcon(health?.components?.engine?.state)}
            </div>
            <div className="font-bold text-sm text-fg">Analysis Engine</div>
            <div className="text-xs text-muted mt-0.5 capitalize">
              {health?.components?.engine?.state || 'Online'}
            </div>
          </div>

          {/* Docker Sandbox */}
          <div className="rounded-xl border bg-surface/70 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <Box className="size-4" />
              </span>
              {getStatusIcon(health?.components?.sandbox?.state)}
            </div>
            <div className="font-bold text-sm text-fg">Docker Sandbox</div>
            <div className="text-xs text-muted mt-0.5 capitalize">
              {health?.components?.sandbox?.state || 'Online'}
            </div>
          </div>

          {/* LLM Provider */}
          <div className="rounded-xl border bg-surface/70 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="grid size-8 place-items-center rounded-lg bg-purple-500/10 text-purple-400">
                <Brain className="size-4" />
              </span>
              {getStatusIcon(health?.components?.llm?.state)}
            </div>
            <div className="font-bold text-sm text-fg">LLM Reasoning</div>
            <div className="text-xs text-muted mt-0.5 capitalize">
              {health?.components?.llm?.state || 'Online'}
            </div>
          </div>

          {/* Database */}
          <div className="rounded-xl border bg-surface/70 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-400">
                <Database className="size-4" />
              </span>
              {getStatusIcon(health?.components?.database?.state)}
            </div>
            <div className="font-bold text-sm text-fg">MongoDB State</div>
            <div className="text-xs text-muted mt-0.5 capitalize">
              {health?.components?.database?.state || 'Connected'}
            </div>
          </div>
        </div>
      </div>

      {/* Engine & Sandbox Configuration */}
      <div className="rounded-2xl border bg-surface/80 p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
          Active Engine Parameters
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Target Platform</span>
              <span className="font-mono font-semibold text-fg">Node.js / Express MERN</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Sandbox Isolation</span>
              <span className="font-mono font-semibold text-emerald-400">Docker Container (Networked)</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Knowledge Base Version</span>
              <span className="font-mono font-semibold text-fg">9 Core Playbooks (OWASP Top 10)</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">LLM Provider</span>
              <span className="font-mono font-semibold text-fg">Ollama / Local + Mock Fallback</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Theme Mode</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="font-medium text-primary hover:underline uppercase"
              >
                {theme} (Click to toggle)
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Real-time Bus</span>
              <span className="font-mono font-semibold text-primary">Server-Sent Events (SSE)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Project Details */}
      {activeProject && (
        <div className="rounded-2xl border bg-surface/80 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
            Active Repository Configuration
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Repository Name</span>
              <span className="font-mono font-bold text-fg">{activeProject.name}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-surface-alt/40 px-3 py-2.5">
              <span className="text-muted">Local Directory Path</span>
              <span className="font-mono text-fg truncate max-w-lg">{activeProject.path}</span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border bg-surface-alt/30 p-2.5 text-center">
                <div className="text-muted text-[11px]">Indexed Files</div>
                <div className="text-base font-bold text-fg mt-0.5">{activeProject.stats?.files ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-surface-alt/30 p-2.5 text-center">
                <div className="text-muted text-[11px]">Mapped Routes</div>
                <div className="text-base font-bold text-fg mt-0.5">{activeProject.stats?.routes ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-surface-alt/30 p-2.5 text-center">
                <div className="text-muted text-[11px]">Functions</div>
                <div className="text-base font-bold text-fg mt-0.5">{activeProject.stats?.functions ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-surface-alt/30 p-2.5 text-center">
                <div className="text-muted text-[11px]">Database Models</div>
                <div className="text-base font-bold text-fg mt-0.5">{activeProject.stats?.models ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Non-Core Integration Modules */}
      <div className="rounded-2xl border bg-surface/80 p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
          Enterprise Extensions & Integrations
        </h2>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between rounded-lg border bg-surface-alt/20 p-3 opacity-60">
            <div>
              <div className="font-semibold text-fg">GitHub Pull Request Sync (N13)</div>
              <div className="text-muted text-[11px]">Post verified security comments on developer PRs</div>
            </div>
            <span className="rounded bg-surface-alt border px-2 py-0.5 text-[10px] font-bold text-muted uppercase">
              Disabled (Extension)
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-surface-alt/20 p-3 opacity-60">
            <div>
              <div className="font-semibold text-fg">CVSS v3.1 Automated Scoring (N9)</div>
              <div className="text-muted text-[11px]">Automated CVSS metrics calculation for export</div>
            </div>
            <span className="rounded bg-surface-alt border px-2 py-0.5 text-[10px] font-bold text-muted uppercase">
              Disabled (Extension)
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-surface-alt/20 p-3 opacity-60">
            <div>
              <div className="font-semibold text-fg">Automated Code Patch Suggestions (N15)</div>
              <div className="text-muted text-[11px]">Generate git patch diffs to remediate vulnerabilities</div>
            </div>
            <span className="rounded bg-surface-alt border px-2 py-0.5 text-[10px] font-bold text-muted uppercase">
              Disabled (Extension)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
