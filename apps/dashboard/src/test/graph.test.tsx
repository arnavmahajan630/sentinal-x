import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Graph } from '@/pages/Graph';
import { ProjectProvider } from '@/context/ProjectContext';
import type { Project } from '@/lib/api';

const mockProject: Project = {
  projectId: 'test-project-123',
  name: 'vulnerable-mern-app',
  path: '/test/path',
  status: 'ready',
};

const mockGraphData = {
  nodes: [
    {
      id: 'Route:/api/orders/:id',
      key: 'Route:/api/orders/:id',
      type: 'Route',
      label: '/api/orders/:id',
      props: { path: '/api/orders/:id', method: 'GET', auth: false },
    },
    {
      id: 'Controller:orderController',
      key: 'Controller:orderController',
      type: 'function',
      label: 'orderController',
      props: { name: 'orderController' },
    },
    {
      id: 'Model:Order',
      key: 'Model:Order',
      type: 'Model',
      label: 'Order',
      props: { model: 'Order' },
    },
    {
      id: 'Asset:Order.paymentDetails',
      key: 'Asset:Order.paymentDetails',
      type: 'Asset',
      label: 'paymentDetails',
      props: { field: 'paymentDetails', classification: 'PCI' },
    },
  ],
  edges: [
    { type: 'CALLS', from: 'Route:/api/orders/:id', to: 'Controller:orderController' },
    { type: 'READS', from: 'Controller:orderController', to: 'Model:Order' },
    { type: 'CONTAINS', from: 'Model:Order', to: 'Asset:Order.paymentDetails' },
  ],
};

function renderGraph() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectProvider initialProject={mockProject}>
        <MemoryRouter>
          <Graph />
        </MemoryRouter>
      </ProjectProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Security Graph page', () => {
  it('renders tiered graph topology with dynamic nodes and drawer inspection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/projects')) {
          return { ok: true, json: async () => [mockProject] };
        }
        if (typeof url === 'string' && url.includes('/api/graph')) return { ok: true, json: async () => mockGraphData };
        if (typeof url === 'string' && url.includes('/api/findings')) return { ok: true, json: async () => [] };
        return { ok: true, json: async () => ({}) };
      }),
    );

    renderGraph();
    expect(screen.getByRole('heading', { level: 1, name: 'Security Graph' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Total Nodes')).toBeInTheDocument();
    });

    // Debug output
    // console.log('BODY:', document.body.innerHTML);
    const nodesCount = screen.getByText('Total Nodes').parentElement?.querySelector('.text-2xl')?.textContent;
    expect(nodesCount).toBe('4');

    // Clicking a node opens/updates the right inspection drawer
    const nodeElem = screen.getAllByText('/api/orders/:id')[0];
    expect(nodeElem).toBeDefined();
    fireEvent.click(nodeElem!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Relationships' })).toBeInTheDocument();
    });
  });
});
