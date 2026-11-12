import { randomBytes } from 'node:crypto';

const sessions = new Map();
const attempts = new Map();

export function authConfig(env = process.env) {
  const baseUrl = String(env.ORDS_BASE_URL || '').trim();
  const path = String(env.ORDS_AUTH_PATH || '/Wiki/Auth').trim();
  const authorization = String(env.ORDS_AUTHORIZATION || '').trim();
  const method = String(env.ORDS_AUTH_METHOD || 'GET').toUpperCase();
  if (!baseUrl || !authorization || !['GET', 'POST'].includes(method)) {
    throw new Error('Configuração AD/ORDS incompleta.');
  }
  const url = new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('ORDS_BASE_URL deve usar HTTPS.');
  }
  return { url, authorization, method, timeoutMs: Math.min(30000, Math.max(1000, Number(env.ORDS_TIMEOUT_SECONDS || 30) * 1000)) };
}

export async function authenticate(usuario, senha, config = authConfig(), fetcher = fetch) {
  const params = new URLSearchParams({ usuario: usuario.trim(), senha: Buffer.from(senha, 'utf8').toString('base64'), Authorization: config.authorization });
  const url = new URL(config.url);
  const options = { method: config.method, signal: AbortSignal.timeout(config.timeoutMs), cache: 'no-store' };
  if (config.method === 'GET') url.search = params.toString();
  else { options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; options.body = params.toString(); }
  let response;
  try { response = await fetcher(url, options); }
  catch { throw Object.assign(new Error('Serviço de autenticação indisponível.'), { status: 503 }); }
  let data;
  try { data = await response.json(); } catch { data = null; }
  if ((response.status !== 200 && response.status !== 401) || !data || data.autorizado === 'false') {
    throw Object.assign(new Error('Serviço de autenticação indisponível.'), { status: 503 });
  }
  if (response.status === 401 || (data.Result !== 1 && data.Result !== '1')) {
    throw Object.assign(new Error('Usuário ou senha inválidos.'), { status: 401 });
  }
  return { login: typeof data.Usuario === 'string' && data.Usuario.trim() ? data.Usuario.trim() : usuario.trim(),
    nome: typeof data.Nome === 'string' && data.Nome.trim() ? data.Nome.trim() : null };
}

export function isRateLimited(key) {
  const now = Date.now();
  const state = attempts.get(key);
  if (!state || now - state.since > 15 * 60_000) { attempts.delete(key); return false; }
  return state.count >= 5;
}

export function recordFailure(key) {
  const now = Date.now();
  const state = attempts.get(key);
  attempts.set(key, !state || now - state.since > 15 * 60_000 ? { since: now, count: 1 } : { ...state, count: state.count + 1 });
}

export function clearFailures(key) { attempts.delete(key); }

export function createSession(user, ttlSeconds) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, { user, expires: Date.now() + ttlSeconds * 1000 });
  return token;
}

export function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires <= Date.now()) { sessions.delete(token); return null; }
  return session.user;
}

export function deleteSession(token) { sessions.delete(token); }
