import { inconclusive, methodAndPath, substituteId } from './types';
import type { Template } from './types';

/** bfla: call an admin-guarded route as a non-admin seeded user. */
export const verifyBfla: Template = async (client, req) => {
  if (req.subject.kind !== 'route') return inconclusive('bfla template requires a route subject');
  const { method, path: pathTemplate } = methodAndPath(req.subject.route);
  const victim = await client.seedUser('B');
  const path = substituteId(pathTemplate, victim.mongoId);
  const res = await client.request('A', method, path);
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);

  const expected = '403 (User A is not an admin)';
  if (res.response.status >= 200 && res.response.status < 300) {
    return {
      result: 'CONFIRMED',
      evidence: {
        request: res.request,
        response: res.response,
        expected,
        actual: `${res.response.status} (non-admin reached a privileged route)`,
      },
    };
  }
  if (res.response.status === 403) {
    return {
      result: 'REJECTED',
      evidence: { request: res.request, response: res.response, expected, actual: '403' },
    };
  }
  return inconclusive(`unexpected status ${res.response.status}`);
};
