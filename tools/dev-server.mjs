// Local stand-in for Azure Static Web Apps: static files, /.auth sign-in (fake, no password),
// route roles from staticwebapp.config.json and the /api functions with an in-memory member list.
//
//   cd api && npm install && cd ..
//   ADMIN_EMAILS=marco@themacabuhay.com node tools/dev-server.mjs     → http://localhost:4280
//
// For trying the pages only. The real sign-in (Entra External ID, Microsoft) runs on Azure.
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

process.env.MEMBERS_STORE = 'memory';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { routes } = require(join(root, 'api/src/functions/http.js'));
const config = JSON.parse(readFileSync(join(root, 'staticwebapp.config.json'), 'utf8'));
const PORT = +process.env.PORT || 4280;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => c.split('=').map(decodeURIComponent)));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

async function call(route, req, principal, body) {
  const headers = new Map();
  if (principal) headers.set('x-ms-client-principal', b64(principal));
  const request = { headers, json: async () => JSON.parse(body || '{}') };
  const ctx = { error: console.error, log: console.log };
  return route.handler(request, ctx);
}

function matchRule(path) {
  return config.routes.find((r) => (r.route.endsWith('*') ? path.startsWith(r.route.slice(0, -1)) : path === r.route));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  let body = '';
  for await (const chunk of req) body += chunk;
  const principal = cookie(req).swa ? JSON.parse(Buffer.from(cookie(req).swa, 'base64').toString()) : null;
  const roles = principal ? principal.userRoles : ['anonymous'];
  const send = (status, data, type = 'application/json', extra = {}) => {
    res.writeHead(status, { 'Content-Type': type, ...extra });
    res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  };
  const redirect = (to, extra = {}) => { res.writeHead(302, { Location: to, ...extra }); res.end(); };

  // ---- /.auth ----
  const login = path.match(/^\/\.auth\/login\/(\w+)$/);
  if (login) {
    const next = url.searchParams.get('post_login_redirect_uri') || '/';
    if (req.method === 'GET') {
      return send(200, `<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;max-width:380px;margin:60px auto">
        <h2>Fake ${login[1]} sign-in (local only)</h2><form method=post>
        <p><label>Email<br><input name=email type=email required style="width:100%"></label></p>
        <p><label>Name<br><input name=name style="width:100%"></label></p>
        <button>Sign in</button></form>`, 'text/html');
    }
    const form = new URLSearchParams(body);
    const email = form.get('email'); const name = form.get('name') || email.split('@')[0];
    const p = { identityProvider: login[1], userId: 'dev-' + email, userDetails: email, claims: [{ typ: 'name', val: name }, { typ: 'email', val: email }] };
    const r = await call(routes.find((x) => x.name === 'GetRoles'), req, null, JSON.stringify(p));
    p.userRoles = ['anonymous', 'authenticated', ...r.jsonBody.roles];
    return redirect(next, { 'Set-Cookie': `swa=${b64(p)}; Path=/; HttpOnly` });
  }
  if (path === '/.auth/logout') return redirect(url.searchParams.get('post_logout_redirect_uri') || '/', { 'Set-Cookie': 'swa=; Path=/; Max-Age=0' });
  if (path === '/.auth/me') return send(200, { clientPrincipal: principal && { identityProvider: principal.identityProvider, userId: principal.userId, userDetails: principal.userDetails, userRoles: principal.userRoles } });

  // ---- route roles ----
  const rule = matchRule(path);
  if (rule && rule.statusCode) return send(rule.statusCode, 'Not found', 'text/plain');
  if (rule && rule.allowedRoles && !rule.allowedRoles.some((r) => roles.includes(r))) {
    const code = principal ? 403 : 401;
    const o = config.responseOverrides[String(code)];
    return o && o.redirect ? redirect(o.redirect) : send(code, { error: code });
  }

  // ---- api ----
  if (path.startsWith('/api/')) {
    const route = routes.find((r) => r.route === path.slice(5) && r.methods.includes(req.method));
    if (!route) return send(404, { error: 'No such API' });
    const out = await call(route, req, principal, body);
    return send(out.status || 200, out.jsonBody ?? out.body ?? '', 'application/json');
  }

  // ---- static ----
  let file = join(root, decodeURIComponent(path));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(root) || !existsSync(file)) return send(404, 'Not found', 'text/plain');
  send(200, readFileSync(file), TYPES[extname(file)] || 'application/octet-stream');
}).listen(PORT, () => console.log(`Macabuhay dev server on http://localhost:${PORT}`));
