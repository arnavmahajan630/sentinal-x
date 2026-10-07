import { inconclusive, methodAndPath, substituteId } from './types';
import type { Template } from './types';

function fieldOf(node: string): string | undefined {
  // "Asset:Model.field" -> "field"
  const key = node.split(':')[1];
  return key?.split('.')[1];
}

function findValue(body: unknown, field: string): unknown {
  if (!body || typeof body !== 'object') return undefined;
  const obj = body as Record<string, unknown>;
  if (field in obj) return obj[field];
  // responses that nest the document under a key (e.g. {token, user})
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && field in (v as Record<string, unknown>)) {
      return (v as Record<string, unknown>)[field];
    }
  }
  return undefined;
}

/**
 * data-exposure: call the route as the least-privileged caller who can reach it, and
 * check whether the hypothesis's affected Asset field is present with a real value in
 * the response body.
 */
export const verifyDataExposure: Template = async (client, req) => {
  if (req.subject.kind !== 'route')
    return inconclusive('data-exposure template requires a route subject');
  // affectedNodes is alphabetically sorted — it may list several Asset nodes (e.g.
  // User.apiKey, User.email, User.password) and the FIRST one is not necessarily exposed.
  // Check every Asset node named on the hypothesis; CONFIRMED if any of them is present.
  const fields = req.affectedNodes
    .filter((n) => n.startsWith('Asset:'))
    .map(fieldOf)
    .filter((f): f is string => !!f);
  if (!fields.length) return inconclusive('no Asset node in affectedNodes to check for exposure');

  const { method, path: pathTemplate } = methodAndPath(req.subject.route);
  const victim = await client.seedUser('B');
  const seed = await client.seedData();
  // pick a seeded id of the right kind for the resource the route addresses — an order
  // route needs an Order id, anything else gets User B's id.
  const substitutionId = pathTemplate.startsWith('/api/orders')
    ? seed.orders?.B ?? victim.mongoId
    : victim.mongoId;
  const path = substituteId(pathTemplate, substitutionId);

  // login/register are the two unauthenticated POST targets in this fixture; anything
  // else is a GET reachable with a seeded user's own session.
  const isLoginLike = method === 'POST' && /\/auth\/(login|register)$/.test(pathTemplate);
  const res = isLoginLike
    ? await client.request(
        null,
        method,
        path,
        pathTemplate.endsWith('/login')
          ? { username: victim.username, password: victim.password }
          : { username: `pwn-${Date.now()}`, password: 'whatever123' },
      )
    : await client.request('A', method, path);
  if (!res.allowed) return inconclusive(`${res.reason}: ${res.detail}`);

  const present = fields.filter((field) => {
    const value = findValue(res.response.body, field);
    return value !== undefined && value !== null && value !== '';
  });
  const expected = `none of [${fields.join(', ')}] present in the response`;
  if (present.length) {
    return {
      result: 'CONFIRMED',
      evidence: {
        request: res.request,
        response: res.response,
        expected,
        actual: `[${present.join(', ')}] present in the response body`,
      },
    };
  }
  return {
    result: 'REJECTED',
    evidence: { request: res.request, response: res.response, expected, actual: 'none present' },
  };
};
