import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Verification } from '@/pages/Verification';
import { ProjectProvider } from '@/context/ProjectContext';
import type { Project, VerificationRun } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project-123',
  name: 'vulnerable-mern-app',
  path: '/test/path',
  status: 'ready',
};

const mockRuns: VerificationRun[] = [
  {
    id: 'vr-001',
    projectId: 'test-project-123',
    runId: 'manual-80be16d9',
    hypothesisId: 'hyp-1',
    template: 'idor',
    result: 'CONFIRMED',
    evidence: {
      request: {
        method: 'GET',
        url: 'http://sandbox:3000/api/orders/650000000000000000000012',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      },
      response: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { paymentDetails: { cardNumber: '4111111111111111' }, _id: '650000000000000000000012' },
      },
      expected: '403/404 Access Denied',
      actual: '200 OK + User B data leaked',
    },
    startedAt: '2026-10-13T14:53:23.245Z',
    finishedAt: '2026-10-13T14:53:23.343Z',
  },
];

function renderVerification() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={mockProject}>
        <MemoryRouter>
          <Verification />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Verification page', () => {
  it('renders dynamic verification runs, reproducer terminal, and tabs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/verifications')) return { ok: true, json: async () => mockRuns };
        if (typeof url === 'string' && url.includes('/api/findings')) return { ok: true, json: async () => [] };
        if (typeof url === 'string' && url.includes('/api/routes')) return { ok: true, json: async () => ({ routes: [] }) };
        return { ok: true, json: async () => ({}) };
      }),
    );

    renderVerification();
    expect(screen.getByRole('heading', { level: 1, name: 'Verification' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Insecure Direct Object Reference (BOLA)').length).toBeGreaterThan(0);
      expect(screen.getByText('Exploit Execution (Live Reproducer)')).toBeInTheDocument();
      expect(screen.getByText(/curl -X GET "http:\/\/sandbox:3000\/api\/orders/i)).toBeInTheDocument();
    });

    // Detail tabs: switch to Evidence
    const evidenceTab = screen.getByRole('button', { name: 'Evidence' });
    fireEvent.click(evidenceTab);
    await waitFor(() => {
      expect(screen.getByText('HTTP Request')).toBeInTheDocument();
      expect(screen.getByText('HTTP Response')).toBeInTheDocument();
    });
  });

  it('opens New Verification modal and submits test request', async () => {
    const fetchMock = vi.fn(async (url: string, opts?: any) => {
      if (typeof url === 'string' && url.includes('/api/projects')) {
        return { ok: true, json: async () => [mockProject] };
      }
      if (typeof url === 'string' && url.includes('/api/verifications')) return { ok: true, json: async () => mockRuns };
      if (typeof url === 'string' && url.includes('/api/findings')) return { ok: true, json: async () => [] };
      if (typeof url === 'string' && url.includes('/api/routes')) {
        return {
          ok: true,
          json: async () => ({
            routes: [{ method: 'GET', path: '/api/orders/:id' }],
          }),
        };
      }
      if (typeof url === 'string' && url.includes('/api/verify')) {
        return {
          ok: true,
          json: async () => ({
            id: 'vr-new-2',
            runId: 'manual-new-2',
            template: 'idor',
            result: 'CONFIRMED',
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderVerification();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /New Verification/i })).toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /New Verification/i }));

    await waitFor(() => {
      expect(screen.getByText('Trigger Sandbox Verification')).toBeInTheDocument();
    });

    // Click Run Verification inside modal
    const runBtn = screen.getByRole('button', { name: 'Run Verification' });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/verify'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });
});
