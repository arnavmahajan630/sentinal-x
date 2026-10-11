import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { NAV } from '@/nav';

import { ProjectProvider } from '@/context/ProjectContext';
import type { Project } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project',
  name: 'test-app',
  path: '/test/path',
  status: 'ready',
};

function renderAt(path: string, project: Project | null = mockProject) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={project}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

const healthy = {
  status: 'degraded',
  ts: '',
  components: {
    engine: { state: 'online' },
    sandbox: { state: 'not_configured' },
    llm: { state: 'not_configured' },
    database: { state: 'online' },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('app shell', () => {
  it('has the 9 nav routes from the final UI', () => {
    expect(NAV.map((n) => n.label)).toEqual([
      'Overview',
      'Attack Surface',
      'Security Graph',
      'Findings',
      'Agent Activity',
      'Verification',
      'Changes',
      'Knowledge',
      'Settings',
    ]);
  });

  it.each(NAV)('renders $label at $path', ({ path, title }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderAt(path);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load project/i })).toBeDisabled();
  });

  it('shows real health state in the sidebar pills', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ status: 200, json: async () => healthy })),
    );
    renderAt('/overview');
    await waitFor(() => expect(screen.getByTestId('health-database')).toHaveTextContent('Healthy'));
    expect(screen.getByTestId('health-engine')).toHaveTextContent('Online');
    expect(screen.getByTestId('health-sandbox')).toHaveTextContent('Not configured');
  });

  it('shows Unreachable when the server is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down'))),
    );
    renderAt('/overview');
    await waitFor(() =>
      expect(screen.getByTestId('health-engine')).toHaveTextContent('Unreachable'),
    );
  });
});

describe('landing page flow', () => {
  it('renders landing page at / when hitting root', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: /Your Repositories/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/All Projects/i)).toBeInTheDocument();
  });
});

describe('attack surface page resilience', () => {
  it('renders attack surface with partial or missing route properties without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/routes')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              routes: {
                total: 2,
                items: [
                  {
                    id: 'GET /api/test',
                    method: 'GET',
                    path: '/api/test',
                    fullPath: '/api/test',
                    protected: false,
                    // missing handler, file, line
                  },
                ],
              },
              gaps: [],
              assetsCount: 0,
            }),
          };
        }
        if (url.includes('/api/findings')) {
          return {
            ok: true,
            status: 200,
            json: async () => [],
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => healthy,
        };
      }),
    );

    renderAt('/attack-surface');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Attack Surface/i })).toBeInTheDocument();
      expect(screen.getAllByText('/api/test').length).toBeGreaterThan(0);
    });
  });
});
