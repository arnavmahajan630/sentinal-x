import { inconclusive, methodAndPath } from './types';
import type { Template } from './types';

/**
 * nosql-injection: baseline a real username with a deliberately wrong password (expect a
 * clean rejection), then retry with a Mongo operator payload in place of the password
 * (`{"$ne": null}`). CONFIRMED when the operator payload bypasses the check the baseline
 * correctly enforced.
 */
export const verifyNosqlInjection: Template = async (client, req) => {
  if (req.subject.kind !== 'route')
    return inconclusive('nosql-injection template requires a route subject');
  const { method, path } = methodAndPath(req.subject.route);
  const seed = await client.seedUser('A');

  const baseline = await client.request(null, method, path, {
    username: seed.username,
    password: `${seed.password}-definitely-wrong`,
  });
  if (!baseline.allowed) return inconclusive(`${baseline.reason}: ${baseline.detail}`);

  const injected = await client.request(null, method, path, {
    username: seed.username,
    password: { $ne: null },
  });
  if (!injected.allowed) return inconclusive(`${injected.reason}: ${injected.detail}`);

  const expected = '401 (same rejection as the baseline)';
  const baselineRejected = baseline.response.status === 401;
  const injectionSucceeded =
    injected.response.status === 200 && !!(injected.response.body as { token?: string })?.token;

  if (baselineRejected && injectionSucceeded) {
    return {
      result: 'CONFIRMED',
      evidence: {
        request: injected.request,
        response: injected.response,
        expected,
        actual: '200 + token (operator payload bypassed the password check)',
      },
    };
  }
  if (!injectionSucceeded) {
    return {
      result: 'REJECTED',
      evidence: {
        request: injected.request,
        response: injected.response,
        expected,
        actual: `status ${injected.response.status} (operator payload did not bypass)`,
      },
    };
  }
  return inconclusive(
    `baseline did not reject as expected (status ${baseline.response.status})`,
  );
};
