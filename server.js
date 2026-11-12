import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authConfig, authenticate, clearFailures, createSession, deleteSession, getSession, isRateLimited, recordFailure } from './auth.js';

const root = new URL('.', import.meta.url);
const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/assets/amplimed-oficial.png', ['docs/saude-integrada/referencias/03_LOGO_AMPLIMED_OFICIAL_FORNECIDO.png', 'image/png']],
  ['/assets/unimed-blumenau.png', ['public/assets/unimed-blumenau-fornecido.png', 'image/png']],
]);

function sendJson(res, status, data, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = '';
  for await (const part of req) {
    body += part;
    if (body.length > 4096) throw new Error('Payload muito grande.');
  }
  return JSON.parse(body);
}

function cookieValue(req, name) {
  const item = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
}

export function createApp({ env = process.env, fetcher = fetch } = {}) {
  const config = authConfig(env);
  const cookieName = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(env.SESSION_COOKIE_NAME || '') ? env.SESSION_COOKIE_NAME : 'painel_session';
  const ttlSeconds = Math.min(86400, Math.max(300, Number(env.SESSION_TTL_SECONDS || 28800)));
  const secure = String(env.SESSION_COOKIE_SECURE).toUpperCase() === 'TRUE' || env.NODE_ENV === 'production';
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

  return async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path === '/api/me' && req.method === 'GET') {
        const user = getSession(cookieValue(req, cookieName));
        sendJson(res, user ? 200 : 401, user ? { user } : { detail: 'Sessão expirada.' });
        return;
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        deleteSession(cookieValue(req, cookieName));
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${cookieName}=; ${cookieAttrs}; Max-Age=0` });
        return;
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) {
          sendJson(res, 415, { detail: 'Envie JSON.' }); return;
        }
        let input;
        try { input = await readJson(req); }
        catch { sendJson(res, 400, { detail: 'Requisição inválida.' }); return; }
        const { usuario, senha } = input || {};
        if (typeof usuario !== 'string' || !usuario.trim() || usuario.length > 100 || typeof senha !== 'string' || !senha || senha.length > 512) {
          sendJson(res, 400, { detail: 'Informe usuário e senha.' }); return;
        }
        const key = `${req.socket.remoteAddress}:${usuario.trim().toLowerCase()}`;
        if (isRateLimited(key)) { sendJson(res, 429, { detail: 'Muitas tentativas. Tente novamente mais tarde.' }); return; }
        let user;
        try { user = await authenticate(usuario, senha, config, fetcher); }
        catch (error) {
          if (error.status === 401) recordFailure(key);
          sendJson(res, error.status === 401 ? 401 : 503, { detail: error.status === 401 ? 'Usuário ou senha inválidos.' : 'Serviço de autenticação indisponível.' });
          return;
        }
        clearFailures(key);
        const token = createSession(user, ttlSeconds);
        sendJson(res, 200, { user }, { 'Set-Cookie': `${cookieName}=${token}; ${cookieAttrs}; Max-Age=${ttlSeconds}` });
        return;
      }
      if (req.method === 'GET' && staticFiles.has(path)) {
        const [file, contentType] = staticFiles.get(path);
        const content = await readFile(new URL(file, root));
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(content);
        return;
      }
      sendJson(res, 404, { detail: 'Não encontrado.' });
    } catch {
      if (!res.headersSent) sendJson(res, 500, { detail: 'Erro interno.' });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.APP_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  createServer(createApp()).listen(port, host, () => console.log(`Painel Amplimed disponível em http://${host}:${port}`));
}
