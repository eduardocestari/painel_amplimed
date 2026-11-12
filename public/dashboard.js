const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('pt-BR');
const percentNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const palette = ['#00975f', '#7dcc47', '#965be6', '#c3a3f6', '#839df1', '#d7e0e4'];
const routes = {
  '/dashboard': { key: 'overview', title: 'Visão Geral' },
  '/dashboard/clinicas': { key: 'clinicas', title: 'Clínicas', message: 'A busca e os detalhes das clínicas serão adicionados na etapa 03.' },
  '/dashboard/usuarios': { key: 'usuarios', title: 'Usuários', message: 'A lista e os filtros de usuários serão adicionados na etapa 03.' },
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

async function init() {
  document.title = `${route.title} | Saúde Integrada`;
  document.querySelector(`[data-route="${route.key}"]`)?.setAttribute('aria-current', 'page');
  if (route.key !== 'overview') {
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
}

$('refresh-data').addEventListener('click', loadOverview);
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
