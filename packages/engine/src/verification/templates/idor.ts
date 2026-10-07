import { inconclusive, methodAndPath, substituteId } from './types';
import type { Template } from './types';

/**
 * IDOR: subject is route-shaped (e.g. "GET /api/orders/:id"), not instance-shaped. We
 * substitute the seeded order id owned by User B, then call the route as User A.
 * Known limitation: only handles single `:id`-style params, matching what the Auth
 * agent's `idor` playbook can currently detect.
 */
export const verifyIdor: Template = async (client, req) => {
  if (req.subject.kind !== 'route') return inconclusive('idor template requires a route subject');
  const { method, path: pathTemplate } = methodAndPath(req.subject.route);
  const seed = await client.seedData();
  const victimOrderId = seed.orders?.B;
  if (!victimOrderId) return inconclusive('no seeded order for User B');
  const victim = await client.seedUser('B');
  const targetPath = substituteId(pathTemplate, victimOrderId);

  const res = await client.request('A', method, targetPath);
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);

  const expected = `403/404 (resource belongs to User B, caller is User A)`;
  const body = res.response.body as Record<string, unknown> | undefined;
  const owner =
    body && typeof body === 'object' ? (body.user ?? (body as any).order?.user) : undefined;
  const gotVictimData =
    res.response.status === 200 &&
    !!body &&
    (owner === undefined || String(owner) === victim.mongoId);

  if (gotVictimData) {
    return {
      result: 'CONFIRMED',
      evidence: {
        request: res.request,
        response: res.response,
        expected,
        actual: `200 + User B's data returned to User A`,
      },
    };
  }
  return {
    result: 'REJECTED',
    evidence: {
      request: res.request,
      response: res.response,
      expected,
      actual: `status ${res.response.status} (not a disclosure of User B's data)`,
    },
  };
};
