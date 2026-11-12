import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from './server.js';

const env = {
  ORDS_BASE_URL: 'https://example.test/ords', ORDS_AUTH_PATH: '/Wiki/Auth',
  ORDS_AUTH_METHOD: 'GET', ORDS_AUTHORIZATION: 'test-token',
  SESSION_COOKIE_NAME: 'test_session', SESSION_COOKIE_SECURE: 'FALSE',
};
let server;
let base;
let called = 0;

before(async () => {
  server = createServer(createApp({ env, fetcher: async (url) => {
    called++;
    assert.equal(url.pathname, '/ords/Wiki/Auth');
    assert.equal(url.searchParams.get('Authorization'), 'test-token');
    if (url.searchParams.get('senha') === Buffer.from('senha-correta').toString('base64')) {
      return new Response(JSON.stringify({ Result: 1, Usuario: 'eduardo', Nome: 'Eduardo' }), { status: 200 });
    }
    return new Response(JSON.stringify({ Result: 0 }), { status: 401 });
  } }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));

test('página e sessão exigem autenticação', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Saúde Integrada \| Acesso/);
  assert.match(html, /assets\/amplimed-oficial\.png/);
  assert.match(html, /assets\/unimed-blumenau\.png/);
  assert.match(html, /Entrar com AD/);
  const logo = await fetch(`${base}/assets/amplimed-oficial.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  const unimedLogo = await fetch(`${base}/assets/unimed-blumenau.png`);
  assert.equal(unimedLogo.status, 200);
  const me = await fetch(`${base}/api/me`);
  assert.equal(me.status, 401);
  const protectedPage = await fetch(`${base}/dashboard`, { redirect: 'manual' });
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get('location'), '/');
  assert.equal((await fetch(`${base}/api/dashboard`)).status, 401);
});

test('AD rejeita senha incorreta e cria sessão com senha correta', async () => {
  const login = body => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const wrong = await login({ usuario: 'eduardo', senha: 'incorreta' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('set-cookie'), null);
  const good = await login({ usuario: 'eduardo', senha: 'senha-correta' });
  assert.equal(good.status, 200);
  const cookie = good.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.equal((await good.json()).user.nome, 'Eduardo');
  const me = await fetch(`${base}/api/me`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.login, 'eduardo');
  const dashboard = await fetch(`${base}/dashboard`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Visão Geral/);
  const overview = await fetch(`${base}/api/dashboard`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(overview.status, 200);
  const data = await overview.json();
  assert.equal(data.status, 'awaiting_import');
  assert.equal(data.kpis.medicosUnicos, null);
  assert.deepEqual(data.charts.especialidades, []);
  const clinics = await fetch(`${base}/dashboard/clinicas`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(clinics.status, 200);
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(logout.status, 200);
  const afterLogout = await fetch(`${base}/api/me`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(afterLogout.status, 401);
  assert.equal((await fetch(`${base}/api/dashboard`, { headers: { Cookie: cookie.split(';')[0] } })).status, 401);
  assert.equal((await fetch(`${base}/dashboard`, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' })).status, 302);
  assert.equal(called, 2);
});
