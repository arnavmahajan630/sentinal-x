import { SECRET_NAME_RE } from '../graph/sensitivity';
import { bus, EVENTS_CHANNEL } from '../bus';
import { models } from '../db/collections';
import type { Config } from '../config';

export interface GuardRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}
export interface GuardResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}
export interface GuardAllowed {
  allowed: true;
  request: GuardRequest;
  response: GuardResponse;
  durationMs: number;
}
export type GuardRefuseReason =
  | 'verification_disabled'
  | 'no_target_configured'
  | 'host_mismatch'
  | 'network_error';
export interface GuardRefused {
  allowed: false;
  reason: GuardRefuseReason;
  detail: string;
}
export type GuardResult = GuardAllowed | GuardRefused;

/** redact one level of an object's keys whose name looks like a secret/credential. */
function redactShallow(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_NAME_RE.test(k) ? '***' : v;
  }
  return out;
}

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = k.toLowerCase() === 'authorization' ? 'Bearer ***' : v;
  }
  return out;
}

async function refuse(
  projectId: string,
  reason: GuardRefuseReason,
  detail: string,
  attemptedUrl: string,
): Promise<GuardRefused> {
  await models.security_events.create({
    projectId,
    ts: new Date(),
    type: 'verification.guard_refused',
    summary: `verification refused: ${reason}`,
    reason,
    detail,
    attemptedUrl,
  });
  bus.publish(EVENTS_CHANNEL, {
    kind: 'verification.guard_refused',
    projectId,
    reason,
    detail,
  });
  return { allowed: false, reason, detail };
}

/**
 * The single gateway for every outbound HTTP call the Verification Engine makes.
 * Refuses (and logs) any request whose host is not the configured sandbox target, and
 * refuses everything when verification is disabled or no target is configured. Never
 * throws. Redacts Authorization headers and secret-looking body/header keys in whatever
 * it returns — application data (passwords, card numbers) is left intact, since that is
 * the proof a Finding needs.
 */
export async function guardedFetch(
  cfg: Config,
  projectId: string,
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<GuardResult> {
  if (!cfg.sandbox.verificationEnabled) {
    return refuse(projectId, 'verification_disabled', 'VERIFICATION_ENABLED is false', path);
  }
  if (!cfg.sandbox.targetUrl) {
    return refuse(projectId, 'no_target_configured', 'SANDBOX_TARGET_URL is unset', path);
  }

  let target: URL;
  let targetHost: string;
  try {
    targetHost = new URL(cfg.sandbox.targetUrl).host;
    target = new URL(path, cfg.sandbox.targetUrl);
  } catch {
    return refuse(projectId, 'host_mismatch', `could not resolve "${path}" against the sandbox target`, path);
  }
  if (target.host !== targetHost) {
    return refuse(projectId, 'host_mismatch', `request host "${target.host}" is not the sandbox host "${targetHost}"`, target.toString());
  }

  const headers: Record<string, string> = { 'content-type': 'application/json', ...init.headers };
  const request: GuardRequest = {
    method,
    url: target.toString(),
    headers: redactHeaders(headers),
    body: init.body !== undefined ? redactShallow(init.body) : undefined,
  };

  const started = Date.now();
  try {
    const res = await fetch(target, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const durationMs = Date.now() - started;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (resHeaders[k] = v));
    let body: unknown = undefined;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }
    const response: GuardResponse = { status: res.status, headers: resHeaders, body };
    return { allowed: true, request, response, durationMs };
  } catch (err) {
    return {
      allowed: false,
      reason: 'network_error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
