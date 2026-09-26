import { randomBytes } from 'node:crypto';
import type { Plugin } from 'vite';

const marker = randomBytes(32).toString('hex');
function localRequest(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (!local || typeof host !== 'string' || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) return false;
  return (!origin || origin === 'http://' + host) && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');
}
export function devAuth(): Plugin {
  return {
    name: 'niu-local-dev-auth',
    apply: 'serve',
    configureServer(server) {
      const token = process.env.NIU_ADMIN_TOKENS?.split(',')[0]?.trim();
      if (!token) return;
      server.middlewares.use((req, res, next) => {
        if (req.url === '/__niu_dev_session') {
          res.setHeader('Cache-Control', 'no-store');
          if (!localRequest(req) || req.method !== 'POST' || req.headers['x-niu-dev-session'] !== '1') {
            res.statusCode = 403; res.end(); return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ token: marker })); return;
        }
        if (req.headers.authorization === 'Bearer ' + marker) {
          if (!localRequest(req) || !/^\/(admin|enterprise|v1)(\/|$)/.test(req.url ?? '')) {
            res.statusCode = 403; res.end(); return;
          }
          req.headers.authorization = 'Bearer ' + token;
        }
        next();
      });
    },
  };
}
