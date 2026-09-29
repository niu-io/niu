import { createServer, type AddressInfo, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { devAuth } from '../dev-auth';

type Middleware = (req: IncomingMessage, res: ServerResponse, next: (error?: Error) => void) => void;

const environmentNames = ['NIU_ADMIN_TOKENS', 'NIU_DEV_BASE', 'NIU_DEV_USERNAME', 'NIU_DEV_PASSWORD'] as const;
const originalEnvironment = new Map<string, string | undefined>();
let server: Server | undefined;
let origin = '';

async function startAuthServer() {
  let middleware: Middleware | undefined;
  const plugin = devAuth();
  if (typeof plugin.configureServer !== 'function') throw new Error('Expected the local dev auth plugin to configure Vite');
  plugin.configureServer({
    middlewares: { use: (handler: Middleware) => { middleware = handler; } },
  } as never);
  if (!middleware) throw new Error('Expected the local dev auth middleware to be installed');

  server = createServer((request, response) => {
    middleware!(request, response, () => {
      response.statusCode = 200;
      response.end('vite');
    });
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
}

async function signIn(username = 'dev-user', password = 'correct-local-password') {
  return fetch(`${origin}/niu/login/session`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'x-niu-dev-login': '1',
    },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  });
}

beforeEach(() => {
  for (const name of environmentNames) originalEnvironment.set(name, process.env[name]);
  process.env.NIU_ADMIN_TOKENS = 'test-bootstrap-token';
  process.env.NIU_DEV_BASE = '/niu/';
  process.env.NIU_DEV_USERNAME = 'dev-user';
  process.env.NIU_DEV_PASSWORD = 'correct-local-password';
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    server = undefined;
  }
  for (const name of environmentNames) {
    const value = originalEnvironment.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnvironment.clear();
});

describe('local development sign-in', () => {
  it('redirects signed-out console navigation to the normal login page', async () => {
    await startAuthServer();

    const home = await fetch(`${origin}/niu/workspaces/default/`, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });
    expect(home.status).toBe(302);
    expect(home.headers.get('location')).toBe('/niu/login');

    const login = await fetch(`${origin}/niu/login`);
    const markup = await login.text();
    expect(login.status).toBe(200);
    expect(markup).toContain('Sign in to Niu');
    expect(markup).toContain('value="dev-user"');
  });

  it('does not issue the development admin marker before password sign-in', async () => {
    await startAuthServer();

    const response = await fetch(`${origin}/__niu_dev_session`, {
      method: 'POST',
      headers: { 'x-niu-dev-session': '1' },
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  it('rejects invalid credentials without setting a browser session', async () => {
    await startAuthServer();

    const response = await signIn('dev-user', 'wrong-password');
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('issues an HttpOnly session after sign-in and binds the admin marker to it', async () => {
    await startAuthServer();

    const response = await signIn();
    const setCookie = response.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';', 1)[0];
    expect(response.status).toBe(204);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Max-Age=28800');
    expect(cookie).toMatch(/^niu_dev_session=[a-f0-9]{64}$/);

    const session = await fetch(`${origin}/niu/__niu_dev_session`, {
      method: 'POST',
      headers: { cookie, 'x-niu-dev-session': '1' },
    });
    const body = await session.json() as { token?: string };
    expect(session.status).toBe(200);
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);

    const home = await fetch(`${origin}/niu/workspaces/default/`, {
      headers: { accept: 'text/html', cookie },
      redirect: 'manual',
    });
    expect(home.status).toBe(200);

    const login = await fetch(`${origin}/niu/login`, { headers: { cookie }, redirect: 'manual' });
    expect(login.status).toBe(302);
    expect(login.headers.get('location')).toBe('/niu/workspaces/default/');

    const markerWithoutCookie = await fetch(`${origin}/admin/v1/session`, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(markerWithoutCookie.status).toBe(401);

    const markerWithCookie = await fetch(`${origin}/admin/v1/session`, {
      headers: { authorization: `Bearer ${body.token}`, cookie },
    });
    expect(markerWithCookie.status).toBe(200);
  });
});
