const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('pt-BR');
const percentNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const palette = ['#00975f', '#7dcc47', '#965be6', '#c3a3f6', '#839df1', '#d7e0e4'];
const routes = {
  '/dashboard': { key: 'overview', title: 'Visão Geral' },
  '/dashboard/clinicas': { key: 'clinicas', title: 'Clínicas' },
  '/dashboard/usuarios': { key: 'usuarios', title: 'Usuários' },
  '/dashboard/importacoes': { key: 'importacoes', title: 'Importações', message: 'A validação e o histórico de importações serão adicionados na etapa 04.' },
};
const route = routes[location.pathname] || routes['/dashboard'];

function displayName(user) {
  const name = String(user.nome || user.login || '').trim();
  return name || 'Usuário';
}

function applyUser(user) {
  const name = displayName(user);
  $('user-name').textContent = name;
  $('user-avatar').textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR');
  $('greeting-name').textContent = name.split(/\s+/)[0];
}

function alertMessage(text) {
  $('global-message').textContent = text;
  $('global-message').hidden = !text;
}

function setMetric(valueId, noteId, value, note) {
  $(valueId).textContent = value;
  $(noteId).textContent = note;
}

function state(container, message) {
  container.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.className = 'chart-state';
  paragraph.textContent = message;
  container.append(paragraph);
}

function renderClinicChart(rows) {
  const target = $('clinics-chart');
  const items = (Array.isArray(rows) ? rows : []).filter(item => item && typeof item.clinica === 'string' && Number.isFinite(item.medicosUnicos) && item.medicosUnicos >= 0).slice(0, 5);
  if (!items.length) { state(target, 'Os dados aparecerão após uma importação concluída.'); return; }
  target.replaceChildren();
  const list = document.createElement('div');
  list.className = 'bar-list';
  const max = Math.max(1, ...items.map(item => item.medicosUnicos));
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const label = document.createElement('span');
    label.className = 'bar-label';
    label.title = item.clinica;
    label.textContent = item.clinica;
    const track = document.createElement('span');
    track.className = 'bar-track';
    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    fill.style.width = `${item.medicosUnicos / max * 100}%`;
    track.append(fill);
    const value = document.createElement('strong');
    value.textContent = number.format(item.medicosUnicos);
    row.append(label, track, value);
    list.append(row);
  }
  target.append(list);
}

function renderDonut(containerId, rows, centerLabel) {
  const target = $(containerId);
  const allItems = (Array.isArray(rows) ? rows : []).filter(item => item && typeof item.label === 'string' && Number.isFinite(item.count) && item.count > 0);
  const items = allItems.length > 6
    ? [...allItems.slice(0, 5), { label: 'Outros', count: allItems.slice(5).reduce((sum, item) => sum + item.count, 0) }]
    : allItems;
  const total = allItems.reduce((sum, item) => sum + item.count, 0);
  if (!total) { state(target, 'Os dados aparecerão após uma importação concluída.'); return; }
  target.replaceChildren();
  const layout = document.createElement('div');
  layout.className = 'donut-layout';
  const donut = document.createElement('div');
  donut.className = 'donut';
  const center = document.createElement('div');
  center.className = 'donut-center';
  const centerValue = document.createElement('strong');
  centerValue.textContent = number.format(total);
  const caption = document.createElement('small');
  caption.textContent = centerLabel;
  center.append(centerValue, caption);
  donut.append(center);
  let cursor = 0;
  const segments = [];
  const legend = document.createElement('ul');
  legend.className = 'legend';
  items.forEach((item, index) => {
    const next = cursor + item.count / total * 100;
    segments.push(`${palette[index]} ${cursor}% ${next}%`);
    cursor = next;
    const entry = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.setProperty('--dot', palette[index]);
    const label = document.createElement('span');
    label.className = 'legend-label';
    label.title = item.label;
    label.textContent = item.label;
    const percent = document.createElement('span');
    percent.className = 'legend-value';
    percent.textContent = `${percentNumber.format(item.count / total * 100)}%`;
    entry.append(dot, label, percent);
    legend.append(entry);
  });
  donut.style.background = `conic-gradient(${segments.join(', ')})`;
  layout.append(donut, legend);
  target.append(layout);
}

function renderPreview(preview, emptyText) {
  const tbody = $('preview-rows');
  tbody.replaceChildren();
  const rows = Array.isArray(preview?.rows) ? preview.rows : [];
  const visibleRows = rows.slice(0, 5);
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'empty-cell';
    td.textContent = emptyText;
    tr.append(td);
    tbody.append(tr);
  } else {
    for (const item of visibleRows) {
      const tr = document.createElement('tr');
      for (const key of ['nome', 'clinica', 'especialidade', 'permissao', 'situacao', 'ultimoLogin']) {
        const td = document.createElement('td');
        td.textContent = item[key] == null || item[key] === '' ? '—' : String(item[key]);
        tr.append(td);
      }
      tbody.append(tr);
    }
  }
  const total = preview?.total;
  $('preview-count').textContent = Number.isFinite(total) ? `Mostrando ${visibleRows.length} de ${number.format(total)} registros` : 'Nenhum lote importado';
}

function renderOverview(data) {
  const awaiting = data?.status === 'awaiting_import';
  const kpis = data?.kpis || {};
  const metric = (value, note) => Number.isFinite(value) && value >= 0 ? [number.format(value), note] : ['—', awaiting ? 'Aguardando importação' : 'Dado indisponível'];
  setMetric('metric-records', 'metric-records-note', ...metric(kpis.registros, 'Linhas do lote atual'));
  setMetric('metric-clinics', 'metric-clinics-note', ...metric(kpis.clinicas, 'Nomes distintos'));
  setMetric('metric-doctors', 'metric-doctors-note', ...metric(kpis.medicosUnicos, 'CPF válido e permissão Médico'));
  const importedAt = kpis.ultimaImportacao ? new Date(kpis.ultimaImportacao) : null;
  if (importedAt && Number.isFinite(importedAt.getTime())) {
    setMetric('metric-import', 'metric-import-note', new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(importedAt), 'Último lote concluído');
  } else {
    setMetric('metric-import', 'metric-import-note', awaiting ? 'Nenhum lote' : '—', awaiting ? 'Aguardando primeira importação' : 'Dado indisponível');
  }
  renderClinicChart(data?.charts?.medicosPorClinica);
  renderDonut('specialties-chart', data?.charts?.especialidades, 'médicos');
  renderDonut('situations-chart', data?.charts?.situacoes, 'registros');
  renderPreview(data?.preview, awaiting ? 'Nenhum registro importado ainda.' : 'Nenhum registro disponível.');
}

function renderError() {
  for (const [value, note] of [['metric-records', 'metric-records-note'], ['metric-clinics', 'metric-clinics-note'], ['metric-doctors', 'metric-doctors-note'], ['metric-import', 'metric-import-note']]) {
    setMetric(value, note, '—', 'Falha ao carregar');
  }
  for (const id of ['clinics-chart', 'specialties-chart', 'situations-chart']) state($(id), 'Não foi possível carregar os dados.');
  renderPreview(null, 'Não foi possível carregar os registros.');
  $('preview-count').textContent = 'Dados indisponíveis';
  alertMessage('Não foi possível carregar a Visão Geral. Use “Atualizar Base” para tentar novamente.');
}

async function loadOverview() {
  const button = $('refresh-data');
  button.disabled = true;
  alertMessage('');
  try {
    const response = await fetch('/api/dashboard', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { location.replace('/'); return; }
    if (!response.ok) throw new Error('Falha ao consultar dados.');
    renderOverview(await response.json());
  } catch {
    renderError();
  } finally {
    button.disabled = false;
  }
}

function changeQuery(changes) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  history.replaceState(null, '', url);
  return url.searchParams;
}

async function getData(path) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { location.replace('/'); return null; }
  if (!response.ok) throw new Error('Falha ao consultar dados.');
  return response.json();
}

function loadingRow(tbodyId, columns, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = columns;
  cell.className = 'empty-cell';
  cell.textContent = message;
  row.append(cell);
  $(tbodyId).replaceChildren(row);
}

function cell(row, value, href = null) {
  const td = document.createElement('td');
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = value || '—';
    td.append(link);
  } else td.textContent = value == null || value === '' ? '—' : String(value);
  row.append(td);
}

function pager(prefix, data) {
  const page = data.page || 1;
  const pages = data.pages || 1;
  $(`${prefix}-prev`).disabled = page <= 1;
  $(`${prefix}-next`).disabled = page >= pages;
  $(`${prefix}-page-label`).textContent = `Página ${page} de ${pages}`;
}

function clinicHref(key) {
  return `/dashboard/clinicas?${new URLSearchParams({ chave: key })}`;
}

function userHref(id) {
  return `/dashboard/usuarios?${new URLSearchParams({ id: String(id) })}`;
}

async function loadClinics() {
  const params = new URLSearchParams(location.search);
  $('clinics-search').value = params.get('q') || '';
  $('clinics-status').textContent = 'Carregando clínicas...';
  loadingRow('clinics-rows', 5, 'Carregando...');
  try {
    const data = await getData(`/api/clinicas?${params}`);
    if (!data) return;
    const rows = $('clinics-rows');
    rows.replaceChildren();
    if (!data.items.length) loadingRow('clinics-rows', 5, data.status === 'awaiting_import' ? 'Nenhum lote importado ainda.' : 'Nenhuma clínica encontrada para esta busca.');
    for (const item of data.items) {
      const tr = document.createElement('tr');
      cell(tr, item.nome, clinicHref(item.chave));
      cell(tr, number.format(item.registros));
      cell(tr, number.format(item.medicosUnicos));
      cell(tr, number.format(item.usuarios));
      cell(tr, item.ultimoLoginExibicao);
      rows.append(tr);
    }
    $('clinics-status').textContent = data.status === 'awaiting_import' ? 'Aguardando a primeira importação.' : `${number.format(data.total)} clínica(s) encontrada(s).`;
    $('clinics-count').textContent = data.status === 'awaiting_import' ? 'Nenhum lote importado' : `Mostrando ${data.items.length} de ${number.format(data.total)} clínicas`;
    pager('clinics', data);
  } catch {
    $('clinics-status').textContent = 'Não foi possível carregar as clínicas.';
    loadingRow('clinics-rows', 5, 'Tente novamente mais tarde.');
  }
}

function userRow(item, { includeClinic = true } = {}) {
  const tr = document.createElement('tr');
  cell(tr, item.nome, userHref(item.id));
  cell(tr, item.cpfMascarado);
  if (includeClinic) cell(tr, item.clinica, clinicHref(item.clinica));
  else cell(tr, item.crm);
  cell(tr, item.especialidade);
  cell(tr, item.permissao);
  cell(tr, item.situacao);
  cell(tr, item.ultimoLogin);
  return tr;
}

async function loadClinicDetail() {
  const params = new URLSearchParams(location.search);
  $('clinic-detail-status').textContent = 'Carregando vínculos...';
  loadingRow('clinic-people-rows', 7, 'Carregando...');
  try {
    const data = await getData(`/api/clinicas/detalhe?${params}`);
    if (!data) return;
    if (data.status === 'awaiting_import') {
      $('clinic-detail-status').textContent = 'Aguardando a primeira importação.';
      loadingRow('clinic-people-rows', 7, 'Nenhum lote importado ainda.');
      return;
    }
    const group = data.clinica;
    $('clinic-detail-title').textContent = group.nome;
    $('clinic-records').textContent = number.format(group.registros);
    $('clinic-doctors').textContent = number.format(group.medicosUnicos);
    $('clinic-people').textContent = number.format(group.usuarios);
    $('clinic-login').textContent = group.ultimoLoginExibicao;
    const originals = group.nomesOriginais.filter(Boolean);
    $('clinic-original-names').hidden = originals.length === 0;
    $('clinic-original-names').textContent = `Nome(s) original(is): ${originals.join(' · ')}`;
    $('clinic-variants').hidden = group.variantesSuspeitas.length === 0;
    $('clinic-variants').textContent = group.variantesSuspeitas.length ? `Possíveis variantes de nome não agrupadas automaticamente: ${group.variantesSuspeitas.join(' · ')}` : '';
    const rows = $('clinic-people-rows');
    rows.replaceChildren();
    if (!data.items.length) loadingRow('clinic-people-rows', 7, 'Nenhum vínculo nesta página.');
    for (const item of data.items) rows.append(userRow(item, { includeClinic: false }));
    $('clinic-detail-status').textContent = `${number.format(data.total)} vínculo(s) nesta clínica.`;
    $('clinic-detail-count').textContent = `Mostrando ${data.items.length} de ${number.format(data.total)} vínculos`;
    pager('clinic-detail', data);
  } catch {
    $('clinic-detail-status').textContent = 'Clínica não encontrada ou indisponível.';
    loadingRow('clinic-people-rows', 7, 'Não foi possível mostrar os vínculos.');
  }
}

function fillOptions(id, entries, selected, { clinic = false } = {}) {
  const select = $(id);
  select.replaceChildren(select.options[0]);
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = clinic ? entry.chave : entry;
    option.textContent = clinic ? entry.nome : entry;
    select.append(option);
  }
  select.value = selected || '';
}

async function loadUsers() {
  const params = new URLSearchParams(location.search);
  $('users-search').value = params.get('q') || '';
  $('users-status').textContent = 'Carregando usuários...';
  loadingRow('users-rows', 7, 'Carregando...');
  try {
    const data = await getData(`/api/usuarios?${params}`);
    if (!data) return;
    fillOptions('users-clinic', data.filters.clinicas, params.get('clinica'), { clinic: true });
    fillOptions('users-specialty', data.filters.especialidades, params.get('especialidade'));
    fillOptions('users-permission', data.filters.permissoes, params.get('permissao'));
    fillOptions('users-situation', data.filters.situacoes, params.get('situacao'));
    const rows = $('users-rows');
    rows.replaceChildren();
    if (!data.items.length) loadingRow('users-rows', 7, data.status === 'awaiting_import' ? 'Nenhum lote importado ainda.' : 'Nenhum usuário encontrado para estes filtros.');
    for (const item of data.items) rows.append(userRow(item));
    $('users-status').textContent = data.status === 'awaiting_import' ? 'Aguardando a primeira importação.' : `${number.format(data.total)} vínculo(s) encontrado(s).`;
    $('users-count').textContent = data.status === 'awaiting_import' ? 'Nenhum lote importado' : `Mostrando ${data.items.length} de ${number.format(data.total)} vínculos`;
    pager('users', data);
  } catch {
    $('users-status').textContent = 'Não foi possível carregar os usuários.';
    loadingRow('users-rows', 7, 'Tente novamente mais tarde.');
  }
}

async function loadUserDetail() {
  const id = new URLSearchParams(location.search).get('id');
  $('user-detail-status').textContent = 'Carregando detalhe...';
  $('user-fields').replaceChildren();
  try {
    const data = await getData(`/api/usuarios/detalhe?${new URLSearchParams({ id: id || '' })}`);
    if (!data) return;
    if (data.status === 'awaiting_import') {
      $('user-detail-status').textContent = 'Aguardando a primeira importação.';
      return;
    }
    const name = data.fields.find(field => field.label === 'Nome')?.value || 'Detalhe do usuário';
    $('user-detail-title').textContent = name;
    $('personal-restriction').hidden = !data.personalDataRestricted;
    const dl = $('user-fields');
    for (const field of data.fields) {
      const pair = document.createElement('div');
      const label = document.createElement('dt');
      label.textContent = field.label;
      const value = document.createElement('dd');
      value.textContent = field.value || 'Não informada';
      pair.append(label, value);
      if (field.original) {
        const original = document.createElement('small');
        original.textContent = `Valor original: ${field.original}`;
        pair.append(original);
      }
      dl.append(pair);
    }
    $('user-detail-status').textContent = '12 campos do vínculo importado.';
  } catch {
    $('user-detail-status').textContent = 'Usuário não encontrado ou indisponível.';
  }
}

async function init() {
  document.title = `${route.title} | Saúde Integrada`;
  document.querySelector(`[data-route="${route.key}"]`)?.setAttribute('aria-current', 'page');
  const query = new URLSearchParams(location.search);
  if (route.key === 'clinicas') {
    $('overview-page').hidden = true;
    $(query.has('chave') ? 'clinic-detail-page' : 'clinics-page').hidden = false;
  } else if (route.key === 'usuarios') {
    $('overview-page').hidden = true;
    $(query.has('id') ? 'user-detail-page' : 'users-page').hidden = false;
  } else if (route.key === 'importacoes') {
    $('overview-page').hidden = true;
    $('placeholder-page').hidden = false;
    $('placeholder-title').textContent = route.title;
    $('placeholder-message').textContent = route.message;
  }
  try {
    const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { location.replace('/'); return; }
    if (!response.ok) throw new Error();
    applyUser((await response.json()).user);
  } catch {
    alertMessage('Não foi possível carregar a sessão. Atualize a página para tentar novamente.');
    return;
  }
  if (route.key === 'overview') await loadOverview();
  else if (route.key === 'clinicas') await (query.has('chave') ? loadClinicDetail() : loadClinics());
  else if (route.key === 'usuarios') await (query.has('id') ? loadUserDetail() : loadUsers());
}

$('refresh-data').addEventListener('click', loadOverview);
$('clinics-form').addEventListener('submit', event => { event.preventDefault(); changeQuery({ q: $('clinics-search').value.trim(), page: 1 }); loadClinics(); });
$('clinics-clear').addEventListener('click', () => { changeQuery({ q: '', sort: '', order: '', page: '' }); loadClinics(); });
document.querySelectorAll('[data-clinic-sort]').forEach(button => button.addEventListener('click', () => {
  const sort = button.dataset.clinicSort;
  const params = new URLSearchParams(location.search);
  const order = params.get('sort') === sort && params.get('order') !== 'desc' ? 'desc' : 'asc';
  changeQuery({ sort, order, page: 1 });
  loadClinics();
}));
for (const [prefix, load] of [['clinics', loadClinics], ['clinic-detail', loadClinicDetail], ['users', loadUsers]]) {
  for (const [suffix, delta] of [['prev', -1], ['next', 1]]) {
    $(`${prefix}-${suffix}`).addEventListener('click', () => {
      const page = Number(new URLSearchParams(location.search).get('page') || 1);
      changeQuery({ page: Math.max(1, page + delta) });
      load();
    });
  }
}
$('users-form').addEventListener('submit', event => {
  event.preventDefault();
  changeQuery({ q: $('users-search').value.trim(), clinica: $('users-clinic').value, especialidade: $('users-specialty').value,
    permissao: $('users-permission').value, situacao: $('users-situation').value, page: 1 });
  loadUsers();
});
$('users-clear').addEventListener('click', () => {
  changeQuery({ q: '', clinica: '', especialidade: '', permissao: '', situacao: '', page: '' });
  loadUsers();
});
$('logout').addEventListener('click', async () => {
  const button = $('logout');
  button.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error();
    location.replace('/');
  } catch {
    alertMessage('Não foi possível encerrar a sessão. Tente novamente.');
    button.disabled = false;
  }
});

const sidebar = $('sidebar');
const backdrop = $('sidebar-backdrop');
function menu(open) {
  sidebar.classList.toggle('open', open);
  backdrop.hidden = !open;
  $('menu-toggle').setAttribute('aria-expanded', String(open));
}
$('menu-toggle').addEventListener('click', () => menu(!sidebar.classList.contains('open')));
backdrop.addEventListener('click', () => menu(false));
document.addEventListener('keydown', event => { if (event.key === 'Escape') menu(false); });

init();
