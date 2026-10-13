import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttackSurface } from '@/pages/AttackSurface';
import { ProjectProvider } from '@/context/ProjectContext';
import type { Project } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project-123',
  name: 'vulnerable-mern-app',
  path: '/test/path',
  status: 'ready',
};

const mockRoutesData = {
  routes: [
    {
      id: 'GET /api/orders/:id',
      path: '/api/orders/:id',
      method: 'GET',
      protected: false,
      authEnforcement: 'none' as const,
      inputs: ['id'],
      controller: 'orderController.getOrder',
      models: ['Order'],
      exposesSensitive: ['paymentDetails'],
      gaps: ['missing-auth'],
    },
    {
      id: 'POST /api/auth/login',
      path: '/api/auth/login',
      method: 'POST',
      protected: false,
      authEnforcement: 'none' as const,
      inputs: ['username', 'password'],
      controller: 'authController.login',
      models: ['User'],
      gaps: ['nosql-injection'],
    },
  ],
  gaps: [
    { type: 'missing-auth', route: '/api/orders/:id' },
    { type: 'nosql-injection', route: '/api/auth/login' },
  ],
  assetsCount: 3,
};

const mockFindings = [
  {
    id: 'f-1',
    projectId: 'test-project-123',
    type: 'idor',
    severity: 'critical' as const,
    confidence: 'high' as const,
    status: 'open' as const,
    affectedNodes: ['Route:/api/orders/:id', 'Asset:Order.paymentDetails'],
    evidence: {
      request: { method: 'GET', path: '/api/orders/123' },
      response: { status: 200, body: { paymentDetails: '4111111111111111' } },
    },
    verificationResult: {
      runId: 'vr-1',
      result: 'CONFIRMED' as const,
      verifiedAt: new Date().toISOString(),
    },
    agentRun: 'test-run',
    references: { owasp: 'A01:2025' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function renderAttackSurface() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={mockProject}>
        <MemoryRouter>
          <AttackSurface />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('AttackSurface page', () => {
  it('renders route list and dynamic 5-stage pipeline for selected route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/routes')) {
          return { ok: true, json: async () => mockRoutesData };
        }
        if (typeof url === 'string' && url.includes('/api/findings')) {
          return { ok: true, json: async () => mockFindings };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );

    renderAttackSurface();
    expect(screen.getByRole('heading', { level: 1, name: 'Attack Surface' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('/api/orders/:id').length).toBeGreaterThan(0);
      expect(screen.getByText('Request')).toBeInTheDocument();
      expect(screen.getByText('User Input')).toBeInTheDocument();
      expect(screen.getByText('Middleware')).toBeInTheDocument();
      expect(screen.getAllByText('Controller').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Database').length).toBeGreaterThan(0);
    });
  });

  it('switches detail tabs correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/routes')) return { ok: true, json: async () => mockRoutesData };
        if (typeof url === 'string' && url.includes('/api/findings')) return { ok: true, json: async () => mockFindings };
        return { ok: true, json: async () => ({}) };
      }),
    );

    renderAttackSurface();
    await waitFor(() => {
      expect(screen.getAllByText('/api/orders/:id').length).toBeGreaterThan(0);
    });

    const findingsTab = screen.getByRole('button', { name: /Findings \(/i });
    fireEvent.click(findingsTab);

    await waitFor(() => {
      expect(screen.getByText('idor')).toBeInTheDocument();
      expect(screen.getByText('critical')).toBeInTheDocument();
    });
  });
});
