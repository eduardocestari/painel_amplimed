import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from './server.js';

const env = {
  ORDS_BASE_URL: 'https://example.test/ords', ORDS_AUTH_PATH: '/Wiki/Auth',
  ORDS_AUTH_METHOD: 'GET', ORDS_AUTHORIZATION: 'test-token',
  SESSION_COOKIE_NAME: 'test_session', SESSION_COOKIE_SECURE: 'FALSE',
  SAUDE_INTEGRADA_IMPORT_LOGINS: 'eduardo',
};
let server;
let base;
let called = 0;
let imported = 0;

before(async () => {
  server = createServer(createApp({ env, imports: {
    list: async () => [],
    simulate: async () => { imported++; return { lote: { resultado: 'VALIDADO' }, preview: [], persistenceAvailable: false }; },
  }, fetcher: async (url) => {
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
  assert.doesNotMatch(html, /Sua autenticação corporativa foi confirmada/);
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
  for (const path of ['/api/clinicas', '/api/clinicas/detalhe', '/api/usuarios', '/api/usuarios/detalhe']) {
    assert.equal((await fetch(`${base}${path}`)).status, 401);
  }
  assert.equal((await fetch(`${base}/api/importacoes`)).status, 401);
  assert.equal((await fetch(`${base}/api/importacoes/simular`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${base}/dashboard/usuarios`, { redirect: 'manual' })).status, 302);
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
  const home = await fetch(base, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' });
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/dashboard');
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
  const usersPage = await fetch(`${base}/dashboard/usuarios`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(usersPage.status, 200);
  const importsPage = await fetch(`${base}/dashboard/importacoes`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(importsPage.status, 200);
  assert.match(await importsPage.text(), /Simular arquivo XLSX/);
  const clinicsData = await fetch(`${base}/api/clinicas`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(clinicsData.status, 200);
  assert.equal((await clinicsData.json()).status, 'awaiting_import');
  const usersData = await fetch(`${base}/api/usuarios`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(usersData.status, 200);
  assert.equal((await usersData.json()).status, 'awaiting_import');
  const badQuery = await fetch(`${base}/api/usuarios?page=0`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(badQuery.status, 400);
  const importHeaders = { Cookie: cookie.split(';')[0], Origin: base,
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-File-Name': 'dados.xlsx' };
  const importHistory = await fetch(`${base}/api/importacoes`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(importHistory.status, 200);
  assert.deepEqual((await importHistory.json()).history, []);
  assert.equal((await fetch(`${base}/api/importacoes/simular`, { method: 'POST', headers: { ...importHeaders, Origin: 'https://outro.test' }, body: 'dados' })).status, 403);
  assert.equal((await fetch(`${base}/api/importacoes/simular`, { method: 'POST', headers: { ...importHeaders, 'Content-Type': 'text/plain' }, body: 'dados' })).status, 415);
  const simulation = await fetch(`${base}/api/importacoes/simular`, { method: 'POST', headers: importHeaders, body: 'dados' });
  assert.equal(simulation.status, 200);
  assert.equal((await simulation.json()).persistenceAvailable, false);
  assert.equal(imported, 1);
  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(logout.status, 200);
  const afterLogout = await fetch(`${base}/api/me`, { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(afterLogout.status, 401);
  assert.equal((await fetch(`${base}/api/dashboard`, { headers: { Cookie: cookie.split(';')[0] } })).status, 401);
  assert.equal((await fetch(`${base}/dashboard`, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' })).status, 302);
  assert.equal(called, 2);
});
