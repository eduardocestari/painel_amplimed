import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authConfig, authenticate, clearFailures, createSession, deleteSession, getSession, isRateLimited, recordFailure } from './auth.js';
import { getDashboardOverview } from './internal/dashboard.js';
import { createRegistry } from './internal/registry.js';
import { createImportService, importConfig } from './internal/import-service.js';

const root = new URL('.', import.meta.url);
const dashboardRoutes = new Set(['/dashboard', '/dashboard/clinicas', '/dashboard/usuarios', '/dashboard/importacoes']);
const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/dashboard.css', ['public/dashboard.css', 'text/css; charset=utf-8']],
  ['/dashboard.js', ['public/dashboard.js', 'text/javascript; charset=utf-8']],
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

async function readBinary(req, maxBytes) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('Arquivo acima do tamanho permitido.'), { status: 413 });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Arquivo acima do tamanho permitido.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function cookieValue(req, name) {
  const item = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : null;
}

export function createApp({ env = process.env, fetcher = fetch, registry = createRegistry(), imports = createImportService() } = {}) {
  const config = authConfig(env);
  const importSettings = importConfig(env);
  const cookieName = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(env.SESSION_COOKIE_NAME || '') ? env.SESSION_COOKIE_NAME : 'painel_session';
  const ttlSeconds = Math.min(86400, Math.max(300, Number(env.SESSION_TTL_SECONDS || 28800)));
  const secure = String(env.SESSION_COOKIE_SECURE).toUpperCase() === 'TRUE' || env.NODE_ENV === 'production';
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  const personalViewers = new Set(String(env.SAUDE_INTEGRADA_PII_LOGINS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));

  return async (req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    const path = requestUrl.pathname;
    try {
      if (path === '/api/me' && req.method === 'GET') {
        const user = getSession(cookieValue(req, cookieName));
        sendJson(res, user ? 200 : 401, user ? { user } : { detail: 'Sessão expirada.' });
        return;
      }
      if (path === '/api/dashboard' && req.method === 'GET') {
        const user = getSession(cookieValue(req, cookieName));
        if (!user) { sendJson(res, 401, { detail: 'Sessão expirada.' }); return; }
        sendJson(res, 200, getDashboardOverview());
        return;
      }
      if (req.method === 'GET' && ['/api/clinicas', '/api/clinicas/detalhe', '/api/usuarios', '/api/usuarios/detalhe'].includes(path)) {
        const user = getSession(cookieValue(req, cookieName));
        if (!user) { sendJson(res, 401, { detail: 'Sessão expirada.' }); return; }
        let data;
        if (path === '/api/clinicas') data = await registry.listClinics(requestUrl.searchParams);
        else if (path === '/api/clinicas/detalhe') data = await registry.clinicDetail(requestUrl.searchParams);
        else if (path === '/api/usuarios') data = await registry.listUsers(requestUrl.searchParams);
        else data = await registry.userDetail(requestUrl.searchParams.get('id'), { canViewPersonal: personalViewers.has(user.login.toLowerCase()) });
        sendJson(res, data ? 200 : 404, data || { detail: 'Registro não encontrado.' });
        return;
      }
      if (path === '/api/importacoes' && req.method === 'GET') {
        const user = getSession(cookieValue(req, cookieName));
        if (!user) { sendJson(res, 401, { detail: 'Sessão expirada.' }); return; }
        if (!importSettings.logins.has(user.login.toLowerCase())) { sendJson(res, 403, { detail: 'Sem permissão para importações.' }); return; }
        sendJson(res, 200, { history: await imports.list(), maxBytes: importSettings.maxBytes,
          allowedExtension: importSettings.allowedExtension, persistenceAvailable: false });
        return;
      }
      if (path === '/api/importacoes/simular' && req.method === 'POST') {
        const user = getSession(cookieValue(req, cookieName));
        if (!user) { sendJson(res, 401, { detail: 'Sessão expirada.' }); return; }
        if (!importSettings.logins.has(user.login.toLowerCase())) { sendJson(res, 403, { detail: 'Sem permissão para importações.' }); return; }
        let originAllowed = true;
        try { if (req.headers.origin) originAllowed = new URL(req.headers.origin).host === req.headers.host; }
        catch { originAllowed = false; }
        if (!originAllowed) {
          sendJson(res, 403, { detail: 'Origem não permitida.' }); return;
        }
        if (req.headers['content-type']?.split(';')[0] !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          sendJson(res, 415, { detail: 'Envie um arquivo XLSX.' }); return;
        }
        let fileName;
        try { fileName = decodeURIComponent(String(req.headers['x-file-name'] || '')); }
        catch { sendJson(res, 400, { detail: 'Nome do arquivo inválido.' }); return; }
        const buffer = await readBinary(req, importSettings.maxBytes);
        const result = await imports.simulate({ buffer, fileName, user, maxBytes: importSettings.maxBytes });
        sendJson(res, 200, result);
        return;
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        deleteSession(cookieValue(req, cookieName));
        sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${cookieName}=; ${cookieAttrs}; Max-Age=0` });
        return;
      }
      if (req.method === 'GET' && dashboardRoutes.has(path)) {
        const user = getSession(cookieValue(req, cookieName));
        if (!user) { res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' }); res.end(); return; }
        const content = await readFile(new URL('public/dashboard.html', root));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(content);
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
      if (path === '/' && req.method === 'GET' && getSession(cookieValue(req, cookieName))) {
        res.writeHead(302, { Location: '/dashboard', 'Cache-Control': 'no-store' });
        res.end();
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
    } catch (error) {
      const status = [400, 413, 422].includes(error?.status) ? error.status : 500;
      if (!res.headersSent) sendJson(res, status,
        { detail: status === 400 ? 'Parâmetros de consulta inválidos.' : status === 413 ? 'Arquivo acima do tamanho permitido.'
          : status === 422 ? error.message : 'Erro interno.', ...(status === 422 ? { code: error.code } : {}) });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.APP_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  createServer(createApp()).listen(port, host, () => console.log(`Painel Amplimed disponível em http://${host}:${port}`));
}
