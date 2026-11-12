const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const pageSizes = new Set([10, 20, 50]);

export class BadRequest extends Error {
  constructor() { super('Parâmetros de consulta inválidos.'); this.status = 400; }
}

const raw = value => value == null ? '' : String(value);
export const normalizedText = value => raw(value).trim().replace(/\s+/gu, ' ').toLocaleUpperCase('pt-BR');
export const clinicKey = value => normalizedText(value);

export function validCpf(value) {
  const original = raw(value).trim();
  if (!/^[\d.\-\s]+$/.test(original)) return null;
  const cpf = original.replace(/\D/gu, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return null;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index);
    const digit = (sum * 10) % 11 % 10;
    if (digit !== Number(cpf[length])) return null;
  }
  return cpf;
}

export function maskCpf(value) {
  const cpf = validCpf(value);
  return cpf ? `***.***.${cpf.slice(6, 9)}-**` : 'Inválido ou não informado';
}

const isDoctor = value => normalizedText(value).normalize('NFD').replace(/\p{M}/gu, '') === 'MEDICO';
const fingerprint = value => normalizedText(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');

function validDate(value) {
  const text = raw(value);
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (!parts) return null;
  const calendar = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (calendar.getUTCFullYear() !== Number(parts[1]) || calendar.getUTCMonth() + 1 !== Number(parts[2]) || calendar.getUTCDate() !== Number(parts[3])) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

const dateLabel = value => { const date = validDate(value); return date ? dateFormat.format(date) : 'Não informada'; };

function parseQuery(params, { sortFields, defaultSort = 'nome' }) {
  const q = raw(params.get('q')).trim();
  const page = Number(params.get('page') || 1);
  const size = Number(params.get('size') || 20);
  const sort = params.get('sort') || defaultSort;
  const order = params.get('order') || 'asc';
  if (q.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !pageSizes.has(size)
    || !sortFields.includes(sort) || !['asc', 'desc'].includes(order)) throw new BadRequest();
  return { q, page, size, sort, order };
}

function page(items, options) {
  const start = (options.page - 1) * options.size;
  return { total: items.length, page: options.page, size: options.size, pages: Math.max(1, Math.ceil(items.length / options.size)), items: items.slice(start, start + options.size) };
}

function compare(a, b, order = 'asc') {
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(raw(a), raw(b));
  return order === 'desc' ? -result : result;
}

export function groupClinics(records) {
  const groups = new Map();
  for (const record of records) {
    const key = clinicKey(record.clinica);
    let group = groups.get(key);
    if (!group) {
      group = { chave: key, nome: raw(record.clinica).trim() || 'Clínica não informada', nomesOriginais: new Set(), registros: 0,
        people: new Set(), doctors: new Set(), lastLoginMs: null, ultimoLogin: null, fingerprints: fingerprint(key), records: [] };
      groups.set(key, group);
    }
    group.nomesOriginais.add(raw(record.clinica));
    group.registros++;
    group.records.push(record);
    const cpf = validCpf(record.cpf);
    if (cpf) {
      group.people.add(cpf);
      if (isDoctor(record.permissao)) group.doctors.add(cpf);
    }
    const date = validDate(record.dtUltimoLogin);
    if (date && (group.lastLoginMs === null || date.getTime() > group.lastLoginMs)) {
      group.lastLoginMs = date.getTime();
      group.ultimoLogin = date.toISOString();
    }
  }
  const byFingerprint = new Map();
  for (const group of groups.values()) {
    if (!group.fingerprints) continue;
    const bucket = byFingerprint.get(group.fingerprints) || [];
    bucket.push(group);
    byFingerprint.set(group.fingerprints, bucket);
  }
  return [...groups.values()].map(group => ({
    chave: group.chave,
    nome: group.nome,
    nomesOriginais: [...group.nomesOriginais],
    registros: group.registros,
    usuarios: group.people.size,
    medicosUnicos: group.doctors.size,
    ultimoLogin: group.ultimoLogin,
    ultimoLoginExibicao: dateLabel(group.ultimoLogin),
    variantesSuspeitas: (byFingerprint.get(group.fingerprints) || []).filter(other => other.chave !== group.chave).map(other => other.nome),
    records: group.records,
    lastLoginMs: group.lastLoginMs,
  }));
}

function clinicPublic(group) {
  const { records, lastLoginMs, ...summary } = group;
  return summary;
}

export function listClinics(snapshot, params) {
  const options = parseQuery(params, { sortFields: ['nome', 'registros', 'medicosUnicos', 'usuarios', 'ultimoLogin'] });
  if (!snapshot) return { status: 'awaiting_import', ...page([], options) };
  const term = normalizedText(options.q);
  const groups = groupClinics(snapshot.records).filter(group => !term || normalizedText(group.nome).includes(term));
  groups.sort((a, b) => {
    const av = options.sort === 'ultimoLogin' ? (a.lastLoginMs ?? -1) : a[options.sort];
    const bv = options.sort === 'ultimoLogin' ? (b.lastLoginMs ?? -1) : b[options.sort];
    return compare(av, bv, options.order) || collator.compare(a.nome, b.nome);
  });
  return { status: 'ready', ...page(groups.map(clinicPublic), options) };
}

function listUser(record) {
  return {
    id: record.id,
    nome: raw(record.nome),
    clinica: raw(record.clinica),
    especialidade: raw(record.especialidade),
    crm: raw(record.crm),
    permissao: raw(record.permissao),
    situacao: raw(record.situacao),
    cpfMascarado: maskCpf(record.cpf),
    ultimoLogin: dateLabel(record.dtUltimoLogin),
  };
}

function uniqueOptions(records, field) {
  const byKey = new Map();
  for (const record of records) {
    const value = raw(record[field]).trim();
    const key = normalizedText(value);
    if (key && !byKey.has(key)) byKey.set(key, value);
  }
  return [...byKey.values()].sort(collator.compare);
}

export function listUsers(snapshot, params) {
  const options = parseQuery(params, { sortFields: ['nome', 'clinica', 'especialidade', 'ultimoLogin'] });
  const filters = { clinicas: [], especialidades: [], permissoes: [], situacoes: [] };
  if (!snapshot) return { status: 'awaiting_import', ...page([], options), filters };
  const records = snapshot.records;
  filters.clinicas = groupClinics(records).filter(group => group.chave).map(group => ({ chave: group.chave, nome: group.nome })).sort((a, b) => collator.compare(a.nome, b.nome));
  filters.especialidades = uniqueOptions(records, 'especialidade');
  filters.permissoes = uniqueOptions(records, 'permissao');
  filters.situacoes = uniqueOptions(records, 'situacao');
  const clinic = normalizedText(params.get('clinica'));
  const specialty = normalizedText(params.get('especialidade'));
  const permission = normalizedText(params.get('permissao'));
  const situation = normalizedText(params.get('situacao'));
  if ([clinic, specialty, permission, situation].some(value => value.length > 250)) throw new BadRequest();
  const term = normalizedText(options.q);
  const matched = records.filter(record => (!clinic || clinicKey(record.clinica) === clinic)
    && (!specialty || normalizedText(record.especialidade) === specialty)
    && (!permission || normalizedText(record.permissao) === permission)
    && (!situation || normalizedText(record.situacao) === situation)
    && (!term || [record.nome, record.crm, record.especialidade].some(value => normalizedText(value).includes(term))));
  matched.sort((a, b) => {
    const av = options.sort === 'ultimoLogin' ? (validDate(a.dtUltimoLogin)?.getTime() ?? -1) : a[options.sort];
    const bv = options.sort === 'ultimoLogin' ? (validDate(b.dtUltimoLogin)?.getTime() ?? -1) : b[options.sort];
    return compare(av, bv, options.order) || compare(a.id, b.id);
  });
  return { status: 'ready', ...page(matched.map(listUser), options), filters };
}

export function clinicDetail(snapshot, params) {
  if (!snapshot) return { status: 'awaiting_import' };
  const key = params.get('chave');
  if (key === null || key.length > 500) throw new BadRequest();
  const options = parseQuery(params, { sortFields: ['nome'], defaultSort: 'nome' });
  const group = groupClinics(snapshot.records).find(item => item.chave === clinicKey(key));
  if (!group) return null;
  const people = [...group.records].sort((a, b) => compare(a.nome, b.nome) || compare(a.id, b.id));
  return { status: 'ready', clinica: clinicPublic(group), ...page(people.map(listUser), options) };
}

function dateField(original, iso) {
  const date = validDate(iso);
  return { value: date ? dateFormat.format(date) : 'Não informada', original: raw(original) };
}

export function userDetail(snapshot, id, { canViewPersonal = false } = {}) {
  if (!snapshot) return { status: 'awaiting_import' };
  const numberId = Number(id);
  if (!Number.isSafeInteger(numberId) || numberId < 1) throw new BadRequest();
  const record = snapshot.records.find(item => item.id === numberId);
  if (!record) return null;
  return {
    status: 'ready',
    id: record.id,
    personalDataRestricted: !canViewPersonal,
    fields: [
      { label: 'Nome', value: raw(record.nome) },
      { label: 'Email', value: canViewPersonal ? raw(record.email) : 'Acesso restrito' },
      { label: 'CPF', value: canViewPersonal ? raw(record.cpf) : maskCpf(record.cpf) },
      { label: 'CRM', value: raw(record.crm) },
      { label: 'Especialidade', value: raw(record.especialidade) },
      { label: 'Permissão', value: raw(record.permissao) },
      { label: 'Perfil', value: raw(record.perfil) },
      { label: 'Situação', value: raw(record.situacao) },
      { label: 'Data de Criação', ...dateField(record.dataCriacaoOriginal, record.dtCriacao) },
      { label: 'Clínica', value: raw(record.clinica) },
      { label: 'Usuclin', value: raw(record.usuclin) },
      { label: 'Último login', ...dateField(record.ultimoLoginOriginal, record.dtUltimoLogin) },
    ],
  };
}

export function createRegistry({ readSnapshot = async () => null } = {}) {
  const snapshot = async () => {
    const value = await readSnapshot();
    if (value !== null && (!value || !Array.isArray(value.records))) throw new Error('Fonte de dados indisponível.');
    return value;
  };
  return {
    listClinics: async params => listClinics(await snapshot(), params),
    clinicDetail: async params => clinicDetail(await snapshot(), params),
    listUsers: async params => listUsers(await snapshot(), params),
    userDetail: async (id, options) => userDetail(await snapshot(), id, options),
  };
}
