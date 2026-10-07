import { inconclusive, methodAndPath, substituteId } from './types';
import type { Template } from './types';
import type { TemplateResult } from './types';

/**
 * mass-assignment: dispatch by the hypothesis's route, since the exact "extra field" that
 * proves the whole body passed through wholesale is route-shaped. Unknown routes are
 * INCONCLUSIVE rather than guessed at.
 */
export const verifyMassAssignment: Template = async (client, req) => {
  if (req.subject.kind !== 'route')
    return inconclusive('mass-assignment template requires a route subject');
  const { method, path } = methodAndPath(req.subject.route);
  const key = `${method} ${path}`;

  if (key === 'POST /api/auth/register') return registerInjectsRole(client);
  if (key === 'PUT /api/orders/:id') return orderUpdateInjectsField(client);
  if (key === 'POST /api/orders') return orderCreateOverridesOwner(client);
  return inconclusive(`no mass-assignment dispatch for "${key}"`);
};

async function registerInjectsRole(client: Parameters<Template>[0]): Promise<TemplateResult> {
  const username = `pwn-${Date.now()}`;
  const res = await client.request(null, 'POST', '/api/auth/register', {
    username,
    password: 'whatever123',
    role: 'admin',
  });
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);
  const expected = 'role ignored (server assigns the default "user" role)';
  const createdRole = (res.response.body as { role?: string } | undefined)?.role;
  if (res.response.status === 201 && createdRole === 'admin') {
    return {
      result: 'CONFIRMED',
      evidence: { request: res.request, response: res.response, expected, actual: 'role: "admin" persisted' },
    };
  }
  return {
    result: 'REJECTED',
    evidence: {
      request: res.request,
      response: res.response,
      expected,
      actual: `status ${res.response.status}, role=${createdRole ?? '(none)'}`,
    },
  };
}

async function orderUpdateInjectsField(client: Parameters<Template>[0]): Promise<TemplateResult> {
  const seed = await client.seedData();
  const orderId = seed.orders?.A;
  if (!orderId) return inconclusive('no seeded order for User A');
  const path = substituteId('/api/orders/:id', orderId);
  const res = await client.request('A', 'PUT', path, { customerId: 'PWNED-mass-assignment' });
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);
  const expected = 'customerId unchanged (not part of the update DTO)';
  const customerId = (res.response.body as { customerId?: string } | undefined)?.customerId;
  if (res.response.status === 200 && customerId === 'PWNED-mass-assignment') {
    return {
      result: 'CONFIRMED',
      evidence: { request: res.request, response: res.response, expected, actual: 'customerId overwritten' },
    };
  }
  return {
    result: 'REJECTED',
    evidence: {
      request: res.request,
      response: res.response,
      expected,
      actual: `status ${res.response.status}, customerId=${customerId ?? '(unchanged)'}`,
    },
  };
}

/** Negative control: POST /api/orders sets `user: req.user.id` AFTER spreading req.body,
 * so an injected `user` field is always overridden — this must come back REJECTED. */
async function orderCreateOverridesOwner(client: Parameters<Template>[0]): Promise<TemplateResult> {
  const victim = await client.seedUser('B');
  const res = await client.request('A', 'POST', '/api/orders', { user: victim.mongoId, total: 1 });
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);
  const expected = "user overridden to the caller's own id (A), not the injected victim id";
  const owner = (res.response.body as { user?: string } | undefined)?.user;
  if (res.response.status === 201 && owner === victim.mongoId) {
    return {
      result: 'CONFIRMED',
      evidence: { request: res.request, response: res.response, expected, actual: `user: ${owner} (injected id kept)` },
    };
  }
  return {
    result: 'REJECTED',
    evidence: {
      request: res.request,
      response: res.response,
      expected,
      actual: `user: ${owner ?? '(unknown)'} (server overrode the injected id)`,
    },
  };
}
