import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentActivity } from '@/pages/AgentActivity';
import { ProjectProvider } from '@/context/ProjectContext';
import type { Project } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project-123',
  name: 'vulnerable-mern-app',
  path: '/test/path',
  status: 'ready',
};

const mockRuns = [
  {
    runId: 'agent-run-12345678',
    mode: 'full',
    status: 'completed',
    startedAt: new Date().toISOString(),
  },
];

function renderAgentActivity() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={mockProject}>
        <MemoryRouter>
          <AgentActivity />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AgentActivity page', () => {
  it('renders specialist trigger bar, active runs, and empty state launchers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/steps')) return { ok: true, json: async () => [] };
        if (typeof url === 'string' && url.includes('/api/runs')) return { ok: true, json: async () => mockRuns };
        return { ok: true, json: async () => ({}) };
      }),
    );

    renderAgentActivity();
    expect(screen.getByRole('heading', { level: 1, name: 'Agent Activity' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Launch Specialist/i })).toBeInTheDocument();
      expect(screen.getByText(/No Agent Steps in Buffer/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Launch BOLA \/ IDOR Specialist/i })).toBeInTheDocument();
    });
  });

  it('triggers specialist launch on quick launcher click', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/api/projects')) {
        return { ok: true, json: async () => [mockProject] };
      }
      if (typeof url === 'string' && url.includes('/steps')) return { ok: true, json: async () => [] };
      if (typeof url === 'string' && url.includes('/api/runs')) return { ok: true, json: async () => mockRuns };
      if (typeof url === 'string' && url.includes('/api/assess')) {
        return {
          ok: true,
          json: async () => ({ runId: 'new-agent-run-99' }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAgentActivity();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Launch BOLA \/ IDOR Specialist/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Launch BOLA \/ IDOR Specialist/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/assess'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });
});
