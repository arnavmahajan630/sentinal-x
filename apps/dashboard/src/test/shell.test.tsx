import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { NAV } from '@/nav';

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
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
    renderAt('/');
    await waitFor(() => expect(screen.getByTestId('health-database')).toHaveTextContent('Healthy'));
    expect(screen.getByTestId('health-engine')).toHaveTextContent('Online');
    expect(screen.getByTestId('health-sandbox')).toHaveTextContent('Not configured');
  });

  it('shows Unreachable when the server is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down'))),
    );
    renderAt('/');
    await waitFor(() =>
      expect(screen.getByTestId('health-engine')).toHaveTextContent('Unreachable'),
    );
  });
});
