import { groupClinics, normalizedText, validCpf } from './registry.js';

const isDoctor = value => normalizedText(value).normalize('NFD').replace(/\p{M}/gu, '') === 'MEDICO';
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export function getDashboardOverview(snapshot = null) {
  if (!snapshot) return {
    status: 'awaiting_import', asOf: null,
    kpis: { registros: null, clinicas: null, medicosUnicos: null, ultimaImportacao: null },
    charts: { medicosPorClinica: [], especialidades: [], situacoes: [] },
    preview: { total: null, rows: [] },
  };
  const records = snapshot.records;
  const clinics = groupClinics(records);
  const doctors = new Set();
  const specialties = new Map();
  const situations = new Map();
  for (const record of records) {
    const situation = record.situacao || 'Não informada';
    situations.set(situation, (situations.get(situation) || 0) + 1);
    const cpf = validCpf(record.cpf);
    if (!cpf || !isDoctor(record.permissao)) continue;
    doctors.add(cpf);
    const specialty = record.especialidade || 'Não informada';
    const set = specialties.get(specialty) || new Set();
    set.add(cpf);
    specialties.set(specialty, set);
  }
  const sortCounts = (a, b) => b.count - a.count || collator.compare(a.label, b.label);
  return {
    status: 'ready', asOf: snapshot.completedAt,
    kpis: { registros: records.length, clinicas: clinics.length, medicosUnicos: doctors.size,
      ultimaImportacao: snapshot.completedAt },
    charts: {
      medicosPorClinica: clinics.map(group => ({ clinica: group.nome, medicosUnicos: group.medicosUnicos }))
        .sort((a, b) => b.medicosUnicos - a.medicosUnicos || collator.compare(a.clinica, b.clinica)).slice(0, 5),
      especialidades: [...specialties].map(([label, set]) => ({ label, count: set.size })).sort(sortCounts),
      situacoes: [...situations].map(([label, count]) => ({ label, count })).sort(sortCounts),
    },
    preview: { total: records.length, rows: records.slice(0, 5).map(record => ({ nome: record.nome,
      clinica: record.clinica, especialidade: record.especialidade, permissao: record.permissao,
      situacao: record.situacao, ultimoLogin: record.dtUltimoLogin ? record.ultimoLoginOriginal : 'Não informada' })) },
  };
}
