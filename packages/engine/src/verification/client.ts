import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Config } from '../config';
import { guardedFetch } from './guard';
import type { GuardResult } from './guard';

export interface SeedUser {
  id: string;
  username: string;
  password: string;
  role: string;
  /** Mongo _id, pinned in sandbox/seed-users.json and inserted verbatim by sandbox/seed.ts */
  mongoId: string;
}
export interface SeedOrders {
  [seedUserId: string]: string;
}
export interface SeedData {
  users: SeedUser[];
  orders?: SeedOrders;
}

let cachedSeed: { path: string; data: SeedData } | undefined;

async function loadSeedData(seedUsersPath: string): Promise<SeedData> {
  if (cachedSeed?.path === seedUsersPath) return cachedSeed.data;
  const abs = path.isAbsolute(seedUsersPath)
    ? seedUsersPath
    : path.resolve(process.cwd(), seedUsersPath);
  const raw = await fs.readFile(abs, 'utf8');
  const data = JSON.parse(raw) as SeedData;
  cachedSeed = { path: seedUsersPath, data };
  return data;
}

/**
 * Sandbox HTTP client for the Verification Engine. Logs in seeded users (A/B/admin) and
 * issues requests on their behalf through the guard. One instance per verify() call — no
 * token caching across runs.
 */
export class SandboxClient {
  private tokens = new Map<string, string>();
  private seed?: SeedData;

  constructor(
    private cfg: Config,
    private projectId: string,
  ) {}

  async seedData(): Promise<SeedData> {
    return (this.seed ??= await loadSeedData(this.cfg.sandbox.seedUsersPath));
  }

  async seedUser(userId: string): Promise<SeedUser> {
    const seed = await this.seedData();
    const user = seed.users.find((u) => u.id === userId);
    if (!user) throw new Error(`no seed user "${userId}" in ${this.cfg.sandbox.seedUsersPath}`);
    return user;
  }

  async login(userId: string): Promise<{ token: string } | { error: string }> {
    const cached = this.tokens.get(userId);
    if (cached) return { token: cached };
    const user = await this.seedUser(userId);
    const res = await guardedFetch(this.cfg, this.projectId, 'POST', '/api/auth/login', {
      body: { username: user.username, password: user.password },
    });
    if (!res.allowed) return { error: `login refused: ${res.reason} (${res.detail})` };
    const token = (res.response.body as { token?: string } | undefined)?.token;
    if (res.response.status !== 200 || !token) {
      return { error: `login failed: status ${res.response.status}` };
    }
    this.tokens.set(userId, token);
    return { token };
  }

  /** `userId: null` sends no Authorization header (for missing-auth checks). */
  async request(
    userId: string | null,
    method: string,
    requestPath: string,
    body?: unknown,
  ): Promise<GuardResult> {
    const headers: Record<string, string> = {};
    if (userId !== null) {
      const auth = await this.login(userId);
      if ('error' in auth) {
        return { allowed: false, reason: 'network_error', detail: auth.error };
      }
      headers.authorization = `Bearer ${auth.token}`;
    }
    return guardedFetch(this.cfg, this.projectId, method, requestPath, { headers, body });
  }
}
