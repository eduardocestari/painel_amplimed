import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clinicDetail, clinicKey, groupClinics, listClinics, listUsers, maskCpf, userDetail, validCpf } from './registry.js';

const records = [
  { id: 1, nome: 'Profissional Um', email: 'um@example.test', cpf: '529.982.247-25', crm: 'CRM-A', especialidade: 'Cardiologia', permissao: 'Médico', perfil: 'Profissional', situacao: 'Cooperado', dataCriacaoOriginal: '01/03/2024', dtCriacao: '2024-03-01T10:00:00Z', clinica: ' Clínica Árvore ', usuclin: 'UC-1', ultimoLoginOriginal: '01/05/2024', dtUltimoLogin: '2024-05-01T12:00:00Z' },
  { id: 2, nome: 'Profissional Um', email: 'um@example.test', cpf: '52998224725', crm: 'CRM-A', especialidade: 'Cardiologia', permissao: 'Médico', perfil: 'Profissional', situacao: 'Cooperado', dataCriacaoOriginal: '02/03/2024', dtCriacao: '2024-03-02T10:00:00Z', clinica: 'CLÍNICA   ÁRVORE', usuclin: 'UC-2', ultimoLoginOriginal: '03/05/2024', dtUltimoLogin: '2024-05-03T12:00:00Z' },
  { id: 3, nome: 'Profissional Dois', email: 'dois@example.test', cpf: '111.444.777-35', crm: 'CRM-B', especialidade: 'Clínica Médica', permissao: 'Enfermeiro', perfil: 'Profissional', situacao: 'Cooperado', dataCriacaoOriginal: '28', dtCriacao: null, clinica: 'Clinica Arvore', usuclin: 'UC-9', ultimoLoginOriginal: '28', dtUltimoLogin: null },
  { id: 4, nome: 'Profissional Três', email: 'tres@example.test', cpf: '11111111111', crm: 'CRM-C', especialidade: 'Ortopedia', permissao: 'Médico', perfil: 'Profissional', situacao: 'Cooperado', dataCriacaoOriginal: '28', dtCriacao: null, clinica: 'Clínica Beta', usuclin: 'UC-3', ultimoLoginOriginal: '28', dtUltimoLogin: null },
];
const snapshot = { records };
const params = query => new URLSearchParams(query);

test('agrupa só por texto da clínica, preserva vínculos e aponta variantes suspeitas', () => {
  assert.equal(clinicKey('  Clínica   Árvore  '), 'CLÍNICA ÁRVORE');
  const groups = groupClinics(records);
  assert.equal(groups.length, 3);
  const alpha = groups.find(group => group.chave === 'CLÍNICA ÁRVORE');
  assert.equal(alpha.registros, 2);
  assert.equal(alpha.usuarios, 1);
  assert.equal(alpha.medicosUnicos, 1);
  assert.deepEqual(alpha.variantesSuspeitas, ['Clinica Arvore']);
  assert.deepEqual(alpha.nomesOriginais, [' Clínica Árvore ', 'CLÍNICA   ÁRVORE']);
  assert.equal(alpha.ultimoLogin, '2024-05-03T12:00:00.000Z');
  const beta = groups.find(group => group.chave === 'CLÍNICA BETA');
  assert.equal(beta.medicosUnicos, 0);
  assert.equal(beta.ultimoLoginExibicao, 'Não informada');
});

test('busca, ordenação e filtros são aplicados no servidor sem deduplicar linhas', () => {
  const clinics = listClinics(snapshot, params('q=%C3%A1rvore&sort=registros&order=desc'));
  assert.equal(clinics.total, 1);
  assert.equal(clinics.items[0].registros, 2);
  const byClinic = listUsers(snapshot, params('clinica=CL%C3%8DNICA%20%C3%81RVORE'));
  assert.equal(byClinic.total, 2);
  assert.deepEqual(byClinic.items.map(item => item.id), [1, 2]);
  const filtered = listUsers(snapshot, params('q=CRM-B&especialidade=Cl%C3%ADnica%20M%C3%A9dica&permissao=Enfermeiro&situacao=Cooperado'));
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].id, 3);
  assert.equal(filtered.items[0].cpfMascarado, '***.***.777-**');
  assert.equal(listUsers(snapshot, params('q=CRM-C')).items[0].cpfMascarado, 'Inválido ou não informado');
  assert.throws(() => listUsers(snapshot, params('page=0')), /Parâmetros/);
});

test('detalhe mantém 12 campos e só libera CPF e e-mail com permissão', () => {
  assert.equal(validCpf('529.982.247-25'), '52998224725');
  assert.equal(validCpf('11111111111'), null);
  assert.equal(validCpf('CPF: 52998224725'), null);
  assert.equal(maskCpf('529.982.247-25'), '***.***.247-**');
  const clinic = clinicDetail(snapshot, params('chave=CL%C3%8DNICA%20%C3%81RVORE'));
  assert.equal(clinic.total, 2);
  const restricted = userDetail(snapshot, 3);
  assert.equal(restricted.fields.length, 12);
  assert.equal(restricted.fields.find(field => field.label === 'Email').value, 'Acesso restrito');
  assert.equal(restricted.fields.find(field => field.label === 'Último login').value, 'Não informada');
  assert.equal(restricted.fields.find(field => field.label === 'Último login').original, '28');
  const allowed = userDetail(snapshot, 1, { canViewPersonal: true });
  assert.equal(allowed.fields.find(field => field.label === 'CPF').value, '529.982.247-25');
  assert.equal(allowed.fields.find(field => field.label === 'Email').value, 'um@example.test');
});

test('paginação mantém todos os vínculos e só envia a página solicitada', () => {
  const larger = { records: Array.from({ length: 11 }, (_, index) => ({ ...records[0], id: index + 1 })) };
  const first = listUsers(larger, params('size=10&page=1'));
  const second = listUsers(larger, params('size=10&page=2'));
  assert.equal(first.total, 11);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].id, 11);
});
