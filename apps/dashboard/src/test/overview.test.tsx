import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Overview } from '@/pages/Overview';
import { ProjectProvider } from '@/context/ProjectContext';
import type { Project, OverviewData } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project-123',
  name: 'vulnerable-mern-app',
  path: '/test/path',
  status: 'ready',
  hasBeenRun: true,
};

const mockOverviewData: OverviewData = {
  projectId: 'test-project-123',
  project: mockProject,
  posture: {
    grade: 'D+',
    score: 35,
    statusText: 'At Risk',
    protectedRoutes: 1,
    totalRoutes: 12,
  },
  findings: {
    total: 1,
    critical: 1,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    resolved: 0,
    regressed: 0,
  },
  topFindings: [
    {
      id: 'f-1',
      projectId: 'test-project-123',
      type: 'idor',
      severity: 'critical',
      confidence: 'high',
      status: 'open',
      affectedNodes: ['Route:/api/orders/:id', 'Asset:Order.paymentDetails'],
      evidence: {},
      agentRun: 'run-1',
      references: { owasp: 'A01:2025' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  recentEvents: [],
  recentRuns: [],
};

const mockGraph = {
  nodes: [
    {
      id: 'Route:/api/orders/:id',
      type: 'Route',
      key: 'Route:/api/orders/:id',
      props: { path: '/api/orders/:id' },
    },
    {
      id: 'Model:Order',
      type: 'Model',
      key: 'Model:Order',
      props: { name: 'Order' },
    },
  ],
  edges: [],
};

function renderOverview(project: Project | null = mockProject) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={project}>
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Overview page', () => {
  it('renders overview header and contextual status badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/graph')) {
          return { ok: true, json: async () => mockGraph };
        }
        return { ok: true, json: async () => mockOverviewData };
      }),
    );

    renderOverview();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Indexed')).toBeInTheDocument();
    });
  });

  it('renders dynamic attack paths and top finding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/graph')) {
          return { ok: true, json: async () => mockGraph };
        }
        return { ok: true, json: async () => mockOverviewData };
      }),
    );

    renderOverview();
    await waitFor(() => {
      expect(screen.getAllByText('CRITICAL Finding').length).toBeGreaterThan(0);
      expect(screen.getByText('Order.paymentDetails')).toBeInTheDocument();
      expect(screen.getByText('/api/orders/:id')).toBeInTheDocument();
    });
  });

  it('shows no project state if project is not loaded', () => {
    renderOverview(null);
    expect(screen.getByText('No Active Project Loaded')).toBeInTheDocument();
  });
});
