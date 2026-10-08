import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Knowledge() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedPlaybookType, setSelectedPlaybookType] = useState<string | null>(null);

  const { data: playbooks, isLoading } = useQuery<any[]>({
    queryKey: ['knowledge'],
    queryFn: async () => {
      const res = await fetch('/api/knowledge');
      return res.json();
    },
  });

  const allPlaybooks = useMemo(() => playbooks || [], [playbooks]);

  const filteredPlaybooks = useMemo(() => {
    return allPlaybooks.filter((p: any) => {
      const title = p.title || p.name || p.type || '';
      const summary = p.summary || '';
      const matchesSearch =
        title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.owasp && p.owasp.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;

      if (selectedAgent !== 'all' && p.agent !== selectedAgent) return false;

      return true;
    });
  }, [allPlaybooks, searchTerm, selectedAgent]);

  const selectedPlaybook = useMemo(() => {
    if (!filteredPlaybooks.length) return null;
    if (selectedPlaybookType) {
      return (
        allPlaybooks.find((p: any) => p.type === selectedPlaybookType) || filteredPlaybooks[0]
      );
    }
    return filteredPlaybooks[0];
  }, [filteredPlaybooks, allPlaybooks, selectedPlaybookType]);

  const getSeverityBadge = (sev: string) => {
    switch (sev?.toLowerCase()) {
      case 'critical':
        return 'bg-danger/15 text-danger border-danger/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      default:
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">Knowledge</h1>
        <p className="mt-1 text-sm text-muted">
          The security playbooks that guide how agents investigate and what proves a bug.
        </p>
      </div>

      {/* Search & Agent Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface/60 p-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search playbooks by title, OWASP, attack vector..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border bg-surface-alt/70 py-1.5 pl-9 pr-3 text-sm text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {['all', 'auth', 'dataflow', 'shared'].map((agent) => (
            <button
              key={agent}
              type="button"
              onClick={() => setSelectedAgent(agent)}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium uppercase text-[11px] transition-colors',
                selectedAgent === agent
                  ? 'bg-primary text-white'
                  : 'bg-surface-alt text-muted hover:text-fg',
              )}
            >
              {agent === 'all' ? 'All Agents' : `${agent} Agent`}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout: Playbooks List | Playbook Reader */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Playbook Cards (5 cols) */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted">
            <span>REGISTERED PLAYBOOKS ({filteredPlaybooks.length})</span>
            <span>SPEC: OWASP API TOP 10</span>
          </div>

          {isLoading ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              Loading security playbooks...
            </div>
          ) : filteredPlaybooks.length === 0 ? (
            <div className="rounded-xl border bg-surface/50 p-8 text-center text-sm text-muted">
              No playbooks found.
            </div>
          ) : (
            filteredPlaybooks.map((pb: any) => {
              const isSelected = selectedPlaybook?.type === pb.type;

              return (
                <div
                  key={pb.type}
                  onClick={() => setSelectedPlaybookType(pb.type)}
                  className={cn(
                    'group cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/50 hover:bg-surface-alt/40',
                    isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border/70 bg-surface/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            getSeverityBadge(pb.severityBase),
                          )}
                        >
                          {pb.severityBase || 'MEDIUM'}
                        </span>
                        <span className="truncate font-semibold text-sm text-fg">
                          {pb.title || pb.name || pb.type}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-muted line-clamp-2">
                        {pb.summary || 'Codified inspection criteria and exploit verification playbook.'}
                      </p>
                    </div>

                    <ChevronRight className="size-4 text-muted group-hover:text-primary transition-colors shrink-0 mt-1" />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted border-t border-border/40 pt-2">
                    <span className="font-mono text-fg/80">{pb.owasp || pb.type}</span>
                    <span className="capitalize text-muted">{pb.agent || 'shared'} agent</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Playbook Content Reader (7 cols) */}
        <div className="lg:col-span-7">
          {selectedPlaybook ? (
            <div className="sticky top-6 rounded-2xl border bg-surface/90 p-6 shadow-lg space-y-6">
              {/* Playbook Header */}
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
                        getSeverityBadge(selectedPlaybook.severityBase),
                      )}
                    >
                      {selectedPlaybook.severityBase || 'MEDIUM'}
                    </span>
                    <span className="rounded-md border bg-surface-alt px-2 py-1 text-xs font-medium text-fg uppercase">
                      Agent: {selectedPlaybook.agent || 'shared'}
                    </span>
                  </div>

                  {selectedPlaybook.owasp && (
                    <span className="font-mono text-xs font-bold text-primary">
                      {selectedPlaybook.owasp}
                    </span>
                  )}
                </div>

                <h2 className="mt-3 text-xl font-bold text-fg">
                  {selectedPlaybook.title || selectedPlaybook.name || selectedPlaybook.type}
                </h2>

                {selectedPlaybook.cwe && selectedPlaybook.cwe.length > 0 && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="font-mono">
                      CWE-{Array.isArray(selectedPlaybook.cwe) ? selectedPlaybook.cwe.join(', ') : selectedPlaybook.cwe}
                    </span>
                    {selectedPlaybook.verifierTemplate && (
                      <span className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-fg text-[11px]">
                        Template: {selectedPlaybook.verifierTemplate}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Summary */}
              {selectedPlaybook.summary && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-fg leading-relaxed">
                  <div className="font-bold text-primary mb-1 text-[11px] uppercase tracking-wider">
                    Operational Overview
                  </div>
                  {selectedPlaybook.summary}
                </div>
              )}

              {/* Signals */}
              {selectedPlaybook.signals && selectedPlaybook.signals.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted mb-2">
                    Detection Signals
                  </div>
                  <div className="space-y-1.5">
                    {selectedPlaybook.signals.map((sig: string, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-lg border bg-surface-alt/40 px-3 py-2 text-xs text-fg"
                      >
                        <AlertTriangle className="size-3.5 text-amber-400 shrink-0" />
                        <span className="font-mono text-[11.5px]">{sig}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Playbook Sections (Threat, Investigation, Verification) */}
              {selectedPlaybook.sections && Object.keys(selectedPlaybook.sections).length > 0 ? (
                <div className="space-y-4">
                  {Object.entries(selectedPlaybook.sections).map(([secName, secContent]) => (
                    <div key={secName} className="rounded-xl border bg-surface-alt/30 p-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-fg mb-2">
                        {secName}
                      </div>
                      <div className="prose prose-invert max-w-none text-xs text-muted leading-relaxed whitespace-pre-wrap">
                        {String(secContent)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : selectedPlaybook.body ? (
                <div className="rounded-xl border bg-surface-alt/30 p-4 text-xs text-muted leading-relaxed whitespace-pre-wrap font-mono">
                  {selectedPlaybook.body}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border bg-surface/40 p-12 text-center text-muted">
              Select a playbook from the list to view its investigation guidelines and verification strategies.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
