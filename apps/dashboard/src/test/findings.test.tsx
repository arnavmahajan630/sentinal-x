import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Findings } from '@/pages/Findings';
import { ProjectProvider } from '@/context/ProjectContext';
import type { Project, Finding } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project-123',
  name: 'vulnerable-mern-app',
  path: '/test/path',
  status: 'ready',
};

const mockFindings: Finding[] = [
  {
    id: 'f-101',
    projectId: 'test-project-123',
    type: 'idor',
    severity: 'critical',
    confidence: 'high',
    status: 'open',
    affectedNodes: ['Route:/api/orders/:id', 'Asset:Order.paymentDetails'],
    evidence: {
      request: { method: 'GET', path: '/api/orders/650000000000000000000012' },
      response: { status: 200, body: { paymentDetails: { cardNumber: '4111111111111111' } } },
      expected: '403/404 Access Denied',
      actual: '200 OK + User B data leaked',
    },
    verificationResult: {
      runId: 'vr-101',
      result: 'CONFIRMED',
      verifiedAt: new Date().toISOString(),
    },
    attackPath: {
      findingIds: ['f-101'],
      nodes: ['Route:/api/orders/:id', 'Asset:Order.paymentDetails'],
      narrative: 'IDOR bypass allows unauthorized read of customer payment card numbers.',
    },
    agentRun: 'manual-run-1',
    references: {
      owasp: 'A01:2025 Broken Object Level Authorization',
      cwe: [639, 284],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function renderFindings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={mockProject}>
        <MemoryRouter>
          <Findings />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Findings page', () => {
  it('renders findings list, metrics, and dossier tabs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/findings')) return { ok: true, json: async () => mockFindings };
        return { ok: true, json: async () => ({}) };
      }),
    );

    renderFindings();
    expect(screen.getByRole('heading', { level: 1, name: 'Findings' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('idor').length).toBeGreaterThan(0);
      expect(screen.getByText('f-101')).toBeInTheDocument();
    });

    // Switch to Evidence tab
    const evidenceTab = screen.getByRole('button', { name: 'Evidence' });
    fireEvent.click(evidenceTab);
    await waitFor(() => {
      expect(screen.getByText('Expected Baseline')).toBeInTheDocument();
      expect(screen.getByText('Actual Exploit Response')).toBeInTheDocument();
      expect(screen.getByText('200 OK')).toBeInTheDocument();
    });

    // Switch to Fix Recommendation tab
    const fixTab = screen.getByRole('button', { name: 'Fix Recommendation' });
    fireEvent.click(fixTab);
    await waitFor(() => {
      expect(screen.getByText('Remediation Overview')).toBeInTheDocument();
      expect(screen.getByText(/Enforce Ownership Verification in Route Controller/i)).toBeInTheDocument();
    });

    // Switch to References tab
    const refTab = screen.getByRole('button', { name: 'References' });
    fireEvent.click(refTab);
    await waitFor(() => {
      expect(screen.getByText('CWE-639')).toBeInTheDocument();
      expect(screen.getByText('CWE-284')).toBeInTheDocument();
    });
  });

  it('triggers sandbox verification from the overview tab', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/api/projects')) {
        return { ok: true, json: async () => [mockProject] };
      }
      if (typeof url === 'string' && url.includes('/api/findings')) return { ok: true, json: async () => mockFindings };
      if (typeof url === 'string' && url.includes('/api/verify')) {
        return {
          ok: true,
          json: async () => ({
            id: 'vr-new',
            runId: 'manual-new',
            result: 'CONFIRMED',
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderFindings();
    await waitFor(() => {
      expect(screen.getByText('f-101')).toBeInTheDocument();
    });

    const testBtn = screen.getByRole('button', { name: /Test in Sandbox/i });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/verify'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ projectId: 'test-project-123', findingId: 'f-101' }),
        }),
      );
      expect(screen.getByText(/Verification finished: Result/i)).toBeInTheDocument();
    });
  });
});
