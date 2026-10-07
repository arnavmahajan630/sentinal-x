import { inconclusive, methodAndPath, substituteId } from './types';
import type { Template } from './types';

/** missing-auth: call the route with no Authorization header at all. */
export const verifyMissingAuth: Template = async (client, req) => {
  if (req.subject.kind !== 'route')
    return inconclusive('missing-auth template requires a route subject');
  const { method, path: pathTemplate } = methodAndPath(req.subject.route);
  // substitute any :id-style param with a real seeded id (User B) so the route resolves
  // to a real document rather than the literal ":id" placeholder text.
  const victim = await client.seedUser('B');
  const path = substituteId(pathTemplate, victim.mongoId);
  const res = await client.request(null, method, path);
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);

  const expected = '401/403 (no credentials supplied)';
  const hasBody = res.response.body !== undefined && res.response.body !== null && res.response.body !== '';
  if (res.response.status >= 200 && res.response.status < 300 && hasBody) {
    return {
      result: 'CONFIRMED',
      evidence: {
        request: res.request,
        response: res.response,
        expected,
        actual: `${res.response.status} with real data, no credentials required`,
      },
    };
  }
  if (res.response.status === 401 || res.response.status === 403) {
    return {
      result: 'REJECTED',
      evidence: { request: res.request, response: res.response, expected, actual: `${res.response.status}` },
    };
  }
  return inconclusive(`unexpected status ${res.response.status}`);
};
