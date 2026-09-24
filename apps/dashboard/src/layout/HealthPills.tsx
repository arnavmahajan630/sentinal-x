import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/lib/api';
import type { ComponentHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

const ROWS = [
  { key: 'engine', label: 'Core Engine', on: 'Online' },
  { key: 'sandbox', label: 'Sandbox', on: 'Running' },
  { key: 'llm', label: 'LLM Provider', on: 'Connected' },
  { key: 'database', label: 'Database', on: 'Healthy' },
] as const;

function describe(c: ComponentHealth | undefined, on: string, unreachable: boolean) {
  if (unreachable) return { text: 'Unreachable', tone: 'danger' as const };
  if (!c) return { text: 'Checking…', tone: 'muted' as const };
  if (c.state === 'online') return { text: on, tone: 'success' as const };
  if (c.state === 'not_configured') return { text: 'Not configured', tone: 'muted' as const };
  return { text: 'Offline', tone: 'danger' as const };
}

const dot = { success: 'bg-success', danger: 'bg-danger', muted: 'bg-muted' };
const text = { success: 'text-success', danger: 'text-danger', muted: 'text-muted' };

/** Sidebar footer status pills, driven by the real /health endpoint. */
export function HealthPills() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
    retry: false,
  });

  return (
    <ul className="space-y-2.5 px-5" aria-label="System status">
      {ROWS.map((r) => {
        const s = describe(data?.components[r.key], r.on, isError);
        const detail = data?.components[r.key].detail;
        return (
          <li key={r.key} className="flex items-center gap-3" title={detail}>
            <span
              className={cn('grid size-6 place-items-center rounded-full bg-surface-alt')}
              aria-hidden
            >
              <span className={cn('size-2 rounded-full', dot[s.tone])} />
            </span>
            <span className="leading-tight">
              <span className="block text-[13px] text-fg/90">{r.label}</span>
              <span
                className={cn('block text-[12px] font-medium', text[s.tone])}
                data-testid={`health-${r.key}`}
              >
                {s.text}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
