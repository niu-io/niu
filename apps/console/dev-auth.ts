import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const marker = randomBytes(32).toString('hex');
const basePrefix = (process.env.NIU_DEV_BASE ?? '/').replace(/\/+$/, '');
const brandMark = readFileSync(new URL('../../branding/assets/niu-mark.png', import.meta.url));
function routePath(url: string | undefined) {
  const path = (url ?? '/').split('?', 1)[0];
  return basePrefix && (path === basePrefix || path.startsWith(`${basePrefix}/`)) ? path.slice(basePrefix.length) || '/' : path;
}
function localRequest(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }, sameOrigin = true) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (!local || typeof host !== 'string' || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) return false;
  return (!origin || origin === 'http://' + host) && (!sameOrigin || !req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');
}

function loginPage() {
  const loginPath = `${basePrefix}/login/session` || '/login/session';
  const markPath = `${basePrefix}/__niu_dev_mark.png`;
  const homePath = `${basePrefix}/workspaces/default/`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Sign in · Niu Console</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #303844;
      background: #f5f7f9;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      --surface: #fff;
      --border: #dce2e8;
      --muted: #66717e;
      --primary: #343d4a;
    }
    * { box-sizing: border-box; }
    body {
      display: grid;
      min-width: 320px;
      min-height: 100vh;
      min-height: 100svh;
      place-items: center;
      margin: 0;
      padding: 24px;
      background: #f5f7f9;
    }
    .login-card {
      width: min(100%, 380px);
      padding: 30px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--surface);
      box-shadow: 0 14px 38px rgb(24 39 56 / 7%);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 37px;
    }
    .brand-mark {
      width: 29px;
      height: 29px;
      flex: 0 0 29px;
      background: var(--primary);
      -webkit-mask: url(${JSON.stringify(markPath)}) center / contain no-repeat;
      mask: url(${JSON.stringify(markPath)}) center / contain no-repeat;
    }
    .brand-name { color: #303844; font-size: 17px; font-weight: 700; letter-spacing: -.045em; }
    .brand-product { color: var(--muted); font-size: 13px; font-weight: 500; }
    .environment {
      margin-left: auto;
      padding: 4px 7px;
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
    }
    h1 { margin: 0; font-size: 24px; font-weight: 650; letter-spacing: -.04em; line-height: 1.2; }
    .intro { margin: 8px 0 27px; color: var(--muted); font-size: 14px; line-height: 1.5; }
    label { display: grid; gap: 7px; margin: 17px 0 0; color: #414b57; font-size: 13px; font-weight: 600; }
    input {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 7px;
      outline: none;
      color: #303844;
      background: #fff;
      font: inherit;
      font-size: 14px;
      font-weight: 400;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    input:focus-visible { border-color: #68798d; box-shadow: 0 0 0 3px rgb(52 61 74 / 12%); }
    button {
      width: 100%;
      height: 44px;
      margin-top: 23px;
      border: 0;
      border-radius: 7px;
      color: #fff;
      background: var(--primary);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: background-color 120ms ease, opacity 120ms ease;
    }
    button:hover:not(:disabled) { background: #252d38; }
    button:focus-visible { outline: 3px solid rgb(52 61 74 / 25%); outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: .72; }
    #error { margin: 12px 0 0; color: #a33431; font-size: 13px; line-height: 1.4; }
    #error:empty { display: none; }
    @media (max-width: 420px) {
      body { padding: 16px; }
      .login-card { padding: 26px 22px; }
    }
  </style>
</head>
<body>
  <main class="login-card" aria-labelledby="login-heading">
    <div class="brand" aria-label="Niu Console">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">niu.io</span>
      <span class="brand-product">Console</span>
      <span class="environment">Development</span>
    </div>
    <h1 id="login-heading">Sign in to Niu</h1>
    <p class="intro">Use your Niu development account.</p>
    <form id="login" autocomplete="on">
      <label>Username<input name="username" value="niu" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Sign in</button>
      <p id="error" role="status" aria-live="polite"></p>
    </form>
  </main>
  <script>
    const form = document.querySelector('#login');
    const error = document.querySelector('#error');
    const button = form.querySelector('button');
    const idleLabel = button.textContent;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      error.textContent = '';
      button.disabled = true;
      button.textContent = 'Signing in…';
      const data = new FormData(form);
      const username = String(data.get('username') || '');
      const password = String(data.get('password') || '');
      try {
        const response = await fetch(${JSON.stringify(loginPath)}, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Niu-Dev-Login': '1' },
          body: JSON.stringify({ username, password }),
          cache: 'no-store',
        });
        if (!response.ok) {
          error.textContent = response.status === 401
            ? 'That username or password did not match.'
            : 'Sign-in failed. Try again.';
          button.disabled = false;
          button.textContent = idleLabel;
          return;
        }
        location.replace(${JSON.stringify(homePath)});
      } catch {
        error.textContent = 'Could not reach the sign-in service.';
        button.disabled = false;
        button.textContent = idleLabel;
      }
    });
  </script>
</body>
</html>`;
}

export function devAuth(): Plugin {
  return {
    name: 'niu-local-dev-auth',
    apply: 'serve',
    configureServer(server) {
      const token = process.env.NIU_ADMIN_TOKENS?.split(',')[0]?.trim();
      if (!token) return;
      server.middlewares.use((req, res, next) => {
        const path = routePath(req.url);
        if (path === '/__niu_dev_mark.png' && req.method === 'GET') {
          if (!localRequest(req, false)) {
            res.statusCode = 403; res.end(); return;
          }
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Content-Type', 'image/png');
          res.end(brandMark); return;
        }
        if (path === '/login' && req.method === 'GET') {
          res.setHeader('Cache-Control', 'no-store');
          if (!localRequest(req, false)) {
            res.statusCode = 403; res.end(); return;
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(loginPage()); return;
        }
        if (path === '/login/session') {
          res.setHeader('Cache-Control', 'no-store');
          if (!localRequest(req) || req.method !== 'POST' || req.headers['x-niu-dev-login'] !== '1') {
            res.statusCode = 405; res.end(); return;
          }
          let body = '';
          let oversized = false;
          req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 4096) oversized = true;
          });
          req.on('end', () => {
            if (oversized) { res.statusCode = 413; res.end(); return; }
            try {
              const credentials = JSON.parse(body) as { username?: unknown; password?: unknown };
              const username = process.env.NIU_DEV_USERNAME ?? 'niu';
              const password = process.env.NIU_DEV_PASSWORD ?? '';
              const supplied = Buffer.from(typeof credentials.password === 'string' ? credentials.password : '');
              const expected = Buffer.from(password);
              const validPassword = expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
              if (credentials.username !== username || !validPassword) {
                res.statusCode = 401;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid username or password.' }));
                return;
              }
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 400; res.end();
            }
          });
          return;
        }
        if (path === '/__niu_dev_session') {
          res.setHeader('Cache-Control', 'no-store');
          if (!localRequest(req) || req.method !== 'POST' || req.headers['x-niu-dev-session'] !== '1') {
            res.statusCode = 403; res.end(); return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ token: marker })); return;
        }
        if (req.headers.authorization === 'Bearer ' + marker) {
          if (!localRequest(req) || !/^\/(admin|enterprise|v1)(\/|$)/.test(path)) {
            res.statusCode = 403; res.end(); return;
          }
          req.headers.authorization = 'Bearer ' + token;
        }
        next();
      });
    },
  };
}
