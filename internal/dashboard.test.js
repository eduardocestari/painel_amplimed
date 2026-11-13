import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDashboardOverview } from './dashboard.js';

test('indicadores e gráficos refletem vínculos reais do snapshot e CPF válido', () => {
  const snapshot = { completedAt: '2026-11-12T15:00:00Z', records: [
    { nome: 'Primeira Pessoa', cpf: '529.982.247-25', permissao: 'Médico', clinica: 'Clínica Árvore',
      especialidade: 'Cardiologia', situacao: 'Cooperado', ultimoLoginOriginal: '28', dtUltimoLogin: null },
    { nome: 'Primeira Pessoa', cpf: '52998224725', permissao: 'Médico', clinica: 'CLÍNICA   ÁRVORE',
      especialidade: 'Cardiologia', situacao: 'Cooperado', ultimoLoginOriginal: '01/05/2024', dtUltimoLogin: '2024-05-01T12:00:00' },
    { nome: 'Outra Pessoa', cpf: '11111111111', permissao: 'Médico', clinica: 'Clínica Beta',
      especialidade: 'Ortopedia', situacao: 'Cooperado', ultimoLoginOriginal: '', dtUltimoLogin: null },
  ] };
  const overview = getDashboardOverview(snapshot);
  assert.equal(overview.status, 'ready');
  assert.equal(overview.kpis.registros, 3);
  assert.equal(overview.kpis.clinicas, 2);
  assert.equal(overview.kpis.medicosUnicos, 1);
  assert.equal(overview.charts.especialidades[0].count, 1);
  assert.deepEqual(overview.charts.situacoes, [{ label: 'Cooperado', count: 3 }]);
  assert.equal(overview.preview.rows[0].ultimoLogin, 'Não informada');
});
